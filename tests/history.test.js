import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveHistory, listHistory, latestHistory, projectKey, pruneHistory } from '../src/history.js';
import { compareAudits } from '../src/comparison.js';

function run() {
  return {schemaVersion:1,kind:'project-audit',project:{schemaVersion:1,name:'../Project',urls:['https://example.org']},
    pages:[{url:'https://example.org',status:'succeeded',report:{schemaVersion:1,kind:'page-audit',url:'https://example.org',
      engine:{name:'axe-core',version:'4.14.0'},violations:[{id:'image-alt',nodes:[{target:['#image'],html:'PRIVATE HTML',failureSummary:'PRIVATE MESSAGE'}]}]}}]};
}
async function fixture(t) {
  const path=await mkdtemp(join(tmpdir(),'accesspilot-history-'));
  t.after(()=>rm(path,{recursive:true,force:true})); return path;
}
test('history round trips only comparison evidence and isolates project names',async t=>{
  const root=await fixture(t), input=run();
  assert.equal(await latestHistory(root,input.project),null);
  const id=await saveHistory(root,input);
  assert.deepEqual(await listHistory(root,input.project),[id]);
  const data=await readFile(join(root,projectKey(input.project),id),'utf8');
  assert.ok(!data.includes('PRIVATE'));
  const saved=await latestHistory(root,input.project);
  assert.equal(compareAudits(saved,input).totals.persistent,1);
  assert.equal(await latestHistory(root,{...input.project,name:'Other'}),null);
  assert.match(projectKey(input.project),/^[a-f0-9]{64}$/);
});
test('parallel saves never overwrite and ignore unfinished/unrelated files',async t=>{
  const root=await fixture(t),input=run();
  const ids=await Promise.all(Array.from({length:12},()=>saveHistory(root,input)));
  assert.equal(new Set(ids).size,12);
  const path=join(root,projectKey(input.project));
  await writeFile(join(path,'.interrupted.tmp'),'partial');
  await writeFile(join(path,'unrelated.json'),'{}');
  assert.equal((await listHistory(root,input.project)).length,12);
  assert.equal((await readdir(path)).filter(name=>name.endsWith('.tmp')).length,1);
});
test('corruption and unsupported schemas fail closed',async t=>{
  const root=await fixture(t),input=run(),id=await saveHistory(root,input);
  const path=join(root,projectKey(input.project),id);
  await writeFile(path,'{broken');
  await assert.rejects(latestHistory(root,input.project),/valid JSON/);
  await writeFile(path,JSON.stringify({...input,schemaVersion:99}));
  await assert.rejects(latestHistory(root,input.project),/schemaVersion/);
});
test('invalid snapshots leave no published history',async t=>{
  const root=await fixture(t),input=run(); input.pages=[];
  await assert.rejects(saveHistory(root,input),/page count/);
  assert.deepEqual(await listHistory(root,input.project),[]);
});

test('retention previews then deletes only older project records and is idempotent',async t=>{
  const root=await fixture(t),input=run(),other={...input,project:{...input.project,name:'Other'}};
  await saveHistory(root,other);
  await Promise.all(Array.from({length:5},()=>saveHistory(root,input)));
  const before=await listHistory(root,input.project),path=join(root,projectKey(input.project));
  await writeFile(join(path,'notes.json'),'keep this');
  await writeFile(join(path,'.incomplete.tmp'),'partial');
  const preview=await pruneHistory(root,input.project,{keep:2});
  assert.equal(preview.applied,false);assert.deepEqual(preview.deleted,[]);
  assert.deepEqual(preview.candidates,before.slice(2));
  assert.deepEqual(await listHistory(root,input.project),before);
  const applied=await pruneHistory(root,input.project,{keep:2,apply:true});
  assert.deepEqual(applied.deleted,preview.candidates);
  assert.deepEqual(await listHistory(root,input.project),before.slice(0,2));
  assert.equal((await listHistory(root,other.project)).length,1);
  assert.equal(await readFile(join(path,'notes.json'),'utf8'),'keep this');
  assert.equal(await readFile(join(path,'.incomplete.tmp'),'utf8'),'partial');
  assert.deepEqual((await pruneHistory(root,input.project,{keep:2,apply:true})).deleted,[]);
});

test('retention refuses corrupt or foreign records before deleting any file',async t=>{
  const root=await fixture(t),input=run();
  await Promise.all(Array.from({length:3},()=>saveHistory(root,input)));
  const ids=await listHistory(root,input.project),path=join(root,projectKey(input.project),ids.at(-1));
  await writeFile(path,'broken');
  await assert.rejects(pruneHistory(root,input.project,{keep:1,apply:true}),/valid JSON/);
  assert.deepEqual(await listHistory(root,input.project),ids);
  const foreign=run();foreign.project.name='Another';
  await writeFile(path,JSON.stringify(foreign));
  await assert.rejects(pruneHistory(root,input.project,{keep:1,apply:true}),/another project/);
  assert.deepEqual(await listHistory(root,input.project),ids);
});

test('invalid retention cannot delete the final record',async t=>{
  const root=await fixture(t),input=run();await saveHistory(root,input);
  for(const keep of [0,-1,1.5,'2',10001,undefined]) await assert.rejects(pruneHistory(root,input.project,{keep,apply:true}),/keep/);
  await assert.rejects(pruneHistory(root,input.project,{keep:1,apply:'yes'}),/boolean/);
  assert.equal((await listHistory(root,input.project)).length,1);
});

test('abandoned lock fails closed without breaking another process lock', {timeout:10000},async t=>{
  const root=await fixture(t),input=run();await saveHistory(root,input);
  const lock=join(root,projectKey(input.project),'.history-lock');await mkdir(lock);
  await assert.rejects(pruneHistory(root,input.project,{keep:1,apply:true}),/abandoned/);
  assert.deepEqual(await readdir(lock),[]);
  await rmdir(lock);
  assert.equal((await listHistory(root,input.project)).length,1);
});

test('concurrent saving and retention leave valid loadable history',async t=>{
  const root=await fixture(t),input=run();await saveHistory(root,input);
  await Promise.all([saveHistory(root,input),pruneHistory(root,input.project,{keep:1,apply:true}),saveHistory(root,input)]);
  assert.ok((await listHistory(root,input.project)).length>=1);
  assert.equal(compareAudits(await latestHistory(root,input.project),input).totals.persistent,1);
});
