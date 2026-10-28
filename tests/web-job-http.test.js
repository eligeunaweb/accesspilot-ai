import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createWebJobContract} from '../src/web-job-contract.js';

// Test-only HTTP adapter. It never invokes an audit runner or container engine.
async function fixture(t) {
  let contract;const server=createServer({maxHeaderSize:8192},async(req,res)=>{
    try {
      const action=req.url==='/jobs'?'create':req.url==='/cancel'?'cancel':req.url.startsWith('/status/')?'status':null;
      if(!action){res.writeHead(404);res.end();return;}
      const permit=contract.authorize(req,action);let result;
      if(action==='status')result=contract.status(permit,req.url.slice(8));
      else {
        let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)throw Object.assign(new Error(),{status:413});chunks.push(chunk);}
        const body=Buffer.concat(chunks);result=action==='create'?contract.submit(permit,body):contract.cancel(permit,body);
      }
      res.writeHead(200,{'Content-Type':'application/json','Connection':'close'});res.end(JSON.stringify(result));
    } catch(error){res.writeHead(error.status??500,{'Connection':'close'});res.end('Rejected');}
  });
  server.on('checkContinue',(_req,res)=>{res.writeHead(400,{'Connection':'close'});res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  contract=createWebJobContract({origin,workspace:{schemaVersion:1,name:'Fixture',projects:[{schemaVersion:1,name:'Allowed',urls:['https://fixture.example']}]}});
  t.after(async()=>{contract.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});});
  return {origin,contract,credentials:contract.openSession(),projectId:contract.projects()[0].id};
}
const headers=(f,extra={})=>({Authorization:'Bearer '+f.credentials.token,Origin:f.origin,'X-AccessPilot-CSRF':f.credentials.csrf,'Content-Type':'application/json',...extra});
async function post(f,path,input,extra={}){return fetch(f.origin+path,{method:'POST',headers:headers(f,extra),body:JSON.stringify(input)});}

test('real HTTP creation/retry/status/cancel enforce credentials, owner and CSRF without executing audits',{timeout:15000},async t=>{
  const f=await fixture(t),command={schemaVersion:1,projectId:f.projectId,requestId:randomUUID()};
  const first=await post(f,'/jobs',command);assert.equal(first.status,200);const job=await first.json();
  assert.deepEqual(await (await post(f,'/jobs',command)).json(),job);assert.equal(f.contract.snapshot().records,1);
  const poll=await fetch(f.origin+'/status/'+job.id,{headers:{Authorization:'Bearer '+f.credentials.token}});assert.equal(poll.status,200);assert.equal((await poll.json()).state,'requested');
  for(const extra of [{Authorization:'Bearer '+'0'.repeat(64)},{Origin:'https://outside.invalid'},{'X-AccessPilot-CSRF':'0'.repeat(64)},{'Sec-Fetch-Site':'cross-site'}]){const response=await post(f,'/jobs',command,extra);assert.equal(response.status,403);assert.equal(await response.text(),'Rejected');}
  const other=f.contract.openSession();const foreign=await fetch(f.origin+'/status/'+job.id,{headers:{Authorization:'Bearer '+other.token}});assert.equal(foreign.status,404);await foreign.text();
  const cancelled=await post(f,'/cancel',{schemaVersion:1,jobId:job.id});assert.equal((await cancelled.json()).state,'cancelled');assert.equal(f.contract.snapshot().outstanding,0);
});

test('real HTTP rejects excessive/invalid commands and duplicate raw authorization headers',{timeout:15000},async t=>{
  const f=await fixture(t),command={schemaVersion:1,projectId:f.projectId,requestId:randomUUID(),path:'PRIVATE-CANARY'};
  const bad=await post(f,'/jobs',command);assert.equal(bad.status,400);assert.equal(await bad.text(),'Rejected');
  const oversized=await fetch(f.origin+'/jobs',{method:'POST',headers:headers(f),body:'x'.repeat(4097)});assert.equal(oversized.status,413);await oversized.text();
  const target=new URL(f.origin),socket=createConnection({host:'127.0.0.1',port:Number(target.port)});socket.setEncoding('utf8');socket.on('error',()=>{});let data='';socket.on('data',chunk=>data+=chunk);
  const closed=once(socket,'close');await once(socket,'connect');const body=JSON.stringify({schemaVersion:1,projectId:f.projectId,requestId:randomUUID()});
  socket.end(`POST /jobs HTTP/1.1\r\nHost: ${target.host}\r\nOrigin: ${f.origin}\r\nAuthorization: Bearer ${f.credentials.token}\r\nAuthorization: Bearer ${f.credentials.token}\r\nX-AccessPilot-CSRF: ${f.credentials.csrf}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);await closed;
  assert.match(data,/^HTTP\/1.1 400/);assert.equal(f.contract.snapshot().records,0);assert.ok(!data.includes('PRIVATE-CANARY'));
});
