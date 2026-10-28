import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveHistory,readHistory,readHistorySource,historySourceWindow,projectKey} from '../src/history.js';
import {createReportRenderer} from '../src/report-renderer.js';
import {parseSnapshotBytes} from '../src/comparison.js';
import {exportHistory} from '../src/history-export.js';
import {richFixture} from './fixtures/rich-history.js';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'accesspilot-source-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const input=richFixture(),id=await saveHistory(root,input),renderer=createReportRenderer();t.after(()=>renderer.close());
  return {root,input,id,renderer,dir:join(root,projectKey(input.project)),expectedKey:projectKey(input.project)};
}

test('captured source releases the history lock before child validation and preserves canonical exports',async t=>{
  const f=await fixture(t),records=await readHistorySource(f.root,f.input.project,[f.id]);
  await assert.rejects(lstat(join(f.dir,'.history-lock')),{code:'ENOENT'});
  const [snapshot]=await readHistory(f.root,f.input.project,[f.id]);
  for(const lang of ['en','es'])for(const format of ['json','html','csv'])assert.equal(await f.renderer.render('export',{records,expectedKey:f.expectedKey,format,lang}),exportHistory(snapshot,format,lang));
  await writeFile(join(f.dir,f.id),'INVALID-SECRET');
  assert.equal(await f.renderer.render('export',{records,expectedKey:f.expectedKey,format:'json',lang:'en'}),exportHistory(snapshot,'json','en'));
});

test('malformed JSON, unknown schema and foreign project are rejected inside the child without raw exports',async t=>{
  const f=await fixture(t);
  for(const input of ['PRIVATE-INVALID',JSON.stringify({...f.input,schemaVersion:99}),JSON.stringify({...f.input,project:{...f.input.project,name:'Foreign'}})]) {
    await writeFile(join(f.dir,f.id),input);const records=await readHistorySource(f.root,f.input.project,[f.id]);
    await assert.rejects(f.renderer.render('export',{records,expectedKey:f.expectedKey,format:'json',lang:'en'}),error=>error.message==='Report rendering unavailable');
    await assert.rejects(lstat(join(f.dir,'.history-lock')),{code:'ENOENT'});
  }
});

test('source lookup refuses traversal, missing IDs and oversized files before child admission',async t=>{
  const f=await fixture(t);
  for(const id of ['../secret.json',f.id+'/extra','missing'])await assert.rejects(readHistorySource(f.root,f.input.project,[id]),{code:'HISTORY_NOT_FOUND'});
  await assert.rejects(readHistorySource(f.root,f.input.project,[]));
  await writeFile(join(f.dir,f.id),'x'.repeat(20*1024*1024+1));await assert.rejects(readHistorySource(f.root,f.input.project,[f.id]),/20 MiB/);
  assert.throws(()=>parseSnapshotBytes(Buffer.alloc(20*1024*1024+1)),/20 MiB/);
});

test('source trends preserve corrupt and foreign gaps; BOM and valid snapshots remain supported',async t=>{
  const f=await fixture(t);const [canonical]=await readHistory(f.root,f.input.project,[f.id]);
  await writeFile(join(f.dir,f.id),'\uFEFF'+JSON.stringify(canonical));
  assert.deepEqual(parseSnapshotBytes(Buffer.from('\uFEFF'+JSON.stringify(canonical))),canonical);
  let sourceWindow=await historySourceWindow(f.root,f.input.project);
  assert.ok((await f.renderer.render('trends',{sourceWindow,expectedKey:f.expectedKey,lang:'en',base:'/safe/'})).includes('Audit trends'));
  for(const value of ['bad',JSON.stringify({...f.input,project:{...f.input.project,name:'Foreign'}})]) {
    await writeFile(join(f.dir,f.id),value);sourceWindow=await historySourceWindow(f.root,f.input.project);
    const body=await f.renderer.render('trends',{sourceWindow,expectedKey:f.expectedKey,lang:'en',base:'/safe/'});assert.ok(body.includes('Record unavailable'));assert.ok(!body.includes('Foreign'));
  }
});
