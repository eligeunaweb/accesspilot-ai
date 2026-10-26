import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject, validateProject, MAX_CONFIG_BYTES } from '../src/project.js';
import { parse } from '../src/args.js';
const base = {schemaVersion:1, name:'Portfolio', urls:['https://example.org/']};
for (const [label, change] of Object.entries({
  version:{schemaVersion:2}, unknown:{secret:'x'}, empty:{urls:[]}, tooMany:{urls:Array(101).fill('https://example.org')},
  credentials:{urls:['https://u:p@example.org']}, protocol:{urls:['file:///secret']}, urlType:{urls:[42]},
  concurrency:{concurrency:5}, zero:{concurrency:0}, fractional:{concurrency:1.5}, timeout:{timeoutMs:999},
  largeTimeout:{timeoutMs:120001}, nullTimeout:{timeoutMs:null}, badName:{name:'\u001b[31m'}, emptyName:{name:' '}
})) test(`project rejects ${label}`,()=>assert.throws(()=>validateProject({...base,...change})));
test('normalizes URLs and applies limits without mutating input',()=>{
  const input={...base, urls:['https://EXAMPLE.org:443/#one','https://example.org/#two','https://other.org']};
  const result=validateProject(input);
  assert.deepEqual(result.urls,['https://example.org/','https://other.org/']);
  assert.equal(result.concurrency,1); assert.equal(result.timeoutMs,30000);assert.equal(input.urls.length,3);
});
test('project CLI disallows ambiguous targets',()=>{
  assert.throws(()=>parse(['https://example.org','--project','a.json']),/not both/);
  assert.throws(()=>parse(['--project']),/Missing/);
  assert.equal(parse(['--project','a.json','--format','json']).project,'a.json');
});
test('bounded config loading, BOM and invalid JSON',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'accesspilot-config-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'project.json');
  await writeFile(path,'\uFEFF'+JSON.stringify(base));assert.equal((await loadProject(path)).name,'Portfolio');
  await writeFile(path,'{');await assert.rejects(loadProject(path),/valid JSON/);
  await writeFile(path,' '.repeat(MAX_CONFIG_BYTES+1));await assert.rejects(loadProject(path),/1 MiB/);
  await assert.rejects(loadProject(dir));
});
