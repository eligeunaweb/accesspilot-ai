import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkspace, validateWorkspace } from '../src/workspace.js';
import { historyFilters, filterHistory } from '../src/history-filter.js';
import { parse } from '../src/args.js';

const project={schemaVersion:1,name:'Example',urls:['https://example.org']};
const workspace={schemaVersion:1,name:'Agency',language:'es',projects:[project]};
test('workspace validates inline projects, bounds and distinct normalized names',()=>{
  const normalized=validateWorkspace(workspace);
  assert.equal(normalized.projects[0].urls[0],'https://example.org/');
  assert.equal(normalized.language,'es');
  assert.notEqual(normalized.projects[0],project);
  for(const change of [{schemaVersion:2},{extra:true},{name:' '},{name:'\n'},{projects:[]},{projects:Array(21).fill(project)},
    {projects:['../project.json']},{projects:[{...project,urls:['file:///secret']}]},
    {projects:[project,{...project,name:' Example '}]},{language:'fr'}]) assert.throws(()=>validateWorkspace({...workspace,...change}));
});
test('workspace config loading is bounded and supports BOM',async t=>{
  const root=await mkdtemp(join(tmpdir(),'accesspilot-workspace-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'workspace.json');
  await writeFile(path,'\uFEFF'+JSON.stringify(workspace));assert.equal((await loadWorkspace(path)).projects.length,1);
  await writeFile(path,'broken');await assert.rejects(loadWorkspace(path),/Workspace.*valid JSON/);
  await writeFile(path,' '.repeat(1024*1024+1));await assert.rejects(loadWorkspace(path),/1 MiB/);
});
test('workspace CLI is limited to the viewer with an explicit history directory',()=>{
  const args=['--workspace','workspace.json','--history','my history','--serve-history'];
  assert.equal(parse(args).workspace,'workspace.json');
  for(const extra of [['--project','p.json'],['https://example.org'],['--list-history'],['--baseline','latest'],['--output','x'],['--format','json']]) assert.throws(()=>parse([...args,...extra]));
  assert.throws(()=>parse(['--workspace','w.json']));
  assert.throws(()=>parse(['--workspace','w.json','--serve-history']));
});
test('history search validates real dates, ranges, lengths and controls',()=>{
  assert.deepEqual(historyFilters(new URLSearchParams('q=%20ABC%20&from=2024-02-29&to=2024-03-01')),{q:'ABC',from:'2024-02-29',to:'2024-03-01'});
  for(const query of ['from=2023-02-29','from=2024-02-30','from=2024-13-01','from=1','from=2024-05-01&to=2024-04-30','q=%00','q='+ 'a'.repeat(101)]) assert.throws(()=>historyFilters(new URLSearchParams(query)));
  const ids=['2024-03-01T12-00-00-000Z_ABC.json','2024-02-29T00-00-00-000Z_abc.json','2024-02-28T23-59-59-000Z_ABC.json'];
  assert.deepEqual(filterHistory(ids,{q:'abc',from:'2024-02-29',to:'2024-03-01'}),ids.slice(0,2));
  assert.deepEqual(filterHistory(ids,{q:'missing'}),[]);
});
