import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile, mkdir, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createAuditQueue} from '../src/audit-queue.js';
import {parse} from '../src/args.js';
import {auditProject} from '../src/runner.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'accesspilot-queue-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  return directory;
}

test('global FIFO slots span independent callers and enforce memory/CPU reservations', async () => {
  const queue = await createAuditQueue({maxWorkers:4, memoryMiB:2048, cpu:1});
  assert.equal(queue.capacity,1);
  const order=[], releases=[];
  const jobs = [0,1,2].map(id => queue.submit(async () => {
    order.push(id); await new Promise(resolve => releases.push(resolve)); return id;
  }));
  await tick(); assert.deepEqual(order,[0]); assert.equal(queue.snapshot().queued,2);
  releases.shift()(); await tick(); assert.deepEqual(order,[0,1]);
  releases.shift()(); await tick(); releases.shift()();
  assert.deepEqual(await Promise.all(jobs),[0,1,2]);
  await queue.close();
});

test('admission is bounded even before journal promises settle', async () => {
  const queue=await createAuditQueue({maxQueued:1});
  const first=queue.submit(async()=>42);
  await assert.rejects(queue.submit(async()=>0),/full/);
  assert.equal(await first,42); await queue.close();
});

test('queued cancellation never starts task; running cancellation holds slot through cleanup', async () => {
  const queue=await createAuditQueue({maxWorkers:1});
  const controller=new AbortController(); let release, starts=0;
  const first=queue.submit(async signal=>{ starts++; await new Promise(resolve=>release=resolve); assert.equal(signal.aborted,true); },{signal:controller.signal});
  const firstRejected=assert.rejects(first,/cancelled/);
  await tick();
  const queuedController=new AbortController();
  const second=queue.submit(()=>assert.fail('cancelled task started'),{signal:queuedController.signal});
  const secondRejected=assert.rejects(second,/cancelled/);
  queuedController.abort(); controller.abort();
  const third=queue.submit(async()=>{starts++;return 3;});
  await tick(); assert.equal(starts,1); assert.equal(queue.snapshot().active,1);
  release(); await Promise.all([firstRejected,secondRejected]); assert.equal(await third,3);
  await queue.close();
});

test('shutdown cancels queued work, waits for running cleanup, and is idempotent', async () => {
  const queue=await createAuditQueue({maxWorkers:1}); let release;
  const running=queue.submit(async signal=>{await new Promise(resolve=>release=resolve); assert.equal(signal.aborted,true);});
  const rejected=assert.rejects(running,/cancelled/); await tick();
  const pending=assert.rejects(queue.submit(()=>assert.fail()),/cancelled/);
  let done=false; const closing=queue.close(); closing.then(()=>done=true);
  assert.equal(queue.close(),closing); await tick(); assert.equal(done,false);
  await assert.rejects(queue.submit(()=>0),/closed/);
  release(); await Promise.all([rejected,pending,closing]); assert.equal(done,true);
});

test('task errors are private, release reservations and do not poison later work', async () => {
  const queue=await createAuditQueue({maxWorkers:1});
  await assert.rejects(queue.submit(()=>{throw new Error('SECRET cookie');}),error=>error.message==='Audit queue job failed');
  assert.equal(await queue.submit(()=>7),7); assert.equal(queue.snapshot().active,0);
  await queue.close();
});

test('durable journal has no payload/results/errors; exclusive owner and clean reopen', async t => {
  const directory=await fixture(t); const queue=await createAuditQueue({directory});
  await assert.rejects(createAuditQueue({directory}),{code:'EEXIST'});
  assert.equal(await queue.submit(()=> 'SECRET URL cookie'), 'SECRET URL cookie');
  await queue.close();
  const text=await readFile(join(directory,'jobs.json'),'utf8'); assert.ok(!text.includes('SECRET'));
  const next=await createAuditQueue({directory});
  assert.deepEqual(next.snapshot().records.map(r=>r.state),['succeeded']); await next.close();
});

test('restart marks queued/running interrupted without replay; abandoned lock fails closed', async t => {
  const directory=await fixture(t);
  await writeFile(join(directory,'jobs.json'),JSON.stringify({schemaVersion:1,records:['queued','running','failed'].map(state=>({id:randomUUID(),state}))}));
  await mkdir(join(directory,'.queue-lock'));
  await assert.rejects(createAuditQueue({directory}),{code:'EEXIST'});
  // Operator action only, after confirming previous owner and containers have stopped.
  await rmdir(join(directory,'.queue-lock'));
  const queue=await createAuditQueue({directory});
  assert.deepEqual(queue.snapshot().records.map(r=>r.state),['interrupted','interrupted','failed']);
  assert.equal(queue.snapshot().active,0); await queue.close();
});

test('corrupt and oversized journals fail closed and release acquired lock', async t => {
  const directory=await fixture(t);
  await writeFile(join(directory,'jobs.json'),'{}');
  await assert.rejects(createAuditQueue({directory}),/Invalid queue journal/);
  await writeFile(join(directory,'jobs.json'),' '.repeat(256*1024+1));
  await assert.rejects(createAuditQueue({directory}),/Invalid queue journal/);
});

test('invalid limits, pre-aborted tasks and incompatible CLI flags rejected', async () => {
  for (const options of [{maxWorkers:0},{memoryMiB:512},{cpu:1.5},{maxQueued:101}]) await assert.rejects(createAuditQueue(options),/Invalid/);
  const queue=await createAuditQueue(); const controller=new AbortController();controller.abort();
  await assert.rejects(queue.submit(()=>assert.fail(),{signal:controller.signal}),/cancelled/);
  assert.throws(()=>parse(['https://example.org','--job-store','jobs']),/requires --isolation-image/);
  const opts=parse(['--project','project.json','--isolation-image','sha256:'+'a'.repeat(64),'--job-store','jobs']);
  assert.equal(opts['job-store'],'jobs'); await queue.close();
});

test('two projects share global slots while preserving their own result order', async () => {
  const queue=await createAuditQueue({maxWorkers:1}); let peak=0, active=0;
  const audit=(url,options)=>queue.submit(async()=>{
    active++; peak=Math.max(peak,active); await tick(); active--;
    return {url, violations:[], incomplete:0};
  },{signal:options.signal});
  const projects=['one','two'].map(name=>({schemaVersion:1,name,urls:['https://example.org/a','https://example.org/b'],concurrency:2}));
  const runs=await Promise.all(projects.map(project=>auditProject(project,{audit})));
  assert.equal(peak,1);
  for (const run of runs) { assert.equal(run.totals.succeeded,2); assert.deepEqual(run.pages.map(p=>p.url),projects[0].urls); }
  await queue.close();
});

test('journal write failure prevents launch, stops admission and preserves exclusive ownership', async t => {
  const directory=await fixture(t); const queue=await createAuditQueue({directory});
  await rm(join(directory,'jobs.json')); await mkdir(join(directory,'jobs.json'));
  await assert.rejects(queue.submit(()=>assert.fail('unrecorded task launched')),/journal failed/);
  assert.equal(queue.snapshot().failed,true);
  await assert.rejects(queue.submit(()=>0),/failed/);
  await assert.rejects(createAuditQueue({directory}),{code:'EEXIST'});
  await assert.rejects(queue.close());
});

test('close immediately after admission prevents any task launch and records cancellation', async t => {
  const directory=await fixture(t); const queue=await createAuditQueue({directory});
  const work=assert.rejects(queue.submit(()=>assert.fail('closed admission launched')),/cancelled/);
  await Promise.all([queue.close(),work]);
  const next=await createAuditQueue({directory});
  assert.deepEqual(next.snapshot().records.map(r=>r.state),['cancelled']); await next.close();
});

test('actual supervisor process death leaves a lock and restart records interruption without replay', {timeout:20000}, async t => {
  const directory=await fixture(t);
  const moduleUrl=new URL('../src/audit-queue.js',import.meta.url).href;
  const code=`import {createAuditQueue} from ${JSON.stringify(moduleUrl)};
    const queue=await createAuditQueue({directory:process.argv[1]});
    await queue.submit(async()=>{console.log('RUNNING');await new Promise(()=>setInterval(()=>{},1000));});`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,directory],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  t.after(()=>child.kill());
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  const exited=once(child,'exit');
  await Promise.race([
    new Promise(resolve=>child.stdout.on('data',chunk=>{if(chunk.toString().includes('RUNNING'))resolve();})),
    exited.then(()=>{throw new Error('Child exited before running: '+stderr);})
  ]);
  const before=JSON.parse(await readFile(join(directory,'jobs.json'),'utf8'));
  assert.equal(before.records[0].state,'running');
  child.kill(); await exited;
  await assert.rejects(createAuditQueue({directory}),{code:'EEXIST'});
  await rmdir(join(directory,'.queue-lock'));
  const recovered=await createAuditQueue({directory});
  assert.equal(recovered.snapshot().records[0].state,'interrupted');
  assert.equal(recovered.snapshot().active,0); await recovered.close();
});

test('journal retention remains bounded and removes only oldest terminal records', async t => {
  const directory=await fixture(t);
  const records=Array.from({length:1000},()=>({id:randomUUID(),state:'succeeded'}));
  await writeFile(join(directory,'jobs.json'),JSON.stringify({schemaVersion:1,records}));
  const queue=await createAuditQueue({directory}); await queue.submit(()=>42);
  const current=queue.snapshot().records;
  assert.equal(current.length,1000); assert.equal(current[0].id,records[1].id);
  assert.equal(current.at(-1).state,'succeeded'); await queue.close();
});

test('unverified container cleanup stops the supervisor before any queued task launches', async t => {
  const directory=await fixture(t);
  const queue=await createAuditQueue({maxWorkers:1,directory}); let release;
  const first=queue.submit(async()=>{
    await new Promise(resolve=>release=resolve);
    throw Object.assign(new Error('private cleanup detail'),{code:'ACCESSPILOT_CLEANUP_UNVERIFIED'});
  });
  const firstRejected=assert.rejects(first,/failed/);
  while (!release) await tick();
  const secondRejected=assert.rejects(queue.submit(()=>assert.fail('orphan budget reused')),/stopped/);
  release(); await Promise.all([firstRejected,secondRejected]);
  assert.equal(queue.snapshot().failed,true);
  await assert.rejects(queue.submit(()=>0),/failed/);
  await assert.rejects(queue.close(),/operator recovery required/);
  await assert.rejects(createAuditQueue({directory}),{code:'EEXIST'});
});
