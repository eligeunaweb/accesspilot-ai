import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { resolveTarget, createNetworkPolicy } from '../src/network-policy.js';
import { startEgressProxy } from '../src/egress-proxy.js';

function auth(proxy) {return 'Basic '+Buffer.from(proxy.username+':'+proxy.password).toString('base64');}
function request(proxy,url,method='GET') {
  return new Promise((resolve,reject)=>{
    const req=http.request(proxy.server,{path:url,method,agent:false,headers:{'Proxy-Authorization':auth(proxy)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));res.on('error',reject);});
    req.on('error',reject);req.setTimeout(2000,()=>req.destroy(new Error('Test timeout')));req.end();
  });
}
async function fixture(t) {
  let hits=0;const server=http.createServer((req,res)=>{hits++;res.end(req.url==='/large'?'x'.repeat(8192):'ok');});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;return {origin,policy:createNetworkPolicy([origin],{allowPrivateOrigins:[origin]}),hits:()=>hits};
}
test('DNS validates complete bounded answer sets and actual address families',async()=>{
  const policy=createNetworkPolicy(['https://example.org']);
  for(const answer of [[],Array(65).fill({address:'1.1.1.1',family:4}),[{address:'1.1.1.1',family:6}],[null],[{address:'127.0.0.1',family:4},{address:'1.1.1.1',family:4}]]) {
    await assert.rejects(resolveTarget('https://example.org',policy,{lookup:async()=>answer}));
  }
  assert.equal((await resolveTarget('https://example.org',policy,{lookup:async()=>[{address:'2606:4700:4700::1111',family:6}]})).family,6);
});
test('DNS deadline and cancellation reject stalled resolvers and ignore late answers',async()=>{
  const policy=createNetworkPolicy(['https://example.org']);let release;
  await assert.rejects(resolveTarget('https://example.org',policy,{timeoutMs:10,lookup:()=>new Promise(resolve=>release=resolve)}),/deadline/);release([{address:'1.1.1.1',family:4}]);
  const controller=new AbortController();const result=resolveTarget('https://example.org',policy,{signal:controller.signal,lookup:()=>new Promise(()=>{})});controller.abort();await assert.rejects(result);
  await assert.rejects(resolveTarget('https://example.org',policy,{timeoutMs:0}),/timeout/);
});
test('transport request exhaustion stays closed and never reaches targets again',async t=>{
  const f=await fixture(t),proxy=await startEgressProxy(f.policy,{maxRequests:1});t.after(()=>proxy.close());
  assert.equal(await request(proxy,f.origin),200);await request(proxy,f.origin).catch(()=>null);
  assert.equal(await request(proxy,f.origin),403);assert.equal(f.hits(),1);assert.match(proxy.failures.join(),/request budget/);
});
test('transfer exhaustion is latched before later DNS or network activity',async t=>{
  const f=await fixture(t),proxy=await startEgressProxy(f.policy,{maxBytes:64});t.after(()=>proxy.close());
  await assert.rejects(request(proxy,f.origin+'/large'));assert.equal(await request(proxy,f.origin),403);assert.equal(f.hits(),1);assert.match(proxy.failures.join(),/Transfer budget/);
});
test('absolute proxy deadline cancels pending DNS and rejects later requests',async t=>{
  const f=await fixture(t),origin=f.origin.replace('127.0.0.1','fixture.invalid'),policy=createNetworkPolicy([origin],{allowPrivateOrigins:[origin]});
  let release,started;const pending=new Promise(resolve=>started=resolve);
  const proxy=await startEgressProxy(policy,{maxDurationMs:50,lookup:()=>new Promise(resolve=>{release=resolve;started();})});t.after(()=>proxy.close());
  const first=request(proxy,origin).catch(()=>null);await pending;await first;release([{address:'127.0.0.1',family:4}]);
  assert.equal(await request(proxy,origin),403);assert.equal(f.hits(),0);assert.match(proxy.failures.join(),/absolute deadline/);
});
test('CONNECT shares transport admission budget with HTTP and cannot open after exhaustion',async t=>{
  const f=await fixture(t),proxy=await startEgressProxy(f.policy,{maxRequests:1});t.after(()=>proxy.close());await request(proxy,f.origin);
  const socket=net.connect(Number(new URL(proxy.server).port),'127.0.0.1');socket.on('error',()=>{});await once(socket,'connect');
  const closed=once(socket,'close');socket.write(`CONNECT 127.0.0.1:443 HTTP/1.1\r\nProxy-Authorization: ${auth(proxy)}\r\n\r\n`);await closed;
  assert.match(proxy.failures.join(),/request budget/);assert.equal(f.hits(),1);
});
test('invalid proxy budgets fail before allocating a listener',async()=>{
  const policy=createNetworkPolicy(['https://example.org']);
  for(const options of [{maxBytes:0},{maxConnections:129},{maxRequests:1001},{timeoutMs:0},{maxDurationMs:0},{maxRedirects:-1}]) await assert.rejects(startEgressProxy(policy,options),/Invalid proxy/);
});
test('active slow responses cannot extend the absolute proxy lifetime',async t=>{
  const server=http.createServer((req,res)=>{
    res.writeHead(200);res.flushHeaders();const timer=setInterval(()=>res.write('alive'),10);res.once('close',()=>clearInterval(timer));
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,proxy=await startEgressProxy(createNetworkPolicy([origin],{allowPrivateOrigins:[origin]}),{maxDurationMs:500});t.after(()=>proxy.close());
  await assert.rejects(request(proxy,origin));assert.match(proxy.failures.join(),/absolute deadline/);assert.equal(await request(proxy,origin),403);
});
