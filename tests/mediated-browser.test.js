import {auditPage} from '../src/audit.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import './helpers/outer-sandbox.js';
import { createRequestMediator } from '../src/request-mediator.js';

// Transport compatibility only: this browser is NOT running inside network=none.
// Production auditPage still uses its existing authenticated egress proxy.
test('real Chromium consumes mediated redirects, gzip, HttpOnly cookies and assets', {timeout:30000},async t=>{
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
  const browser=await chromium.launch({headless:true,chromiumSandbox:true});t.after(()=>browser.close());
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  const failures=[];
  await context.route('**/*',async route=>{
    const req=route.request();
    try {
      const response=await mediator.fetch({url:req.url(),method:req.method(),navigation:req.isNavigationRequest(),headers:await req.allHeaders()});
      await route.fulfill({...response,body:Buffer.from(response.body,'base64')});
    } catch(error){failures.push(error.message);await route.abort().catch(()=>{});}
  });
  const page=await context.newPage();const response=await page.goto(origin+'/start');
  assert.equal(response.status(),200);assert.equal(page.url(),origin+'/page');assert.equal(await page.locator('h1').textContent(),'Mediated fixture');
  const cookies=await context.cookies();assert.ok(cookies.some(cookie=>cookie.name==='session'&&cookie.value==='fixture'&&cookie.httpOnly));assert.ok(cookies.some(cookie=>cookie.name==='language'&&cookie.value==='es'));
  assert.ok(received.find(entry=>entry.path==='/page').cookie.includes('session=fixture'));assert.ok(received.find(entry=>entry.path==='/asset.js').cookie.includes('session=fixture'));
  assert.deepEqual(failures,[]);assert.equal(mediator.failed,false);assert.ok(mediator.bytes>0);
});


test('audit service performs real axe through mediated route fulfillment and marks policy 3', {timeout:30000},async t=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><button></button></main></body></html>');});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const origin=`http://127.0.0.1:${server.address().port}`,network={allowPrivateOrigins:[origin]};
  const mediator=createRequestMediator([origin],network);t.after(()=>mediator.close());
  const report=await auditPage(origin,{network,mediate:mediator.fetch});
  assert.ok(report.violations.some(rule=>rule.id==='button-name'));assert.equal(report.network.policyVersion,3);assert.equal(mediator.failed,false);
});
