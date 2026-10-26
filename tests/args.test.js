import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/args.js';
for (const args of [[], ['https://u:p@example.org'], ['https://example.org','https://other.org'], ['https://example.org','--format'], ['https://example.org','--format','invalid']]) {
  test(`reject invalid arguments: ${args.join(' ') || '(empty)'}`,()=>assert.throws(()=>parse(args)));
}
test('preserve output paths with spaces',()=>assert.equal(parse(['https://example.org','--output','my report.html']).output,'my report.html'));

test('baseline requires an explicit project',()=>assert.throws(()=>parse(['https://example.org','--baseline','before.json']),/requires --project/));
test('history options require an explicit project and store',()=>{
  for(const args of [['https://example.org','--history','store'],['--project','p.json','--baseline','latest'],['--project','p.json','--list-history']]) assert.throws(()=>parse(args));
  assert.equal(parse(['--project','p.json','--history','my store','--baseline','latest']).history,'my store');
});
test('retention requires explicit, bounded and unambiguous maintenance options',()=>{
  const base=['--project','p.json','--history','store','--prune-history'];
  for(const value of ['0','-1','1.5','01','1e2','10001','NaN']) assert.throws(()=>parse([...base,'--keep-runs',value]));
  assert.throws(()=>parse(base));
  assert.throws(()=>parse(['--project','p.json','--apply-retention']));
  for(const extra of [['--list-history'],['--output','x.json'],['--baseline','latest'],['--format','json'],['--fail-on-violations']]) assert.throws(()=>parse([...base,'--keep-runs','2',...extra]));
  assert.equal(parse([...base,'--keep-runs','2']).applyRetention,undefined);
  assert.equal(parse([...base,'--keep-runs','2','--apply-retention']).keepRuns,2);
});
test('viewer requires project history, bounded port and exclusive operation',()=>{
  const base=['--project','p.json','--history','store','--serve-history'];
  assert.equal(parse(base).serveHistory,true);
  assert.equal(parse([...base,'--port','0']).port,0);
  for(const extra of [['--port','65536'],['--port','-1'],['--port','0.5'],['--port','01'],['--list-history'],['--output','file.html'],['--baseline','latest']]) assert.throws(()=>parse([...base,...extra]));
  assert.throws(()=>parse(['--project','p.json','--serve-history']));
  assert.throws(()=>parse(['--project','p.json','--port','8080']));
});
