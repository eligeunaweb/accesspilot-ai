import {auditPage} from '../src/audit.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import './helpers/outer-sandbox.js';
import AxeBuilder from '@axe-core/playwright';
import { createRequestMediator } from '../src/request-mediator.js';

// Transport compatibility only: this browser is NOT running inside network=none.
// This offline host test is not OS containment; the optional Docker backend has separate real CI acceptance.
test('offline Chromium mediates every redirect, gzip body, HttpOnly cookie and asset', {timeout:30000},async t=>{
  const received=[];
  const server=http.createServer((req,res)=>{
    received.push({path:req.url,cookie:req.headers.cookie});
    if(req.url==='/start') {res.writeHead(302,{Location:'/page','Set-Cookie':['session=fixture; HttpOnly; SameSite=Lax','language=es; SameSite=Lax']});res.end();return;}
    if(req.url==='/asset.js') {res.setHeader('Content-Type','text/javascript');res.end('document.querySelector("h1").textContent="Mediated fixture";');return;}
    if(req.url==='/page') {
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Encoding':'gzip'});
      res.end(gzipSync('<!doctype html><html lang="en"><head><title>Mediated</title></head><body><main><h1>Loading</h1><script src="/asset.js"></script></main></body></html>'));return;
    }
    res.writeHead(204);res.end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const mediator=createRequestMediator([origin],{allowPrivateOrigins:[origin]});t.after(()=>mediator.close());
  const mediated=[];
  const report=await auditPage(origin+'/start',{network:{allowPrivateOrigins:[origin]},mediate:request=>{mediated.push(new URL(request.url).pathname);return mediator.fetch(request);},
    launch:async options=>{
      const browser=await chromium.launch(options),create=browser.newContext.bind(browser);
      browser.newContext=async opts=>{const context=await create(opts);await context.setOffline(true);return context;};return browser;
    },analyze:async page=>{
      assert.equal(page.url(),origin+'/page');assert.equal(await page.locator('h1').textContent(),'Mediated fixture');
      const cookies=await page.context().cookies();assert.ok(cookies.some(cookie=>cookie.name==='session'&&cookie.value==='fixture'&&cookie.httpOnly));assert.ok(cookies.some(cookie=>cookie.name==='language'&&cookie.value==='es'));
      return new AxeBuilder({page}).analyze();
    }});
  assert.ok(received.find(entry=>entry.path==='/page').cookie.includes('session=fixture'));assert.ok(received.find(entry=>entry.path==='/asset.js').cookie.includes('session=fixture'));
  for(const path of ['/start','/page','/asset.js'])assert.ok(mediated.includes(path),'Unmediated request: '+path);
  assert.equal(report.network.policyVersion,3);assert.equal(mediator.failed,false);assert.ok(mediator.bytes>0);
});


test('audit service performs real axe through mediated CDP fulfillment and marks policy 3', {timeout:30000},async t=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><button></button></main></body></html>');});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const origin=`http://127.0.0.1:${server.address().port}`,network={allowPrivateOrigins:[origin]};
  const mediator=createRequestMediator([origin],network);t.after(()=>mediator.close());
  const report=await auditPage(origin,{network,mediate:mediator.fetch});
  assert.ok(report.violations.some(rule=>rule.id==='button-name'));assert.equal(report.network.policyVersion,3);assert.equal(mediator.failed,false);
});


test('offline mediated iframe auditing accepts same-origin frames and fails closed on cross-origin frames', {timeout:30000},async t=>{
  let forbiddenHits=0;const foreign=http.createServer((req,res)=>{forbiddenHits++;res.end('foreign');});foreign.listen(0,'127.0.0.1');await once(foreign,'listening');t.after(()=>{foreign.closeAllConnections();return new Promise(resolve=>foreign.close(resolve));});
  const foreignOrigin=`http://127.0.0.1:${foreign.address().port}`;
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.url==='/frame'?'<html lang="en"><title>Frame</title><h2>Frame</h2><button></button></html>':`<html lang="en"><title>Fixture</title><main><h1>Fixture</h1><iframe title="Fixture frame" src="${req.url==='/foreign'?foreignOrigin:'/frame'}"></iframe></main></html>`);});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const origin=`http://127.0.0.1:${server.address().port}`,network={allowPrivateOrigins:[origin,foreignOrigin]},scopeUrls=[origin,foreignOrigin];
  const launch=async options=>{const browser=await chromium.launch(options),create=browser.newContext.bind(browser);browser.newContext=async opts=>{const context=await create(opts);await context.setOffline(true);return context;};return browser;};
  const mediator=createRequestMediator(scopeUrls,network);t.after(()=>mediator.close());
  const report=await auditPage(origin,{network,scopeUrls,launch,mediate:mediator.fetch});assert.ok(report.violations.some(rule=>rule.id==='button-name'));
  await assert.rejects(auditPage(origin+'/foreign',{network,scopeUrls,launch,mediate:mediator.fetch}));assert.equal(forbiddenHits,0);
});
