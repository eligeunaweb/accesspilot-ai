import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWebJobContract} from '../src/web-job-contract.js';
import {parseWebJobCommand,checkJobEnvelope} from '../src/web-job-request.js';

const origin='http://127.0.0.1:12345';
const workspace={schemaVersion:1,name:'Local',projects:[{schemaVersion:1,name:'One',urls:['https://one.example']},{schemaVersion:1,name:'Two',urls:['https://two.example']}]};
function fixture(t,options={},dependencies) {const contract=createWebJobContract({workspace,origin,...options},dependencies);t.after(()=>contract.close());return {contract,credentials:contract.openSession(),projectId:contract.projects()[0].id};}
function request(credentials,action,body=Buffer.alloc(0),changes={}) {
  const headers={host:'127.0.0.1:12345','sec-fetch-site':'same-origin',authorization:'Bearer '+credentials.token,...(action==='status'?{}:{origin,'x-accesspilot-csrf':credentials.csrf,'content-type':'application/json','content-length':String(body.length)}),...changes};
  return {method:action==='status'?'GET':'POST',headers,rawHeaders:Object.entries(headers).flatMap(([k,v])=>[k,v])};
}
function command(f,requestId=randomUUID(),extra={}){return Buffer.from(JSON.stringify({schemaVersion:1,projectId:f.projectId,requestId,...extra}));}
function submit(f,body=command(f),credentials=f.credentials){return f.contract.submit(f.contract.authorize(request(credentials,'create',body),'create'),body);}
function cancel(f,id,credentials=f.credentials){const body=Buffer.from(JSON.stringify({schemaVersion:1,jobId:id}));return f.contract.cancel(f.contract.authorize(request(credentials,'cancel',body),'cancel'),body);}
function status(f,id,credentials=f.credentials){return f.contract.status(f.contract.authorize(request(credentials,'status'),'status'),id);}
const rejected=(status)=>error=>error.message==='Job request rejected'&&error.status===status;

test('commands select only immutable operator projects and return a minimal receipt',t=>{
  const input=structuredClone(workspace),f=fixture(t,{workspace:input});const job=submit(f);
  assert.deepEqual(Object.keys(job).sort(),['id','projectId','state']);assert.equal(job.state,'requested');
  input.projects[0].urls[0]='https://changed.example';const execution=f.contract.take(job.id);
  assert.deepEqual(execution.project.urls,['https://one.example/']);execution.project.urls[0]='https://mutated.example';
  f.contract.settle(job.id,{outcome:'succeeded',cleanupVerified:true});const next=submit(f);assert.deepEqual(f.contract.take(next.id).project.urls,['https://one.example/']);
});

test('idempotency is scoped to session; replay cannot change project or consume another slot',t=>{
  const f=fixture(t),id=randomUUID(),body=command(f,id),first=submit(f,body);assert.deepEqual(submit(f,body),first);assert.equal(f.contract.snapshot().outstanding,1);
  assert.throws(()=>submit(f,command(f,id,{projectId:f.contract.projects()[1].id})),rejected(409));
  const other=f.contract.openSession();assert.notEqual(submit(f,body,other).id,first.id);
  cancel(f,first.id);assert.deepEqual(submit(f,body),{...first,state:'cancelled'});assert.equal(f.contract.snapshot().records,2);
});

test('owner scope hides jobs from another session for both status and cancellation',t=>{
  const f=fixture(t),job=submit(f),other=f.contract.openSession();assert.throws(()=>status(f,job.id,other),rejected(404));assert.throws(()=>cancel(f,job.id,other),rejected(404));
  assert.equal(status(f,job.id).state,'requested');assert.throws(()=>status(f,randomUUID()),rejected(404));
});

test('one-use permits cannot be forged, replayed or used for a different action',t=>{
  const f=fixture(t),body=command(f),permit=f.contract.authorize(request(f.credentials,'create',body),'create');
  assert.throws(()=>f.contract.submit({},body),rejected(403));f.contract.submit(permit,body);assert.throws(()=>f.contract.submit(permit,body),rejected(403));
  const wrong=f.contract.authorize(request(f.credentials,'status'),'status');assert.throws(()=>f.contract.submit(wrong,body),rejected(403));
});

test('running cancellation holds admission until trusted cleanup acknowledgement',t=>{
  const f=fixture(t,{maxOutstanding:1}),job=submit(f),execution=f.contract.take(job.id);assert.equal(cancel(f,job.id).state,'cancelling');assert.equal(execution.signal.aborted,true);
  assert.throws(()=>submit(f),rejected(429));assert.equal(cancel(f,job.id).state,'cancelling');
  assert.equal(f.contract.settle(job.id,{outcome:'succeeded',cleanupVerified:true}).state,'cancelled');assert.equal(f.contract.snapshot().outstanding,0);submit(f);
});

test('pending cancellation prevents take and uncertain cleanup stops admission without releasing active work',t=>{
  const f=fixture(t),pending=submit(f);assert.equal(cancel(f,pending.id).state,'cancelled');assert.throws(()=>f.contract.take(pending.id),rejected(409));
  const running=submit(f);f.contract.take(running.id);assert.equal(f.contract.settle(running.id,{outcome:'failed',cleanupVerified:false}).state,'interrupted');
  assert.equal(f.contract.snapshot().outstanding,1);assert.equal(f.contract.snapshot().failed,true);assert.throws(()=>f.contract.openSession(),rejected(503));assert.throws(()=>f.contract.take(running.id),rejected(409));
});

test('expiry and revocation invalidate pending permits and abort work without premature release',t=>{
  let clock=0;const f=fixture(t,{sessionMs:10},{now:()=>clock}),job=submit(f),execution=f.contract.take(job.id),body=command(f),permit=f.contract.authorize(request(f.credentials,'create',body),'create');
  clock=10;assert.throws(()=>f.contract.submit(permit,body),rejected(403));assert.equal(execution.signal.aborted,true);assert.equal(f.contract.snapshot().outstanding,1);
  const fresh=f.contract.openSession();f.contract.revokeSession(fresh);assert.throws(()=>f.contract.authorize(request(fresh,'status'),'status'),rejected(403));
  f.contract.settle(job.id,{outcome:'failed',cleanupVerified:true});assert.equal(f.contract.snapshot().outstanding,0);
});

test('record/session caps and shutdown are bounded and do not reset running ownership',t=>{
  const f=fixture(t,{maxSessions:1,maxRecords:1,maxOutstanding:1});assert.throws(()=>f.contract.openSession(),rejected(503));const job=submit(f);cancel(f,job.id);assert.throws(()=>submit(f),rejected(429));
  f.contract.close();assert.throws(()=>status(f,job.id),rejected(403));
  const active=fixture(t),running=submit(active),execution=active.contract.take(running.id);active.contract.close();
  assert.equal(execution.signal.aborted,true);assert.equal(active.contract.snapshot().outstanding,1);
  active.contract.settle(running.id,{outcome:'failed',cleanupVerified:true});assert.equal(active.contract.snapshot().outstanding,0);
  for(const options of [{maxSessions:17},{maxRecords:129},{maxOutstanding:9},{sessionMs:0},{maxRecords:1}])assert.throws(()=>createWebJobContract({workspace,origin,...options}));
});

test('unknown fields, URL/path/image/session overrides and nested commands never reserve a job',t=>{
  const f=fixture(t);for(const extra of [{url:'http://127.0.0.1'},{path:'C:/secret'},{image:'sha256:evil'},{sessionState:{}},{network:{}},{command:'run'},{projectId:'0'.repeat(64)},{schemaVersion:2},{requestId:1}])assert.throws(()=>submit(f,command(f,randomUUID(),extra)));
  assert.equal(f.contract.snapshot().records,0);
});

test('duplicate and escaped duplicate JSON keys, invalid UTF-8/BOM and exact byte budgets fail closed',()=>{
  const good={schemaVersion:1,projectId:'a'.repeat(64),requestId:randomUUID()},valid=JSON.stringify(good);
  for(const source of [valid.replace('"schemaVersion":1','"schemaVersion":0,"schemaVersion":1'),valid.replace('"schemaVersion":1','"schemaVersion":0,"schema\\u0056ersion":1'),valid.replace('"schemaVersion":1','"schemaVersion":{},"schemaVersion":1'),'[]','null','\uFEFF'+valid]) {
    const body=Buffer.from(source);assert.throws(()=>parseWebJobCommand(body,'create',body.length));
  }
  assert.throws(()=>parseWebJobCommand(Buffer.from([0xff]),'create',1));assert.throws(()=>parseWebJobCommand(Buffer.alloc(4097),'create',4097));
  const body=Buffer.from(valid);assert.deepEqual(parseWebJobCommand(body,'create',body.length),good);assert.throws(()=>parseWebJobCommand(body,'create',body.length-1));
});

test('HTTP envelope rejects cross-site, method, content-type, framing and duplicate security headers',t=>{
  const f=fixture(t),body=command(f);
  for(const change of [{host:'evil.example'},{origin:'null'},{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'},{'sec-fetch-site':'unknown'},{authorization:'Bearer '+'0'.repeat(64)},{'x-accesspilot-csrf':'0'.repeat(64)},{'content-type':'text/plain'},{'content-encoding':'gzip'},{'content-length':'040'},{'content-length':'4097'},{'transfer-encoding':'chunked'},{expect:'100-continue'},{upgrade:'websocket'}])assert.throws(()=>f.contract.authorize(request(f.credentials,'create',body,change),'create'));
  for(const name of ['Host','Origin','Authorization','X-AccessPilot-Csrf','Content-Length','Content-Type','Sec-Fetch-Site']) {
    const req=request(f.credentials,'create',body);req.rawHeaders.push(name,'duplicate');assert.throws(()=>f.contract.authorize(req,'create'),rejected(400));
  }
  const req=request(f.credentials,'create',body);req.method='GET';assert.throws(()=>f.contract.authorize(req,'create'),rejected(405));
  assert.equal(checkJobEnvelope(request(f.credentials,'status'),origin,'status'),0);
  for(const badOrigin of ['https://127.0.0.1','http://localhost:1234','http://0.0.0.0:1234','http://127.0.0.1:0','http://127.0.0.1:1234/path'])assert.throws(()=>createWebJobContract({workspace,origin:badOrigin}));
});
