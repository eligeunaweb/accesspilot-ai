import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareAudits, validateSnapshot, loadSnapshot } from '../src/comparison.js';
function snapshot(selectors=['#old','#kept']) {
  return {schemaVersion:1,kind:'project-audit',project:{schemaVersion:1,name:'Test',urls:['https://example.org']},
    pages:[{url:'https://example.org',status:'succeeded',report:{schemaVersion:1,kind:'page-audit',url:'https://example.org',
      engine:{name:'axe-core',version:'4.14.0'},violations:[{id:'image-alt',nodes:selectors.map(s=>({target:[s]}))}]}}]};
}
test('compare new, resolved and persistent element identities with duplicate evidence',()=>{
  const result=compareAudits(snapshot(),snapshot(['#new','#kept','#kept']));
  assert.deepEqual(result.totals,{comparablePages:1,incomparablePages:0,added:1,resolved:1,persistent:1});
  assert.equal(result.pages[0].resolved[0].target[0],'#old');
});
for(const [label,change,reason] of [
  ['engine',r=>r.pages[0].report.engine.version='changed','engine-changed'],
  ['unknown engine',r=>r.pages[0].report.engine=null,'engine-unknown'],
  ['failed page',r=>r.pages[0].status='failed','page-not-audited'],
  ['cancelled page',r=>r.pages[0].status='cancelled','page-not-audited'],
  ['redirect',r=>r.pages[0].report.url='https://example.org/other','destination-changed']
]) test(`never marks missing findings resolved after ${label}`,()=>{
  const after=snapshot([]);change(after);const result=compareAudits(snapshot(),after);
  assert.equal(result.totals.resolved,0);assert.equal(result.pages[0].reason,reason);
});
test('added/removed scope is incomparable rather than improvement',()=>{
  const after=snapshot([]);after.project.urls=['https://other.org'];after.pages[0].url='https://other.org';
  const result=compareAudits(snapshot(),after);
  assert.equal(result.totals.incomparablePages,2);assert.equal(result.totals.resolved,0);
});
test('nested frame selectors are compared without flattening',()=>{
  const before=snapshot([]),after=snapshot([]);
  before.pages[0].report.violations[0].nodes=[{target:[['iframe'],['button']]}];
  after.pages[0].report.violations[0].nodes=[{target:['iframe','button']}];
  const result=compareAudits(before,after);assert.equal(result.totals.added,1);assert.equal(result.totals.resolved,1);
});
test('reject malformed snapshots before computing improvements',()=>{
  for(const mutate of [r=>r.schemaVersion=2,r=>r.pages=[],r=>r.pages[0].status='unknown',
    r=>r.pages[0].url='file:///secret',r=>r.pages[0].report.violations[0].nodes[0].target={},
    r=>r.pages[0].report.engine.version=42]) {
    const input=snapshot();mutate(input);assert.throws(()=>validateSnapshot(input));
  }
});
test('snapshot loading validates data and can be revalidated for comparison',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'accesspilot-baseline-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'baseline.json');await writeFile(path,JSON.stringify(snapshot()));
  const loaded=await loadSnapshot(path);assert.equal(compareAudits(loaded,snapshot()).totals.persistent,2);
  await writeFile(path,'{}');await assert.rejects(loadSnapshot(path),/schemaVersion/);
  await writeFile(path,'{');await assert.rejects(loadSnapshot(path),/valid JSON/);
});
