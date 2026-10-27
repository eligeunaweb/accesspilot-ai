import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdtemp,readFile,readdir,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createAuditQueue} from '../src/audit-queue.js';
import {workerArguments} from '../src/docker-audit.js';
import {verifyOwnedWorker} from '../src/worker-ledger.js';
import {immutableImage} from '../src/isolation.js';

const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--image'||args[2]!=='--output')throw new Error('Usage: node scripts/worker-recovery-acceptance.js --image sha256:... --output NEW_RESULT.json');
const imageId=immutableImage(args[1]),execute=promisify(execFile);
const docker=async args=>(await execute('docker',args,{timeout:30000,maxBuffer:256*1024,windowsHide:true,shell:false})).stdout.trim();
const root=await mkdtemp(join(tmpdir(),'accesspilot-recovery-'));
const checks={},owned=[],queues=[];let stage='setup',failure,child,childExit,reach;
const server=http.createServer((_req,_res)=>reach?.());
const inventory=async()=> (await docker(['ps','-aq','--no-trunc','--filter',`ancestor=${imageId}`])).split(/\s+/).filter(Boolean).sort();
const claimFor=engineId=>({name:'accesspilot-worker-'+randomUUID(),owner:randomUUID(),imageId,engineId});
const readIntent=async store=>{
  const names=await readdir(join(store,'workers'));assert.equal(names.length,1);
  return JSON.parse(await readFile(join(store,'workers',names[0]),'utf8'));
};
let before;
try {
  before=await inventory();
  const info=JSON.parse(await docker(['info','--format','{{json .}}']));assert.equal(info.OSType,'linux');
  const apparmor=info.SecurityOptions?.includes('name=apparmor')??false;
  // Independent, stopped fixture with the same image: recovery must leave it untouched.
  const foreign=claimFor(info.ID);
  const foreignId=await docker(workerArguments(imageId,foreign.name,foreign.owner,{apparmor}));owned.push({...foreign,id:foreignId});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`,store=join(root,'crashed'),project=join(root,'project.json');
  await writeFile(project,JSON.stringify({schemaVersion:1,name:'Crash fixture',urls:[origin+'/slow'],timeoutMs:120000,network:{allowPrivateOrigins:[origin]}}));
  stage='actual-supervisor-kill';
  const reached=new Promise(resolve=>reach=resolve);
  child=spawn(process.execPath,['src/cli.js','--project',project,'--isolation-image',imageId,'--job-store',store],{windowsHide:true,stdio:'ignore'});
  childExit=once(child,'exit');
  await Promise.race([reached,childExit.then(()=>{throw new Error('Audit child exited before fixture request');}),delay(30000,undefined,{ref:false}).then(()=>{throw new Error('Fixture request not reached');})]);
  const intent=await readIntent(store);const inspected=JSON.parse(await docker(['inspect',intent.name]));
  assert.equal(inspected.length,1);const crashedId=verifyOwnedWorker(inspected[0],intent);owned.push({...intent,id:crashedId});
  child.kill('SIGKILL');await childExit;child=null;
  await assert.rejects(createAuditQueue({directory:store,recovery:true}),{code:'EEXIST'});checks.abandonedLockRefused=true;
  // This harness owns the killed process and has observed its exit. No automatic lock stealing in product code.
  await rmdir(join(store,'.queue-lock'));
  const queue=await createAuditQueue({directory:store,recovery:true});queues.push(queue);
  assert.equal(queue.snapshot().records[0].state,'interrupted');
  const preview=await queue.recoverWorkers();assert.equal(preview.workers[0].containerId,crashedId);assert.equal(preview.workers[0].status,'owned');
  assert.equal(JSON.parse(await docker(['inspect',crashedId]))[0].Id,crashedId);checks.previewNoDeletion=true;
  stage='apply-owned-recovery';
  const recovered=await queue.recoverWorkers({apply:true});assert.equal(recovered.workers[0].status,'removed');
  assert.equal((await readdir(join(store,'workers'))).length,0);
  await queue.close();checks.killedSupervisorRecoveredWithoutReplay=true;
  const normal=await createAuditQueue({directory:store});queues.push(normal);assert.equal(normal.snapshot().active,0);await normal.close();
  verifyOwnedWorker(JSON.parse(await docker(['inspect',foreignId]))[0],foreign,foreignId);checks.unrelatedSameImagePreserved=true;

  stage='controlled-container-oom';
  const oomStore=join(root,'oom'),oomQueue=await createAuditQueue({directory:oomStore});queues.push(oomQueue);
  const oomClaim=claimFor(info.ID);let oomId;
  await oomQueue.submit(async(_signal,{workerLifecycle})=>{
    await workerLifecycle.reserve(oomClaim);
    // Fault-only process, not an audit: 128 MiB cgroup and touched buffers force real OOM.
    const create=workerArguments(imageId,oomClaim.name,oomClaim.owner,{apparmor});
    create[create.indexOf('--memory')+1]='128m';create[create.indexOf('--memory-swap')+1]='128m';
    create.splice(-1,1,'-e','const chunks=[];setInterval(()=>chunks.push(Buffer.alloc(16*1024*1024,1)),10)');
    oomId=await docker(create);owned.push({...oomClaim,id:oomId});await docker(['start',oomId]);
    let state;
    for(let attempt=0;attempt<150;attempt++) {
      state=JSON.parse(await docker(['inspect',oomId]))[0].State;
      if(!state.Running)break;
      await delay(100);
    }
    assert.equal(state.Running,false);assert.equal(state.OOMKilled,true);
    // Simulate loss before intent release; no audit evidence is produced.
  });
  await oomQueue.close();
  await assert.rejects(createAuditQueue({directory:oomStore}),/Unresolved/);
  const oomRecovery=await createAuditQueue({directory:oomStore,recovery:true});queues.push(oomRecovery);
  const oomPreview=await oomRecovery.recoverWorkers();assert.equal(oomPreview.workers[0].oomKilled,true);assert.equal(oomPreview.workers[0].running,false);
  const oomResult=await oomRecovery.recoverWorkers({apply:true});assert.equal(oomResult.workers[0].status,'removed');await oomRecovery.close();checks.realOomRecordedAndRecovered=true;
  stage='cleanup';
} catch(error) {failure={message:error.message};}
finally {
  if(child){child.kill('SIGKILL');await childExit.catch(()=>{});}
  for(const queue of queues)await queue.close().catch(()=>{});
  for(const record of owned) {
    try {
      const present=await docker(['ps','-aq','--no-trunc','--filter',`id=${record.id}`]);
      if(present){const found=JSON.parse(await docker(['inspect',record.id]));assert.equal(found.length,1);verifyOwnedWorker(found[0],record,record.id);await docker(['rm','--force',record.id]);}
    } catch {failure??={message:'Owned fixture cleanup could not be verified'};}
  }
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  try {assert.deepEqual(await inventory(),before);checks.ownedFixturesRemoved=true;}catch {failure??={message:'Final container inventory differs'};}
}
if(!failure)stage='complete';
const result={schemaVersion:1,kind:'worker-recovery-acceptance',passed:!failure,imageId,stage,checks,...(failure?{failure}:{}),note:'Controlled supervisor-kill and 128 MiB fault-process OOM fixtures. Not browser OOM coverage, power-loss recovery, independent security review or machine-wide resource validation.'};
await writeFile(args[3],JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(result));process.exitCode=failure?2:0;
