import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import './helpers/outer-sandbox.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { auditPage } from '../src/audit.js';

test('restricted browser audits explicit loopback exception through authenticated proxy', {timeout:30000},async t=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><button></button><a href="/next">Next</a></main></body></html>');});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const report=await auditPage(url,{network:{allowPrivateOrigins:[url]},crawl:{maxLinksPerPage:20}});
 assert.ok(report.violations.some(rule=>rule.id==='button-name'));assert.equal(report.network.policyVersion,2);
 assert.deepEqual(report.discovery.links,[url+'/next']);assert.ok(report.network.transferBytes>0);
});

test('production restricted launch requests Chromium sandbox and never falls back',async()=>{
 let launches=0;
 await assert.rejects(auditPage('https://example.org',{network:{},launch:async options=>{
  launches++;assert.equal(options.chromiumSandbox,true);assert.equal(options.proxy.bypass,'<-loopback>');
  throw new Error('sandbox unavailable');
 }}),/sandbox unavailable/);
 assert.equal(launches,1);
});

test('browser traffic cannot bypass scope via redirect, subresource, POST or WebSocket', {timeout:90000},async t=>{
 let forbiddenHits=0;const forbidden=http.createServer((req,res)=>{forbiddenHits++;res.end('private');});
 forbidden.listen(0,'127.0.0.1');await once(forbidden,'listening');t.after(()=>new Promise(r=>forbidden.close(r)));
 const forbiddenUrl=`http://127.0.0.1:${forbidden.address().port}`;
 const actionHits=[];
 const server=http.createServer((req,res)=>{
  actionHits.push(req.url);
  if(req.url==='/redirect'){res.writeHead(302,{Location:forbiddenUrl});res.end();return;}
  if(req.url.startsWith('/loop')){const n=Number(new URL(req.url,'http://fixture').searchParams.get('n')||0);res.writeHead(302,{Location:'/loop?n='+(n+1)});res.end();return;}
  res.setHeader('Content-Type','text/html');
  const attack=['/resource','/private-resource'].includes(req.url)?`<img src="${forbiddenUrl}/secret" alt="test">`:
   req.url==='/socket'?`<script>new WebSocket('${forbiddenUrl.replace('http:','ws:')}/socket')</script>`:
   req.url==='/post'?`<script>fetch('/action',{method:'POST'}).catch(()=>{})</script>`:
   req.url==='/requests'?'<img src="/image" alt="test">':'';
  res.end(`<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Test</h1>${attack}</main></body></html>`);
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}`,network={allowPrivateOrigins:[origin]};
 for(const path of ['/redirect','/resource','/socket','/post']) await t.test(path,async()=>{
  await assert.rejects(auditPage(origin+path,{network}),/Restricted audit incomplete/);
 });
 await t.test('declared resource origin still cannot reach a private address without an exception',async()=>{
  await assert.rejects(auditPage(origin+'/private-resource',{network:{...network,resourceOrigins:[forbiddenUrl],allowedPorts:[80,443,forbidden.address().port]}}),/Private or special-purpose/);
 });
 await t.test('redirect count is bounded',async()=>{
  await assert.rejects(auditPage(origin+'/loop',{network,crawl:{maxRedirects:1,maxLinksPerPage:20}}),/Redirect budget/);
 });
 await t.test('request count is bounded',async()=>{
  await assert.rejects(auditPage(origin+'/requests',{network,crawl:{maxRequestsPerPage:1,maxLinksPerPage:20}}),/Request budget/);
 });
 assert.equal(forbiddenHits,0);assert.ok(!actionHits.includes('/action'));assert.ok(!actionHits.includes('/image'));
});

test('HTTPS redirects are stopped before following an excess hop', {timeout:30000},async t=>{
 const key=await readFile(new URL('./fixtures/localhost-test-key.pem',import.meta.url));
 const cert=await readFile(new URL('./fixtures/localhost-cert.pem',import.meta.url));let hits=0;
 const server=https.createServer({key,cert},(req,res)=>{hits++;res.writeHead(302,{Location:'/next?n='+hits});res.end();});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const origin=`https://127.0.0.1:${server.address().port}`;
 // Only this fixture trusts its own public test certificate; product TLS validation stays on.
 const launch=async options=>{
  const browser=await chromium.launch(options);
  return {newContext:settings=>browser.newContext({...settings,ignoreHTTPSErrors:true}),close:()=>browser.close()};
 };
 await assert.rejects(auditPage(origin,{launch,network:{allowPrivateOrigins:[origin]},crawl:{maxRedirects:1,maxLinksPerPage:10}}),/Redirect budget/);
 assert.equal(hits,2);
});
test('unsupported blob workers cannot produce a clean restricted report', {timeout:30000},async t=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><title>Worker</title></head><body><main><h1>Worker</h1><script>new Worker(URL.createObjectURL(new Blob(["setInterval(()=>{},100)"])))</script></main></body></html>');});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 await assert.rejects(auditPage(origin,{network:{allowPrivateOrigins:[origin]}}),/workers/);
});
