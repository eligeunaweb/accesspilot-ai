import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,lstat,rmdir,unlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createWebJobSupervisor} from '../src/web-job-supervisor.js';
import {createWebAdmissionStore} from '../src/web-admission-store.js';
import {createAuditQueue} from '../src/audit-queue.js';
import {listHistory} from '../src/history.js';
const imageId='sha256:'+'a'.repeat(64),origin='http://127.0.0.1:12345';
const workspace={schemaVersion:1,name:'Managed',projects:[{schemaVersion:1,name:'Fixture',urls:['https://fixture.example']}]};
const report=url=>({schemaVersion:1,kind:'page-audit',url,engine:{name:'axe-core',version:'fixture'},violations:[]});
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'accesspilot-managed-')),cleanups=[];t.after(async()=>{try{for(const close of cleanups.reverse())await close();}finally{await rm(root,{recursive:true,force:true});}});
  return {cleanups,directory:join(root,'jobs'),resourceDirectory:join(root,'resources'),historyRoot:join(root,'history'),workspace,origin,imageId};
}
function request(s,credentials,action,body=Buffer.alloc(0)) {
  const headers={host:'127.0.0.1:12345',authorization:'Bearer '+credentials.token,...(action==='status'?{}:{origin,'content-type':'application/json','content-length':String(body.length),'x-accesspilot-csrf':credentials.csrf})};
  return s.authorize({method:action==='status'?'GET':'POST',headers,rawHeaders:Object.entries(headers).flat()},action);
}
function submit(s,c,id=randomUUID()){const body=Buffer.from(JSON.stringify({schemaVersion:1,projectId:s.projects()[0].id,requestId:id}));return s.submit(request(s,c,'create',body),body);}
function cancel(s,c,id){const body=Buffer.from(JSON.stringify({schemaVersion:1,jobId:id}));return s.cancel(request(s,c,'cancel',body),body);}
const hash=value=>createHash('sha256').update(value).digest('hex');
const row=()=>({id:randomUUID(),projectId:hash('project'),owner:hash('owner'),request:hash('request'),fingerprint:hash('config'),state:'admitted'});

test('durable request keys reject conflict, retain terminal receipts and never replay interrupted admission',async t=>{
  const f=await fixture(t);const queue=await createAuditQueue(f);let store=await createWebAdmissionStore(f.directory);const first=row();
  assert.equal((await store.admit(first)).id,first.id);assert.equal((await store.admit({...first,id:randomUUID()})).id,first.id);
  await assert.rejects(store.admit({...first,fingerprint:hash('changed')}));await store.update(first.id,'running');await queue.close();
  const next=await createAuditQueue(f);f.cleanups.push(()=>next.close());store=await createWebAdmissionStore(f.directory);
  assert.equal(store.get(first.id).state,'interrupted');assert.equal((await store.admit({...first,id:randomUUID()})).state,'interrupted');assert.equal(next.snapshot().records.length,0);
  await assert.rejects(store.update(first.id,'running'));const persisted=await readFile(join(f.directory,'web-admissions.json'),'utf8');assert.ok(!persisted.includes('https://'));
});

test('supervisor journals before page execution, deduplicates retries, saves history and releases shared domain',async t=>{
  const f=await fixture(t);let calls=0;
  const s=await createWebJobSupervisor(f,{auditPage:async(url,options,lifecycle)=>{
    calls++;const journal=JSON.parse(await readFile(join(f.directory,'web-admissions.json'),'utf8'));assert.equal(journal.records[0].state,'running');assert.equal(options.imageId,imageId);assert.ok(lifecycle.lifecycle);return report(url);
  }});f.cleanups.push(()=>s.close());const c=s.openSession(),key=randomUUID();
  const [first,second]=await Promise.all([submit(s,c,key),submit(s,c,key)]);assert.equal(first.id,second.id);
  assert.equal((await s.wait(first.id)).state,'succeeded');assert.equal(calls,1);assert.equal((await submit(s,c,key)).id,first.id);
  assert.equal((await listHistory(f.historyRoot,workspace.projects[0])).length,1);const disk=await readFile(join(f.directory,'web-admissions.json'),'utf8');
  for(const secret of [c.token,c.csrf,'https://fixture.example'])assert.ok(!disk.includes(secret));
  await s.close();await assert.rejects(lstat(join(f.resourceDirectory,'.resource-lock')),{code:'ENOENT'});
});

test('running cancellation waits for actual task cleanup; pending project cancellation never starts a page',async t=>{
  const f=await fixture(t);let started,release,calls=0;const ready=new Promise(resolve=>started=resolve);
  const s=await createWebJobSupervisor({...f,maxProjects:1},{auditPage:async(url,options)=>{
    calls++;started(options.signal);await new Promise(resolve=>release=resolve);return report(url);
  }});f.cleanups.push(()=>s.close());const c=s.openSession(),first=await submit(s,c),signal=await ready;
  const second=await submit(s,c);assert.equal((await cancel(s,c,second.id)).state,'cancelled');assert.equal((await s.wait(second.id)).state,'cancelled');
  assert.equal((await cancel(s,c,first.id)).state,'cancelling');assert.equal(signal.aborted,true);assert.equal(s.inspect().queue.active,1);
  let ended=false;s.wait(first.id).then(()=>ended=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(ended,false);
  release();assert.equal((await s.wait(first.id)).state,'cancelled');assert.equal(calls,1);
});

test('actual queue cleanup uncertainty preserves the domain and stops project admission',async t=>{
  const f=await fixture(t);const s=await createWebJobSupervisor(f,{auditPage:async()=>{throw Object.assign(new Error('SECRET'),{code:'ACCESSPILOT_CLEANUP_UNVERIFIED'});}});
  const c=s.openSession(),job=await submit(s,c);assert.equal((await s.wait(job.id)).state,'interrupted');assert.equal(s.inspect().failed,true);
  await assert.rejects(s.close(),/cleanup|recovery/i);await lstat(join(f.resourceDirectory,'.resource-lock'));
  const disk=await readFile(join(f.directory,'web-admissions.json'),'utf8');assert.ok(!disk.includes('SECRET'));
});

test('corrupt admission metadata fails closed and mandatory resource/image options cannot be omitted',async t=>{
  const f=await fixture(t);for(const change of [{resourceDirectory:undefined},{imageId:'latest'},{historyRoot:f.directory}])await assert.rejects(createWebJobSupervisor({...f,...change}));
  const queue=await createAuditQueue(f);await writeFile(join(f.directory,'web-admissions.json'),'{bad');await queue.close();
  await assert.rejects(createWebJobSupervisor(f));const other=await createAuditQueue(f);await other.close();
});

test('real supervisor process death requires offline recovery; interrupted project is not rerun', {timeout:20000},async t=>{
  const f=await fixture(t),moduleUrl=new URL('../src/web-job-supervisor.js',import.meta.url).href;
  const code=`import {createWebJobSupervisor} from ${JSON.stringify(moduleUrl)};
    const s=await createWebJobSupervisor(JSON.parse(process.argv[1]),{auditPage:async()=>{console.log('RUNNING');await new Promise(()=>setInterval(()=>{},1000));}});
    const c=s.openSession(),body=Buffer.from(JSON.stringify({schemaVersion:1,projectId:s.projects()[0].id,requestId:'00000000-0000-4000-8000-000000000001'}));
    const headers={host:'127.0.0.1:12345',origin:'http://127.0.0.1:12345',authorization:'Bearer '+c.token,'x-accesspilot-csrf':c.csrf,'content-type':'application/json','content-length':String(body.length)};
    await s.submit(s.authorize({method:'POST',headers,rawHeaders:Object.entries(headers).flat()},'create'),body);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,JSON.stringify(f)],{windowsHide:true,stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());const exited=once(child,'exit');let err='';child.stderr.on('data',x=>err+=x);
  await Promise.race([new Promise(resolve=>child.stdout.on('data',x=>{if(x.toString().includes('RUNNING'))resolve();})),exited.then(()=>{throw new Error(err||'Child stopped');})]);
  child.kill('SIGKILL');await exited;await assert.rejects(createWebJobSupervisor(f));
  // Test harness observed its own child exit. Product code never steals this lock.
  await rmdir(join(f.directory,'.queue-lock'));const recovery=await createAuditQueue({...f,recovery:true});await recovery.recoverWorkers({apply:true,execute:()=>assert.fail('No Docker intents in this fake page fixture')});await recovery.close();
  let calls=0;const next=await createWebJobSupervisor(f,{auditPage:async url=>{calls++;return report(url);}});f.cleanups.push(()=>next.close());
  assert.equal(next.inspect().admissions[0].state,'interrupted');assert.equal(calls,0);assert.equal(next.inspect().queue.records[0].state,'interrupted');
});


test('admission journal write failure prevents every page launch and stops the supervisor',async t=>{
  const f=await fixture(t);let calls=0;const s=await createWebJobSupervisor(f,{auditPage:async url=>{calls++;return report(url);}});
  await unlink(join(f.directory,'web-admissions.json'));await mkdir(join(f.directory,'web-admissions.json'));
  const c=s.openSession();await assert.rejects(submit(s,c));assert.equal(calls,0);assert.equal(s.inspect().failed,true);
  await assert.rejects(s.close());await assert.rejects(lstat(join(f.resourceDirectory,'.resource-lock')),{code:'ENOENT'});
});

test('operator session state is required for authenticated projects and never accepted as client input',async t=>{
  const f=await fixture(t);const authenticated={...workspace,projects:[{...workspace.projects[0],authentication:{profile:'member',readySelector:'main'}}]};
  await assert.rejects(createWebJobSupervisor({...f,workspace:authenticated}));
  await assert.rejects(createWebJobSupervisor({...f,sessionStates:{unknown:{cookies:[]}}}));
  await assert.rejects(lstat(join(f.directory,'.queue-lock')),{code:'ENOENT'});
});


test('durable receipt capacity never evicts old keys and corrupt/oversized journals remain untouched',async t=>{
  const f=await fixture(t),queue=await createAuditQueue(f);f.cleanups.push(()=>queue.close());
  const records=Array.from({length:128},(_,i)=>({...row(),request:hash('request-'+i),state:'succeeded'}));
  const path=join(f.directory,'web-admissions.json');await writeFile(path,JSON.stringify({schemaVersion:1,records}));const store=await createWebAdmissionStore(f.directory);
  await assert.rejects(store.admit(row()),error=>error.status===429);assert.equal(store.snapshot().length,128);assert.equal(store.get(records[0].id).request,records[0].request);
  for(const source of [JSON.stringify({schemaVersion:1,records:[records[0],{...records[0],id:randomUUID()}]}),'x'.repeat(128*1024+1)]) {
    await writeFile(path,source);await assert.rejects(createWebAdmissionStore(f.directory));assert.equal(await readFile(path,'utf8'),source);
  }
});
