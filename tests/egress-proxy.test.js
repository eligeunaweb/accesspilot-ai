import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { createNetworkPolicy } from '../src/network-policy.js';
import { startEgressProxy } from '../src/egress-proxy.js';
function authorization(proxy){return 'Basic '+Buffer.from(proxy.username+':'+proxy.password).toString('base64');}
function request(proxy,url,{auth=true,method='GET'}={}) {
 return new Promise((resolve,reject)=>{
  const req=http.request(proxy.server,{path:url,method,headers:auth?{'Proxy-Authorization':authorization(proxy)}:{}},res=>{
   let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body}));res.on('error',reject);
  });req.on('error',reject);req.setTimeout(3000,()=>req.destroy(new Error('test timeout')));req.end();
 });
}
test('proxy authenticates and blocks private destinations before connecting',async t=>{
 let hits=0;const server=http.createServer((req,res)=>{hits++;res.end('secret');});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const proxy=await startEgressProxy(createNetworkPolicy([origin],{allowedPorts:[server.address().port]}));t.after(()=>proxy.close());
 assert.equal((await request(proxy,origin,{auth:false})).status,407);
 assert.equal((await request(proxy,origin)).status,403);assert.equal(hits,0);
 assert.match(proxy.failures.join(),/blocked/);
});
test('explicit private exception is confined to its exact origin, strips proxy credentials',async t=>{
 const received=[];const server=http.createServer((req,res)=>{received.push(req.headers);res.end('fixture');});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://fixture.test:${server.address().port}`;
 let lookups=0;const proxy=await startEgressProxy(createNetworkPolicy([origin],{allowPrivateOrigins:[origin]}),{
  lookup:async()=>{lookups++;return [{address:'127.0.0.1',family:4}];}
 });t.after(()=>proxy.close());
 assert.deepEqual(await request(proxy,origin+'/path'),{status:200,body:'fixture'});
 assert.equal(received[0].host,`fixture.test:${server.address().port}`);assert.equal(received[0]['proxy-authorization'],undefined);assert.equal(lookups,1);
 assert.equal((await request(proxy,`http://127.0.0.1:${server.address().port}`)).status,403);
 assert.equal((await request(proxy,origin,{method:'POST'})).status,403);assert.equal(received.length,1);
});
test('transfer budget terminates oversized responses and records the failure',async t=>{
 const server=http.createServer((req,res)=>res.end('X'.repeat(4096)));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const proxy=await startEgressProxy(createNetworkPolicy([origin],{allowPrivateOrigins:[origin]}),{maxBytes:32});t.after(()=>proxy.close());
 await assert.rejects(request(proxy,origin));assert.match(proxy.failures.join(),/budget/);
});
test('CONNECT tunnels use the same policy and are closed with the proxy',async t=>{
 const echo=net.createServer(socket=>socket.pipe(socket));echo.listen(0,'127.0.0.1');await once(echo,'listening');t.after(()=>new Promise(r=>echo.close(r)));
 const origin=`https://127.0.0.1:${echo.address().port}`;
 const proxy=await startEgressProxy(createNetworkPolicy([origin],{allowPrivateOrigins:[origin]}));t.after(()=>proxy.close());
 const socket=net.connect(Number(new URL(proxy.server).port),'127.0.0.1');socket.on('error',()=>{});await once(socket,'connect');
 socket.write(`CONNECT 127.0.0.1:${echo.address().port} HTTP/1.1\r\nHost: 127.0.0.1\r\nProxy-Authorization: ${authorization(proxy)}\r\n\r\n`);
 assert.match((await once(socket,'data'))[0].toString(),/200 Connection Established/);
 socket.write('pinned tunnel');assert.equal((await once(socket,'data'))[0].toString(),'pinned tunnel');
 const closed=once(socket,'close');await proxy.close();await closed;
});
