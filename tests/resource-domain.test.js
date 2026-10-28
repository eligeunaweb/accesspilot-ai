import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,rmdir,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createAuditQueue} from '../src/audit-queue.js';
import {parse} from '../src/args.js';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'accesspilot-resources-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {root,directory:join(root,'jobs-a'),other:join(root,'jobs-b'),resourceDirectory:join(root,'resources')};
}

test('shared domain admits only one supervisor and clamps total worker reservations to two',async t=>{
  const f=await fixture(t),first=await createAuditQueue({...f,maxWorkers:4,memoryMiB:4096,cpu:4});
  assert.equal(first.capacity,2);
  await assert.rejects(createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory}),/busy/);
  const lease=JSON.parse(await readFile(join(f.directory,'resource-lease.json'),'utf8'));
  assert.deepEqual(lease.budget,{workers:2,memoryMiB:2048,cpu:2,pids:512});
  assert.ok(!JSON.stringify(lease).includes(f.directory));
  await first.close();
  const second=await createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory});
  assert.equal(await second.submit(()=>42),42);await second.close();
});

test('separate explicit domains remain independent, not a machine-wide limit',async t=>{
  const f=await fixture(t),a=await createAuditQueue(f),b=await createAuditQueue({directory:f.other,resourceDirectory:join(f.root,'other-resources')});
  await Promise.all([a.close(),b.close()]);
});

test('job store cannot bypass a recorded lease by omitting or changing its resource directory',async t=>{
  const f=await fixture(t),queue=await createAuditQueue(f);
  // Simulate an observed stopped owner while retaining its reservation.
  await rmdir(join(f.directory,'.queue-lock'));
  await assert.rejects(createAuditQueue({directory:f.directory,recovery:true}),/provide its --resource-store/);
  await assert.rejects(createAuditQueue({directory:f.directory,recovery:true,resourceDirectory:join(f.root,'wrong')}),/identity mismatch/);
  // Restore the original owner's queue lock solely for this fixture's clean close.
  const {mkdir}=await import('node:fs/promises');await mkdir(join(f.directory,'.queue-lock'));
  await queue.close();
});

test('changed owner cannot be released by another supervisor; failure retains both locks',async t=>{
  const f=await fixture(t),queue=await createAuditQueue(f),path=join(f.resourceDirectory,'.resource-lock','owner.json');
  const foreign=JSON.parse(await readFile(path,'utf8'));foreign.owner=randomUUID();await writeFile(path,JSON.stringify(foreign));
  await assert.rejects(queue.close(),/operator recovery/);
  assert.equal(JSON.parse(await readFile(path,'utf8')).owner,foreign.owner);
  await assert.rejects(createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory}),/busy/);
  assert.ok((await lstat(join(f.directory,'.queue-lock'))).isDirectory());
});

test('unknown worker cleanup preserves shared reservation through failed shutdown',async t=>{
  const f=await fixture(t),queue=await createAuditQueue(f);
  await assert.rejects(queue.submit(()=>{throw Object.assign(new Error('fixture'),{code:'ACCESSPILOT_CLEANUP_UNVERIFIED'});}),/failed/);
  await assert.rejects(queue.close(),/operator recovery/);
  await assert.rejects(createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory}),/busy/);
});

test('partial/corrupt resource ownership records fail closed during recovery',async t=>{
  const f=await fixture(t),queue=await createAuditQueue(f),path=join(f.directory,'resource-lease.json');
  await writeFile(path,'{}');await assert.rejects(queue.close(),/operator recovery/);
  await rmdir(join(f.directory,'.queue-lock'));
  await assert.rejects(createAuditQueue({...f,recovery:true}),/Invalid resource reservation/);
});

test('normal close holds shared reservation until active task cleanup settles',async t=>{
  const f=await fixture(t),queue=await createAuditQueue(f);let release;
  const job=queue.submit(async signal=>{await new Promise(resolve=>release=resolve);assert.equal(signal.aborted,true);});
  const rejected=assert.rejects(job,/cancelled/);while(!release)await new Promise(resolve=>setImmediate(resolve));
  const closing=queue.close();
  await assert.rejects(createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory}),/busy/);
  release();await Promise.all([closing,rejected]);
  const next=await createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory});await next.close();
});

test('resource CLI requires persistent isolated jobs and cannot be combined with offline sharing',()=>{
  const image='sha256:'+'a'.repeat(64);
  for(const args of [['https://example.org'],['--project','p.json','--isolation-image',image],['--share-report','saved.json']])assert.throws(()=>parse([...args,'--resource-store','shared']));
  const valid=parse(['--project','p.json','--isolation-image',image,'--job-store','jobs','--resource-store','shared']);assert.equal(valid['resource-store'],'shared');
});

test('real process crash retains reservation; explicit offline recovery frees it without job replay', {timeout:20000},async t=>{
  const f=await fixture(t),moduleUrl=new URL('../src/audit-queue.js',import.meta.url).href;
  const code=`import {createAuditQueue} from ${JSON.stringify(moduleUrl)};
    await createAuditQueue({directory:process.argv[1],resourceDirectory:process.argv[2]});
    console.log('READY');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,f.directory,f.resourceDirectory],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());const exited=once(child,'exit');let stderr='';child.stderr.on('data',data=>stderr+=data);
  await Promise.race([new Promise(resolve=>child.stdout.on('data',data=>{if(data.toString().includes('READY'))resolve();})),exited.then(()=>{throw new Error(stderr||'Child stopped early');})]);
  await assert.rejects(createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory}),/busy/);
  child.kill('SIGKILL');await exited;
  await assert.rejects(createAuditQueue({...f,recovery:true}),{code:'EEXIST'});
  // Harness owns child and observed exit; product code never steals this lock.
  await rmdir(join(f.directory,'.queue-lock'));
  const recovery=await createAuditQueue({...f,recovery:true});
  const preview=await recovery.recoverWorkers({execute:()=>assert.fail('No worker intents should invoke Docker')});assert.equal(preview.resourceReservation.state,'owned');assert.equal(preview.resourceReservation.released,false);
  await assert.rejects(createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory}),/busy/);
  const result=await recovery.recoverWorkers({apply:true,execute:()=>assert.fail('No worker intents should invoke Docker')});assert.equal(result.resourceReservation.released,true);await recovery.close();
  const next=await createAuditQueue({directory:f.other,resourceDirectory:f.resourceDirectory});await next.close();
});
