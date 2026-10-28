import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startWebJobTransport} from '../src/web-job-transport.js';
import {createWebJobContract} from '../src/web-job-contract.js';
import {createWebJobSupervisor} from '../src/web-job-supervisor.js';
import {listHistory} from '../src/history.js';

const workspace={schemaVersion:1,name:'HTTP',projects:[{schemaVersion:1,name:'Fixture',urls:['https://fixture.example']}]};
async function fixture(t,limits={},wrap=x=>x) {
  let contract;
  const service=await startWebJobTransport({workspace},{limits,createSupervisor:async options=>{
    contract=createWebJobContract(options);return wrap({...contract,submit:async(...args)=>contract.submit(...args),cancel:async(...args)=>contract.cancel(...args)});
  }});t.after(()=>service.close());return {service,contract,credentials:service.openSession()};
}
function command(service){return {schemaVersion:1,projectId:service.projects()[0].id,requestId:randomUUID()};}
function call(service,credentials,{path='/api/v1/jobs',method='POST',body=command(service),headers={}}={}) {
  const bytes=method==='GET'||body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(body));
  return new Promise((resolve,reject)=>{
    const req=http.request(service.origin+path,{method,agent:false,headers:{origin:service.origin,authorization:'Bearer '+credentials.token,
      'x-accesspilot-csrf':credentials.csrf,'content-type':'application/json','content-length':String(bytes.length),...headers}},res=>{
      const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks))}));res.on('error',reject);
    });req.on('error',reject);req.end(bytes);
  });
}
function raw(service,request,{keepOpen=false}={}) {
  return new Promise((resolve,reject)=>{
    let result='';const socket=net.connect(new URL(service.origin).port,'127.0.0.1',()=>{socket.write(request);if(!keepOpen)socket.end();});
    socket.setTimeout(3000,()=>socket.destroy(new Error('Raw fixture timed out')));
    socket.on('data',x=>result+=x.toString());socket.on('error',reject);socket.on('close',()=>resolve(result));
  });
}
test('HTTP admission is authenticated, owner scoped and idempotent; cancellation is a closed command',async t=>{
  const {service,credentials}=await fixture(t),body=command(service);
  const [a,b]=await Promise.all([call(service,credentials,{body}),call(service,credentials,{body})]);
  assert.equal(a.status,202);assert.equal(a.body.id,b.body.id);assert.deepEqual(Object.keys(a.body).sort(),['id','projectId','state']);
  const path='/api/v1/jobs/'+a.body.id;
  const status=await call(service,credentials,{path,method:'GET',body:null,headers:{'content-length':'0'}});
  assert.equal(status.status,200);assert.equal(status.headers['cache-control'],'no-store');assert.equal(status.headers['access-control-allow-origin'],undefined);
  assert.equal((await call(service,service.openSession(),{path,method:'GET',body:null,headers:{'content-length':'0'}})).status,404);
  assert.equal((await call(service,credentials,{path:'/api/v1/cancellations',body:{schemaVersion:1,jobId:a.body.id}})).body.state,'cancelled');
  service.revokeSession(credentials);assert.equal((await call(service,credentials,{body})).status,403);
});
test('HTTP rejects foreign origins, CSRF, secrets, arbitrary routes, method changes and configuration injection',async t=>{
  const {service,credentials}=await fixture(t);
  for(const headers of [{origin:'https://foreign.example'},{host:'evil.example'},{'x-accesspilot-csrf':'0'.repeat(64)},{authorization:'Bearer '+'0'.repeat(64)},{'sec-fetch-site':'cross-site'}])
    assert.equal((await call(service,credentials,{headers})).status,403);
  for(const path of ['/openSession','/inspect','/api/v1/jobs?token=secret','/api/v1/jobs/unknown','/api/v1/jobs/%30'.repeat(2)] )assert.equal((await call(service,credentials,{path})).status,404);
  assert.equal((await call(service,credentials,{method:'PUT'})).status,405);
  assert.equal((await call(service,credentials,{body:{...command(service),imageId:'latest'}})).status,400);
  assert.equal((await call(service,credentials,{headers:{'content-encoding':'gzip'}})).status,415);
});
test('raw HTTP rejects duplicate credentials, Expect, tunnels and oversized bodies before admission',async t=>{
  const {service,credentials,contract}=await fixture(t),host=new URL(service.origin).host;
  const base=`Host: ${host}\r\nOrigin: ${service.origin}\r\nAuthorization: Bearer ${credentials.token}\r\nX-Accesspilot-Csrf: ${credentials.csrf}\r\nContent-Type: application/json\r\n`;
  assert.match(await raw(service,`POST /api/v1/jobs HTTP/1.1\r\n${base}Authorization: Bearer ${credentials.token}\r\nContent-Length: 2\r\n\r\n{}`),/ 400 /);
  assert.match(await raw(service,`POST /api/v1/jobs HTTP/1.1\r\n${base}Content-Length: 4097\r\n\r\n`),/ 413 /);
  assert.match(await raw(service,`POST /api/v1/jobs HTTP/1.1\r\n${base}Content-Length: 2\r\nExpect: 100-continue\r\n\r\n`),/ 417 /);
  assert.equal(await raw(service,`CONNECT example.com:443 HTTP/1.1\r\nHost: ${host}\r\n\r\n`),'');
  assert.equal(await raw(service,`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`),'');
  assert.equal(contract.snapshot().records,0);
});
test('incomplete authenticated bodies have an absolute deadline and never admit work',async t=>{
  const {service,credentials,contract}=await fixture(t,{bodyMs:150}),host=new URL(service.origin).host;
  const response=await raw(service,`POST /api/v1/jobs HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${service.origin}\r\nAuthorization: Bearer ${credentials.token}\r\nX-Accesspilot-Csrf: ${credentials.csrf}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`,{keepOpen:true});
  assert.match(response,/ 408 /);assert.equal(contract.snapshot().records,0);
});
test('socket, header and URL bounds reject work before admission',async t=>{
  const limited=await fixture(t,{maxSockets:1});
  const occupied=net.connect(new URL(limited.service.origin).port,'127.0.0.1');occupied.on('error',()=>{});
  try {
    await once(occupied,'connect');
    await assert.rejects(call(limited.service,limited.credentials),error=>['ECONNRESET','EPIPE'].includes(error.code));
  } finally {const closed=once(occupied,'close');occupied.destroy();await closed;}
  await limited.service.close();
  const {service,credentials,contract}=await fixture(t),host=new URL(service.origin).host;
  assert.equal(await raw(service,`POST /api/v1/jobs HTTP/1.1\r\nHost: ${host}\r\nX-Large: ${'x'.repeat(9000)}\r\n\r\n`),'');
  assert.equal((await call(service,credentials,{path:'/'+ 'a'.repeat(512)})).status,431);
  assert.equal(contract.snapshot().records,0);
});
test('global rate limit rejects without creating unbounded client buckets',async t=>{
  const {service,credentials,contract}=await fixture(t,{burst:1,refillPerSecond:1});
  assert.equal((await call(service,credentials,{path:'/unknown'})).status,404);
  assert.equal((await call(service,credentials)).status,429);assert.equal(contract.snapshot().records,0);
});
test('disconnection during body upload never admits a partial command',async t=>{
  const {service,credentials,contract}=await fixture(t),host=new URL(service.origin).host;
  await raw(service,`POST /api/v1/jobs HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${service.origin}\r\nAuthorization: Bearer ${credentials.token}\r\nX-Accesspilot-Csrf: ${credentials.csrf}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`);
  assert.equal(contract.snapshot().records,0);
});
test('response expiry cannot free capacity or undo an admission still committing',async t=>{
  let release,entered;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
  const {service,credentials,contract}=await fixture(t,{maxActive:1,responseMs:150},model=>({...model,submit:async(...args)=>{entered();await gate;return model.submit(...args);}}));
  try {
    const response=call(service,credentials).then(value=>assert.equal(value.status,504),error=>assert.ok(['ECONNRESET','ERR_STREAM_PREMATURE_CLOSE'].includes(error.code)));await ready;await response;
    assert.equal((await call(service,credentials)).status,503);assert.equal(contract.snapshot().records,0);
  } finally {release();}
  await service.close();assert.equal(contract.snapshot().records,1);
});
test('active admission capacity remains held after client disconnect until the handler settles',async t=>{
  let entered,release;const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const {service,credentials}=await fixture(t,{maxActive:1},contract=>({...contract,close:()=>{release();contract.close();},submit:async(...args)=>{entered();await gate;return contract.submit(...args);}}));
  const bytes=JSON.stringify(command(service));
  const req=http.request(service.origin+'/api/v1/jobs',{method:'POST',headers:{origin:service.origin,authorization:'Bearer '+credentials.token,'x-accesspilot-csrf':credentials.csrf,'content-type':'application/json','content-length':Buffer.byteLength(bytes)}});
  req.on('error',()=>{});req.end(bytes);await ready;req.destroy();
  try {assert.equal((await call(service,credentials)).status,503);}finally {release();}
});
test('trusted transport initialization failures release the bound socket; limits cannot be enlarged',async()=>{
  let origin;
  await assert.rejects(startWebJobTransport({workspace},{createSupervisor:async options=>{origin=options.origin;throw new Error('fixture');}}),/fixture/);
  await assert.rejects(call({origin,projects:()=>[{id:'a'.repeat(64)}]},{token:'a',csrf:'b'}),/ECONNREFUSED/);
  for(const limits of [{maxActive:5},{bodyMs:10001},{unknown:1}])await assert.rejects(startWebJobTransport({workspace},{limits}));
});
test('HTTP reaches real queue/history and close waits for running page cleanup before releasing ownership',async t=>{
  const root=await mkdtemp(join(tmpdir(),'accesspilot-http-'));let release,started;
  const ready=new Promise(resolve=>started=resolve);let supervisor;
  const service=await startWebJobTransport({workspace,directory:join(root,'jobs'),resourceDirectory:join(root,'resources'),historyRoot:join(root,'history'),imageId:'sha256:'+'a'.repeat(64)},
    {createSupervisor:async options=>supervisor=await createWebJobSupervisor(options,{auditPage:async(url,{signal})=>{started(signal);await new Promise(resolve=>release=resolve);return {schemaVersion:1,kind:'page-audit',url,engine:{name:'axe-core',version:'fixture'},violations:[]};}})});
  t.after(async()=>{release?.();await service.close();await rm(root,{recursive:true,force:true});});
  const credentials=service.openSession(),job=await call(service,credentials);assert.equal(job.status,202);const signal=await ready;
  let ended=false;const closing=service.close().then(()=>ended=true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(signal.aborted,true);assert.equal(ended,false);assert.equal(supervisor.inspect().queue.active,1);
  release();await closing;assert.equal((await supervisor.wait(job.body.id)).state,'cancelled');
  assert.equal((await listHistory(join(root,'history'),workspace.projects[0])).length,1);
  await assert.rejects(lstat(join(root,'resources','.resource-lock')),{code:'ENOENT'});
});
