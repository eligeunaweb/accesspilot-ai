import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveHistory, listHistory, latestHistory, projectKey } from '../src/history.js';
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
