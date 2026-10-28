import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserBootstrap,parseSessionRevocation} from '../src/web-job-bootstrap.js';
import {createWebJobContract} from '../src/web-job-contract.js';
import {startWebJobTransport} from '../src/web-job-transport.js';

const workspace={schemaVersion:1,name:'Connect',projects:[{schemaVersion:1,name:'Private project',urls:['https://fixture.example']}]};
const bytes=value=>Buffer.from(JSON.stringify(value));
const command=pairingCode=>bytes({schemaVersion:1,pairingCode});
test('operator pairing capabilities are bounded, single-use and expire by monotonic time',()=>{
  let time=0,opened=0;const bootstrap=createBrowserBootstrap({openSession:()=>{opened++;return {token:'a'.repeat(64),csrf:'b'.repeat(64)};},projects:()=>[{id:'c'.repeat(64),name:'Private'}]},{now:()=>time,maxPending:1});
  const first=bootstrap.issue();assert.match(first.code,/^[a-f0-9]{64}$/);assert.equal(first.expiresInMs,120000);assert.throws(()=>bootstrap.issue());
  assert.throws(()=>bootstrap.exchange(command('0'.repeat(64))),{status:403});assert.equal(opened,0);
  const session=bootstrap.exchange(command(first.code));assert.equal(session.projects[0].name,'Private');assert.equal(opened,1);assert.throws(()=>bootstrap.exchange(command(first.code)),{status:403});
  const expired=bootstrap.issue();time=120000;assert.throws(()=>bootstrap.exchange(command(expired.code)),{status:403});assert.equal(opened,1);
  assert.notEqual(bootstrap.issue().code,first.code);bootstrap.close();assert.throws(()=>bootstrap.issue());
});
test('invalid pairing JSON never allocates or consumes a valid capability',()=>{
  let opened=0;const bootstrap=createBrowserBootstrap({openSession:()=>{opened++;return {};},projects:()=>[]}),{code}=bootstrap.issue();
  for(const body of [bytes({schemaVersion:1,pairingCode:code,url:'https://evil.example'}),Buffer.from(`{"schemaVersion":1,"pairingCode":"${code}","pairingCode":"${code}"}`),Buffer.from('{"schemaVersion":1,"pairingCode":{}}'),Buffer.from([0xff]),Buffer.from('\ufeff'+command(code).toString()),Buffer.alloc(4097)])assert.throws(()=>bootstrap.exchange(body));
  assert.equal(opened,0);bootstrap.exchange(command(code));assert.equal(opened,1);
  for(const body of [bytes({schemaVersion:1,extra:true}),Buffer.from('{"schemaVersion":1,"schemaVersion":1}'),bytes({schemaVersion:'1'})])assert.throws(()=>parseSessionRevocation(body));
});
test('pairing consumes the code even if session allocation fails; unsafe bounds are refused',()=>{
  const bootstrap=createBrowserBootstrap({openSession:()=>{throw new Error('capacity');}}),{code}=bootstrap.issue();
  assert.throws(()=>bootstrap.exchange(command(code)),/capacity/);assert.throws(()=>bootstrap.exchange(command(code)),{status:403});
  for(const options of [{ttlMs:120001},{maxPending:9},{maxPending:0}])assert.throws(()=>createBrowserBootstrap({},options));
});
async function serviceFixture(t) {
  let model;
  const service=await startWebJobTransport({workspace},{createSupervisor:async options=>model=createWebJobContract(options)});t.after(()=>service.close());return {service,model};
}
function post(service,path,value,headers={}){return fetch(service.origin+path,{method:'POST',headers:{origin:service.origin,'Content-Type':'application/json',...headers},body:JSON.stringify(value)});}
test('HTTP pairing reveals projects only after out-of-band capability proof and forbids replay/origin attacks',async t=>{
  const {service,model}=await serviceFixture(t),{code}=service.createPairingCode();
  const page=await fetch(service.connectionUrl);const html=await page.text();assert.equal(page.status,200);assert.ok(!html.includes(code));assert.ok(!html.includes('Private project'));assert.equal(page.headers.get('cache-control'),'no-store');
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(page.headers.get('referrer-policy'),'no-referrer');
  assert.equal((await post(service,'/api/v1/session',{schemaVersion:1,pairingCode:code},{origin:'https://foreign.example'})).status,403);assert.equal(model.snapshot().sessions,0);
  assert.equal((await post(service,'/api/v1/session',{schemaVersion:1,pairingCode:'0'.repeat(64)})).status,403);
  const response=await post(service,'/api/v1/session',{schemaVersion:1,pairingCode:code});assert.equal(response.status,200);const session=await response.json();assert.equal(session.projects[0].name,'Private project');assert.equal(response.headers.get('set-cookie'),null);
  assert.equal((await post(service,'/api/v1/session',{schemaVersion:1,pairingCode:code})).status,403);assert.equal(model.snapshot().sessions,1);
  for(const path of ['/connect?code='+code,'/api/v1/session/new','/createPairingCode'])assert.equal((await fetch(service.origin+path)).status,404);
});
test('HTTP revocation consumes action-bound authorization and cancels owned work without revoking another session',async t=>{
  const {service,model}=await serviceFixture(t),credentials=service.openSession(),other=service.openSession();
  const headers={authorization:'Bearer '+credentials.token,'x-accesspilot-csrf':credentials.csrf};
  const created=await post(service,'/api/v1/jobs',{schemaVersion:1,projectId:service.projects()[0].id,requestId:'00000000-0000-4000-8000-000000000001'},headers);const job=await created.json();
  assert.equal((await post(service,'/api/v1/session/revoke',{schemaVersion:1},{authorization:headers.authorization})).status,403);
  assert.equal((await post(service,'/api/v1/session/revoke',{schemaVersion:1,jobId:job.id},headers)).status,400);assert.equal(model.snapshot().sessions,2);
  assert.equal((await post(service,'/api/v1/session/revoke',{schemaVersion:1},headers)).status,200);assert.equal(model.snapshot().sessions,1);assert.equal(model.describe(job.id).receipt.state,'cancelled');
  assert.equal((await post(service,'/api/v1/session/revoke',{schemaVersion:1},headers)).status,403);
  const own=await fetch(service.origin+'/api/v1/jobs/'+job.id,{headers:{authorization:'Bearer '+other.token}});assert.equal(own.status,404);
});
test('session revocation rejects permit replay, foreign actions and expiry during upload',()=>{
  let time=0;const model=createWebJobContract({workspace,origin:'http://127.0.0.1:12345',sessionMs:5},{now:()=>time});
  const c=model.openSession(),body=bytes({schemaVersion:1}),headers={host:'127.0.0.1:12345',origin:'http://127.0.0.1:12345',authorization:'Bearer '+c.token,'x-accesspilot-csrf':c.csrf,'content-type':'application/json','content-length':String(body.length)};
  const req={method:'POST',headers,rawHeaders:Object.entries(headers).flat()};
  assert.throws(()=>model.endSession(model.authorize(req,'cancel'),body));
  const permit=model.authorize(req,'revoke');assert.deepEqual(model.endSession(permit,body),{revoked:true});assert.throws(()=>model.endSession(permit,body));
  const next=model.openSession();headers.authorization='Bearer '+next.token;headers['x-accesspilot-csrf']=next.csrf;req.rawHeaders=Object.entries(headers).flat();
  const expires=model.authorize(req,'revoke');time=5;assert.throws(()=>model.endSession(expires,body),{status:403});
});
