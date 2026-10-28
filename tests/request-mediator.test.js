import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createRequestMediator } from '../src/request-mediator.js';

async function fixture(t, handler, {tls=false, hostname='127.0.0.1'}={}) {
  const credentials=tls?{key:await readFile(new URL('./fixtures/localhost-test-key.pem',import.meta.url)),cert:await readFile(new URL('./fixtures/localhost-cert.pem',import.meta.url))}:{};
  const server=tls?https.createServer(credentials,handler):http.createServer(handler);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const origin=`${tls?'https':'http'}://${hostname}:${server.address().port}`;
  return {origin,network:{allowPrivateOrigins:[origin]},ca:credentials.cert};
}
const request=(url,options={})=>({url,method:'GET',navigation:true,headers:{},...options});
function mediator(t,f,options={}) {
  const transport=createRequestMediator([f.origin],f.network,options);t.after(()=>transport.close());return transport;
}

test('mediator pins DNS once, preserves origin Host, strips undeclared request and hop headers',async t=>{
  let received,lookups=0;
  const f=await fixture(t,(req,res)=>{received=req.headers;res.writeHead(200,{'Connection':'x-internal','X-Internal':'private','Set-Cookie':['a=1; HttpOnly','b=2; SameSite=Lax']});res.end('fixture');},{hostname:'fixture.test'});
  const m=mediator(t,f,{lookup:async()=>{lookups++;return [{address:'127.0.0.1',family:4}];}});
  const result=await m.fetch(request(f.origin+'/path',{headers:{Cookie:'session=operator',Authorization:'Bearer fixture','Proxy-Authorization':'secret','X-Host-Secret':'secret',Host:'evil.example'}}));
  assert.equal(result.status,200);assert.equal(Buffer.from(result.body,'base64').toString(),'fixture');
  assert.equal(received.host,new URL(f.origin).host);assert.equal(received.cookie,'session=operator');assert.equal(received.authorization,'Bearer fixture');
  assert.equal(received['proxy-authorization'],undefined);assert.equal(received['x-host-secret'],undefined);
  assert.equal(result.headers['x-internal'],undefined);assert.equal(result.headers['content-length'],undefined);
  assert.equal(result.headers['set-cookie'],'a=1; HttpOnly\nb=2; SameSite=Lax');assert.equal(lookups,1);assert.equal(m.requests,1);assert.equal(m.bytes,7);
});

test('compressed response bytes and encoding are preserved without unbounded decompression',async t=>{
  const data=gzipSync('compressed fixture');const f=await fixture(t,(_,res)=>{res.writeHead(200,{'Content-Encoding':'gzip'});res.end(data);});
  const m=mediator(t,f);const result=await m.fetch(request(f.origin));
  assert.equal(result.headers['content-encoding'],'gzip');assert.equal(gunzipSync(Buffer.from(result.body,'base64')).toString(),'compressed fixture');assert.equal(m.bytes,data.length);
});

test('HTTPS authenticates original hostname while connecting to pinned numeric address',async t=>{
  let host;const f=await fixture(t,(req,res)=>{host=req.headers.host;res.end('TLS fixture');},{tls:true,hostname:'localhost'});
  const m=mediator(t,f,{ca:f.ca,lookup:async()=>[{address:'127.0.0.1',family:4}]});
  assert.equal(Buffer.from((await m.fetch(request(f.origin))).body,'base64').toString(),'TLS fixture');assert.equal(host,new URL(f.origin).host);
});

for(const trusted of [false,true]) test(`HTTPS rejects ${trusted?'trusted certificate for wrong hostname':'untrusted certificate'}`,async t=>{
  let hits=0;const f=await fixture(t,(_,res)=>{hits++;res.end('must not disclose');},{tls:true,hostname:trusted?'wrong.test':'localhost'});
  const m=mediator(t,f,{...(trusted?{ca:f.ca}:{}),lookup:async()=>[{address:'127.0.0.1',family:4}]});
  await assert.rejects(m.fetch(request(f.origin)),/denied/);assert.equal(hits,0);assert.equal(m.failed,true);
});

for(const method of ['POST','CONNECT','PUT','DELETE','get']) test(`mediator rejects ${method} before opening a socket and remains closed`,async t=>{
  let hits=0;const f=await fixture(t,(_,res)=>{hits++;res.end();});const m=mediator(t,f);
  await assert.rejects(m.fetch(request(f.origin,{method})),/denied/);await assert.rejects(m.fetch(request(f.origin)),/denied/);assert.equal(hits,0);assert.equal(m.failed,true);
});

test('private DNS answer denied unless exact origin explicitly authorized',async t=>{
  let lookups=0;const m=createRequestMediator(['https://public.test'],{}, {lookup:async()=>{lookups++;return [{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}];}});t.after(()=>m.close());
  await assert.rejects(m.fetch(request('https://public.test')),/denied/);assert.equal(lookups,1);assert.equal(m.failed,true);
});

test('out-of-scope navigation and credential-bearing URLs fail before DNS',async t=>{
  for(const url of ['https://other.test','https://user:password@target.test']) {
    const m=createRequestMediator(['https://target.test'],{}, {lookup:()=>assert.fail('must not resolve')});t.after(()=>m.close());
    await assert.rejects(m.fetch(request(url)),/denied/);
  }
});

test('resource origin permission does not permit navigation',async t=>{
  const m=createRequestMediator(['https://target.test'],{resourceOrigins:['https://resource.test']},{lookup:()=>assert.fail('must not resolve')});t.after(()=>m.close());
  await assert.rejects(m.fetch(request('https://resource.test')),/denied/);
});

test('redirects are checked before their body is returned; allowed redirects consume global budget',async t=>{
  const f=await fixture(t,(req,res)=>{res.writeHead(302,{Location:req.url==='/escape'?'http://169.254.169.254/':'/next'});res.end('redirect');});
  const m=mediator(t,f,{maxRedirects:1});assert.equal((await m.fetch(request(f.origin))).status,302);
  await assert.rejects(m.fetch(request(f.origin)),/denied/);assert.equal(m.failed,true);
  const denied=mediator(t,f);await assert.rejects(denied.fetch(request(f.origin+'/escape')),/denied/);
});

test('request and aggregate byte exhaustion close all later requests',async t=>{
  let hits=0;const f=await fixture(t,(_,res)=>{hits++;res.end('12345');});
  const count=mediator(t,f,{maxRequests:1});await count.fetch(request(f.origin));await assert.rejects(count.fetch(request(f.origin)));assert.equal(hits,1);
  const bytes=mediator(t,f,{maxBytes:7});await bytes.fetch(request(f.origin));await assert.rejects(bytes.fetch(request(f.origin)));await assert.rejects(bytes.fetch(request(f.origin)));assert.equal(hits,3);assert.equal(bytes.failed,true);
});

test('response deadline interrupts trickling data, rather than resetting on each byte',async t=>{
  const f=await fixture(t,(_,res)=>{res.writeHead(200);const interval=setInterval(()=>res.write('x'),10);res.once('close',()=>clearInterval(interval));});
  const m=mediator(t,f,{timeoutMs:80});await assert.rejects(m.fetch(request(f.origin)),/denied/);assert.equal(m.failed,true);
});

test('cancelled DNS cannot connect when the resolver eventually finishes',async t=>{
  let finish,hits=0;const f=await fixture(t,(_,res)=>{hits++;res.end();},{hostname:'fixture.test'});const controller=new AbortController();
  const m=mediator(t,f,{signal:controller.signal,lookup:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=m.fetch(request(f.origin));await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(pending);
  finish([{address:'127.0.0.1',family:4}]);await new Promise(resolve=>setImmediate(resolve));assert.equal(hits,0);
});

test('four active requests maximum; cancellation rejects pending and active work',async t=>{
  let hits=0,notify;const admitted=new Promise(resolve=>notify=resolve);
  const f=await fixture(t,()=>{if(++hits===4)notify();});const controller=new AbortController();const m=mediator(t,f,{signal:controller.signal});
  // Attach rejection handlers before cancellation so no promise is left unobserved.
  const pending=Promise.allSettled(Array.from({length:12},()=>m.fetch(request(f.origin))));
  await admitted;await new Promise(resolve=>setTimeout(resolve,30));assert.equal(hits,4);controller.abort();
  const results=await pending;assert.ok(results.every(value=>value.status==='rejected'));assert.equal(hits,4);
});

test('queue overflow fails closed without opening additional sockets',async t=>{
  const f=await fixture(t,()=>{});const m=mediator(t,f);
  const results=await Promise.allSettled(Array.from({length:69},()=>m.fetch(request(f.origin))));assert.ok(results.every(value=>value.status==='rejected'));assert.equal(m.failed,true);
});

test('invalid budgets and malformed headers are rejected',async t=>{
  for(const options of [{maxRequests:0},{maxBytes:NaN},{maxRedirects:-1},{timeoutMs:120001}]) assert.throws(()=>createRequestMediator(['https://target.test'],{},options),/Invalid mediator/);
  for(const headers of [[],null,{'x-test':'line\r\ninjection'},Object.fromEntries(Array.from({length:101},(_,i)=>['x-'+i,'v'])),{'x-test':'x'.repeat(17000)}]) {
    const m=createRequestMediator(['https://target.test'],{}, {lookup:()=>assert.fail('must not resolve')});t.after(()=>m.close());await assert.rejects(m.fetch(request('https://target.test',{headers})),/denied/);
  }
});


test('absolute lifetime cancels unresolved DNS and permanently denies later connections',async t=>{
  let finish,hits=0;const f=await fixture(t,(_,res)=>{hits++;res.end();},{hostname:'fixture.test'});
  const m=mediator(t,f,{maxDurationMs:40,lookup:()=>new Promise(resolve=>{finish=resolve;})});
  await assert.rejects(m.fetch(request(f.origin)),/denied/);assert.equal(m.failed,true);
  finish([{address:'127.0.0.1',family:4}]);await assert.rejects(m.fetch(request(f.origin)),/denied/);assert.equal(hits,0);
});

test('abruptly truncated upstream response cannot produce successful evidence',async t=>{
  const f=await fixture(t,(_,res)=>{res.writeHead(200,{'Content-Length':'100'});res.write('partial');setImmediate(()=>res.destroy());});
  const m=mediator(t,f);await assert.rejects(m.fetch(request(f.origin)),/denied/);assert.equal(m.failed,true);
});
