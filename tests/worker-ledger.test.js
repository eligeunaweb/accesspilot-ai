import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile, readdir, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createWorkerLedger} from '../src/worker-ledger.js';
import {createAuditQueue} from '../src/audit-queue.js';

const imageId='sha256:'+'a'.repeat(64), id='b'.repeat(64);
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'accesspilot-ledger-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const ledger=await createWorkerLedger(root);
  const jobId=randomUUID(),claim={name:'accesspilot-worker-'+randomUUID(),owner:randomUUID(),imageId,engineId:'fixture-engine'};
  await ledger.lifecycle(jobId).reserve(claim);
  return {root,ledger,jobId,claim};
}
function engine(f,change=()=>{}) {
  const calls=[];
  let present=true;
  const worker={Id:id,Name:'/'+f.claim.name,Config:{Image:imageId,Labels:{'org.accesspilot.worker':f.claim.owner}},State:{Running:true,OOMKilled:false}};
  change(worker);
  return {calls,worker,execute:async(command,args)=>{
    calls.push(args);
    assert.equal(command,'docker');
    if(args[0]==='info')return {stdout:JSON.stringify({ID:'fixture-engine',OSType:'linux'})};
    if(args[0]==='ps')return {stdout:present?id:''};
    if(args[0]==='inspect')return {stdout:JSON.stringify([worker])};
    if(args[0]==='rm'){assert.deepEqual(args,['rm','--force',id]);present=false;return {stdout:id};}
    assert.fail('unexpected command');
  }};
}

test('immutable intent records only ownership and cannot be overwritten',async t=>{
  const f=await fixture(t);
  const record=JSON.parse(await readFile(join(f.root,'workers',f.jobId+'.json'),'utf8'));
  assert.deepEqual(record,{...f.claim,schemaVersion:1,jobId:f.jobId});
  await assert.rejects(f.ledger.lifecycle(f.jobId).reserve(f.claim),{code:'EEXIST'});
  assert.equal(f.ledger.size,1);
});

test('preview has no Docker or ledger mutation; apply removes only inspected immutable ID',async t=>{
  const f=await fixture(t),docker=engine(f);
  const preview=await f.ledger.recover({execute:docker.execute});
  assert.equal(preview.workers[0].status,'owned');assert.equal(preview.workers[0].running,true);
  assert.equal(docker.calls.filter(args=>args[0]==='rm').length,0);assert.equal(f.ledger.size,1);
  const applied=await f.ledger.recover({apply:true,execute:docker.execute});
  assert.equal(applied.workers[0].status,'removed');assert.equal(f.ledger.size,0);
  assert.deepEqual(await readdir(join(f.root,'workers')),[]);
});

test('missing create intent clears only after explicit successful absence lookup',async t=>{
  const f=await fixture(t);let calls=0;
  const execute=async(_command,args)=>{calls++;return {stdout:args[0]==='info'?JSON.stringify({ID:'fixture-engine',OSType:'linux'}):''};};
  assert.equal((await f.ledger.recover({execute})).workers[0].status,'absent');assert.equal(f.ledger.size,1);
  assert.equal((await f.ledger.recover({execute,apply:true})).workers[0].status,'cleared');assert.equal(calls,5);
});

for(const field of ['owner','image','name','id'])test(`mismatched ${field} never authorizes removal`,async t=>{
  const f=await fixture(t),docker=engine(f,worker=>{
    if(field==='owner')worker.Config.Labels['org.accesspilot.worker']=randomUUID();
    if(field==='image')worker.Config.Image='sha256:'+'c'.repeat(64);
    if(field==='name')worker.Name='/other';
    if(field==='id')worker.Id='c'.repeat(64);
  });
  await assert.rejects(f.ledger.recover({execute:docker.execute,apply:true}),/ownership/);
  assert.equal(docker.calls.filter(args=>args[0]==='rm').length,0);assert.equal(f.ledger.size,1);
});

test('changed Docker engine rejects the whole plan before inspecting any container',async t=>{
  const f=await fixture(t);let calls=0;
  await assert.rejects(f.ledger.recover({apply:true,execute:async()=>{calls++;return {stdout:JSON.stringify({ID:'other-engine',OSType:'linux'})};}}),/identity mismatch/);
  assert.equal(calls,1);assert.equal(f.ledger.size,1);
});

test('daemon lookup errors never mean absence and never release the intent',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.ledger.recover({apply:true,execute:async()=>{throw new Error('daemon unavailable');}}),/unavailable/);
  assert.equal(f.ledger.size,1);
});

test('failed removal and unconfirmed removal preserve ownership records',async t=>{
  const f=await fixture(t),docker=engine(f);
  await assert.rejects(f.ledger.recover({apply:true,execute:async(command,args)=>{if(args[0]==='rm')throw new Error('denied');return docker.execute(command,args);}}),/denied/);
  assert.equal(f.ledger.size,1);
  await assert.rejects(f.ledger.recover({apply:true,execute:async(command,args)=>{if(args[0]==='rm')return {stdout:id};return docker.execute(command,args);}}),/confirmed/);
  assert.equal(f.ledger.size,1);
});

test('replacement between plan and application is rejected',async t=>{
  const f=await fixture(t),docker=engine(f);let lookups=0;
  await assert.rejects(f.ledger.recover({apply:true,execute:async(command,args)=>{
    if(args[0]==='ps' && ++lookups===2)docker.worker.Id='c'.repeat(64);
    return docker.execute(command,args);
  }}),/ownership/);
  assert.equal(docker.calls.filter(args=>args[0]==='rm').length,0);
});

test('corrupt/oversized ownership files fail closed',async t=>{
  const f=await fixture(t),path=join(f.root,'workers',f.jobId+'.json');
  await writeFile(path,'{}');await assert.rejects(createWorkerLedger(f.root),/ownership/);
  await writeFile(path,' '.repeat(4097));await assert.rejects(createWorkerLedger(f.root),/ownership/);
});

test('pending intents block audit startup; offline recovery is exclusive and never admits audits',async t=>{
  const f=await fixture(t),docker=engine(f);
  await assert.rejects(createAuditQueue({directory:f.root}),/Unresolved/);
  const queue=await createAuditQueue({directory:f.root,recovery:true});
  await assert.rejects(queue.submit(()=>assert.fail()),/closed/);
  await assert.rejects(createAuditQueue({directory:f.root,recovery:true}),{code:'EEXIST'});
  await queue.recoverWorkers({apply:true,execute:docker.execute});await queue.close();
  const reopened=await createAuditQueue({directory:f.root});await reopened.close();
});

test('failed apply retains persistent lock; preview errors release it on close',async t=>{
  const f=await fixture(t);
  const queue=await createAuditQueue({directory:f.root,recovery:true});
  await assert.rejects(queue.recoverWorkers({apply:true,execute:async()=>{throw new Error('offline');}}));
  await assert.rejects(queue.close(),/operator recovery/);
  await assert.rejects(createAuditQueue({directory:f.root,recovery:true}),{code:'EEXIST'});
  await rmdir(join(f.root,'.queue-lock'));
  const preview=await createAuditQueue({directory:f.root,recovery:true});
  await assert.rejects(preview.recoverWorkers({execute:async()=>{throw new Error('offline');}}));
  await preview.close();
});

test('OOM/stopped state is explicit recovery evidence, never an audit success',async t=>{
  const f=await fixture(t),docker=engine(f,w=>{w.State.Running=false;w.State.OOMKilled=true;});
  const result=await f.ledger.recover({execute:docker.execute});
  assert.equal(result.workers[0].oomKilled,true);assert.equal(result.workers[0].status,'owned');
});

test('a mismatched later candidate prevents removal of an earlier valid candidate',async t=>{
  const f=await fixture(t),docker=engine(f);
  const secondId='ffffffff-ffff-ffff-ffff-ffffffffffff',secondClaim={...f.claim,name:'accesspilot-worker-'+randomUUID(),owner:randomUUID()};
  await f.ledger.lifecycle(secondId).reserve(secondClaim);
  await assert.rejects(f.ledger.recover({apply:true,execute:docker.execute}),/ownership/);
  assert.equal(docker.calls.filter(args=>args[0]==='rm').length,0);assert.equal(f.ledger.size,2);
});

test('pre-cancelled recovery never invokes Docker or clears evidence',async t=>{
  const f=await fixture(t),controller=new AbortController();controller.abort();
  await assert.rejects(f.ledger.recover({apply:true,signal:controller.signal,execute:()=>assert.fail('cancelled recovery invoked Docker')}));
  assert.equal(f.ledger.size,1);
});

test('recovery command previews an empty store without Docker and rejects malformed arguments',async t=>{
  const f=await fixture(t),script=fileURLToPath(new URL('../scripts/recover-workers.js',import.meta.url));
  const execute=promisify(execFile),options={timeout:10000,windowsHide:true,shell:false};
  const output=await execute(process.execPath,[script,'--job-store',join(f.root,'empty')],options);
  assert.deepEqual(JSON.parse(output.stdout),{schemaVersion:1,kind:'worker-recovery',applied:false,workers:[]});
  await assert.rejects(execute(process.execPath,[script,'--job-store',f.root,'--unsafe'],options),error=>error.code===2 && error.stderr.includes('Usage:'));
});
