import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {checkViewerRequest,createLocalServiceGuard} from '../src/local-service-guard.js';
import {startHistoryViewer} from '../src/viewer.js';
import {saveHistory} from '../src/history.js';
import {richFixture} from './fixtures/rich-history.js';

class Response extends EventEmitter {
  destroyed=false;
  destroy(){this.destroyed=true;this.emit('close');}
}
function finish(res,lease){res.emit('finish');lease.done();}

test('admitted work holds slots until response finish as well as work completion',()=>{
  const guard=createLocalServiceGuard({maxActive:1}),res=new Response(),{lease}=guard.admit(res);
  assert.equal(lease.reserve('report'),true);lease.done();
  assert.deepEqual(guard.snapshot(),{active:1,pendingBytes:6,closed:false});
  assert.equal(guard.admit(new Response()).status,503);
  res.emit('finish');res.emit('close');lease.done();
  assert.deepEqual(guard.snapshot(),{active:0,pendingBytes:0,closed:false});guard.close();
});

test('disconnect frees queued bytes but cannot bypass in-flight work admission',()=>{
  const guard=createLocalServiceGuard({maxActive:1}),res=new Response(),{lease}=guard.admit(res);
  lease.reserve('report');res.destroy();
  assert.deepEqual(guard.snapshot(),{active:1,pendingBytes:0,closed:false});
  assert.equal(guard.admit(new Response()).status,503);lease.done();assert.equal(guard.snapshot().active,0);guard.close();
});

test('UTF-8 response and aggregate pending-body budgets reject overrun without double reservation',()=>{
  const guard=createLocalServiceGuard({maxActive:2,maxResponseBytes:8,maxPendingBytes:10}),a=new Response(),b=new Response();
  const one=guard.admit(a).lease,two=guard.admit(b).lease;
  assert.equal(one.reserve('ñññ'),true);assert.equal(two.reserve('123456789'),false);assert.equal(two.reserve('12345'),false);
  assert.equal(two.reserve('1234'),true);assert.equal(two.reserve('x'),false);assert.equal(guard.snapshot().pendingBytes,10);
  finish(a,one);finish(b,two);assert.equal(guard.snapshot().pendingBytes,0);guard.close();
});

test('rate tokens span sockets and refill with bounded elapsed time',()=>{
  let instant=0;const guard=createLocalServiceGuard({burst:2,refillPerSecond:1},{now:()=>instant});
  for(let i=0;i<2;i++){const res=new Response();finish(res,guard.admit(res).lease);}
  assert.equal(guard.admit(new Response()).status,429);instant=1000;
  const res=new Response(),admission=guard.admit(res);assert.equal(admission.status,200);finish(res,admission.lease);guard.close();
});

test('absolute deadline and shutdown destroy slow responses without pretending unfinished work ended',async()=>{
  const guard=createLocalServiceGuard({lifetimeMs:20}),res=new Response(),{lease}=guard.admit(res);lease.reserve('pending');
  await delay(40);assert.equal(res.destroyed,true);assert.equal(guard.snapshot().active,1);assert.equal(guard.snapshot().pendingBytes,0);
  lease.done();guard.close();assert.equal(guard.admit(new Response()).status,503);assert.equal(guard.snapshot().active,0);
});

test('limits can only reduce defaults and reject unknown/prototype options',()=>{
  for(const limits of [null,[],{maxActive:5},{burst:121},{lifetimeMs:0},{maxPendingBytes:65*1024*1024},{constructor:1},{toString:1}])assert.throws(()=>createLocalServiceGuard(limits),/Invalid/);
});

async function fixture(t,limits) {
  const root=await mkdtemp(join(tmpdir(),'accesspilot-service-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const input=richFixture(),id=await saveHistory(root,input),viewer=await startHistoryViewer({root,project:input.project,limits});
  t.after(()=>viewer.close());return {viewer,id};
}
async function raw(url,headers,{method='GET',body=''}={}) {
  const target=new URL(url),socket=createConnection({host:'127.0.0.1',port:Number(target.port)});let data='';
  socket.setEncoding('utf8');socket.on('data',chunk=>data+=chunk);
  socket.on('error',()=>{});const closed=once(socket,'close');
  await once(socket,'connect');socket.end(`${method} ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\nConnection: close\r\n${headers}\r\n${body}`);await closed;
  return Number(/^HTTP\/1\.1 (\d+)/.exec(data)?.[1]);
}

test('real HTTP rejects duplicate security headers, invalid Fetch Metadata and GET payloads',async t=>{
  const {viewer}=await fixture(t),origin=new URL(viewer.url).origin;
  assert.equal(await raw(viewer.url,`Host: ${new URL(viewer.url).host}\r\n`),400);
  assert.equal(await raw(viewer.url,`Origin: ${origin}\r\nOrigin: ${origin}\r\n`),400);
  assert.equal(await raw(viewer.url,'Sec-Fetch-Site: same-origin\r\nSec-Fetch-Site: same-origin\r\n'),400);
  for(const value of ['invalid','same-site','cross-site'])assert.equal(await raw(viewer.url,'Sec-Fetch-Site: '+value+'\r\n'),403);
  assert.equal(await raw(viewer.url,'Content-Length: 1\r\n',{body:'x'}),400);
  assert.equal(await raw(viewer.url,'Transfer-Encoding: chunked\r\n',{body:'0\r\n\r\n'}),400);
  const good=await fetch(viewer.url,{headers:{'Sec-Fetch-Site':'none'}});assert.equal(good.status,200);await good.text();
});

test('real HTTP refuses Expect, CONNECT and protocol upgrade without opening a tunnel',async t=>{
  const {viewer}=await fixture(t);
  assert.equal(await raw(viewer.url,'Expect: 100-continue\r\nContent-Length: 1\r\n',{body:'x'}),417);
  assert.equal(await raw(viewer.url,'Expect: unexpected\r\n'),417);
  assert.equal(await raw(viewer.url,'Upgrade: websocket\r\n'),400);
  assert.equal(await raw(viewer.url,'Connection: Upgrade\r\nUpgrade: websocket\r\n'),400);
  assert.equal(await raw(viewer.url,'',{method:'CONNECT'}),400);
});

test('viewer returns bounded generic overloads and keeps existing response hardening headers',async t=>{
  const {viewer,id}=await fixture(t,{maxResponseBytes:1});
  const response=await fetch(viewer.url+'?'+new URLSearchParams({run:id,download:'json'}));
  assert.equal(response.status,503);assert.equal(response.headers.get('content-disposition'),null);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);assert.equal(await response.text(),'Response budget exceeded');
});

test('real rate budget rejects extra local work with Retry-After',async t=>{
  const {viewer}=await fixture(t,{burst:1,refillPerSecond:1});
  const first=await fetch(viewer.url);assert.equal(first.status,200);await first.text();
  const next=await fetch(viewer.url);assert.equal(next.status,429);assert.equal(next.headers.get('retry-after'),'1');await next.text();
});

test('request validation remains read-only and validates credentials before useful work',()=>{
  const origin='http://127.0.0.1:1234',session='/secret/';
  const req={method:'GET',url:session,headers:{host:'127.0.0.1:1234'},rawHeaders:[]};
  assert.equal(checkViewerRequest(req,origin,session),0);
  assert.equal(checkViewerRequest({...req,url:'/other/'},origin,session),404);
  assert.equal(checkViewerRequest({...req,method:'POST'},origin,session),405);
  assert.equal(checkViewerRequest({...req,headers:{...req.headers,origin:'null'}},origin,session),403);
});

test('real throttled HTTP response keeps admission and reserved bytes until disconnect', {timeout:15000},async t=>{
  const guard=createLocalServiceGuard({maxActive:1}),payload='x'.repeat(32*1024*1024);
  let ready,closed;const observed=new Promise(resolve=>ready=resolve),responseClosed=new Promise(resolve=>closed=resolve);
  const server=createServer((req,res)=>{
    const admission=guard.admit(res);
    if(!admission.lease){res.writeHead(admission.status);res.end('busy');return;}
    const body=req.url==='/large'?payload:'ready';
    assert.equal(admission.lease.reserve(body),true);
    if(req.url==='/large')res.once('close',closed);
    if(req.url==='/large') {
      let offset=0;res.writeHead(200);res.flushHeaders();
      const timer=setInterval(()=>{
        if(res.destroyed){clearInterval(timer);return;}
        res.write(body.slice(offset,offset+65536));offset+=65536;
        if(offset>=body.length){clearInterval(timer);res.end();}
      },20);
      res.once('close',()=>clearInterval(timer));
      admission.lease.done();ready({finished:res.writableFinished});
    } else {res.end(body);admission.lease.done();}
  });
  let socket;t.after(async()=>{socket?.destroy();guard.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});});
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  socket=createConnection({host:'127.0.0.1',port:server.address().port});socket.on('error',()=>{});socket.pause();await once(socket,'connect');
  socket.write(`GET /large HTTP/1.1\r\nHost: 127.0.0.1:${server.address().port}\r\nConnection: close\r\n\r\n`);
  const waiting=await observed;assert.equal(waiting.finished,false,JSON.stringify(waiting));assert.equal(guard.snapshot().pendingBytes,32*1024*1024);
  const blocked=await fetch(origin+'/small');assert.equal(blocked.status,503);await blocked.text();
  socket.destroy();await responseClosed;assert.equal(guard.snapshot().active,0);assert.equal(guard.snapshot().pendingBytes,0);
  const resumed=await fetch(origin+'/small');assert.equal(resumed.status,200);assert.equal(await resumed.text(),'ready');
});

test('HTTP parser and request target reject oversized input before history work',async t=>{
  const {viewer}=await fixture(t);
  assert.equal(await raw(viewer.url,'X-Fill: '+'x'.repeat(9000)+'\r\n'),431);
  assert.equal(await raw(viewer.url+'?q='+'x'.repeat(2100),''),404);
});
