import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upgradeSnapshot, validateSnapshot, compareAudits, loadSnapshot } from '../src/comparison.js';
import { saveHistory, latestHistory, historyWindow, listHistory, projectKey } from '../src/history.js';
import { snapshotMetrics, trendRows } from '../src/history-metrics.js';
import { evidenceFilters, selectEvidence } from '../src/evidence-filter.js';
import { richFixture } from './fixtures/rich-history.js';
import { parse } from '../src/args.js';
import { exportHistory } from '../src/history-export.js';

async function fixture(t) {const root=await mkdtemp(join(tmpdir(),'accesspilot-rich-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
test('enriched history preserves severity, WCAG, guidance, review and provenance without HTML',async t=>{
  const root=await fixture(t),input=richFixture();const id=await saveHistory(root,input);
  const saved=await latestHistory(root,input.project),report=saved.pages[0].report;
  assert.equal(saved.historyVersion,2);assert.equal(saved.generatedAt,input.generatedAt);assert.equal(saved.version,'0.1.0');
  assert.equal(report.violations[0].impact,'serious');assert.deepEqual(report.violations[0].wcag,['1.1.1']);
  assert.equal(report.violations[0].recommendation.language,'es');assert.equal(report.incompleteDetails[0].id,'color-contrast');
  assert.equal(report.passes,10);assert.equal(report.incomplete,1);
  assert.deepEqual(validateSnapshot(saved),saved);assert.deepEqual(upgradeSnapshot(saved),saved);
  assert.ok(!(await readFile(join(root,projectKey(input.project),id),'utf8')).includes('PRIVATE'));
});
test('legacy conversion is additive and never invents missing details',()=>{
  const input=richFixture(),legacy=validateSnapshot(input),upgraded=upgradeSnapshot(legacy);
  assert.equal(upgraded.pages[0].report.violations[0].impact,'unknown');
  assert.equal(upgraded.pages[0].report.incomplete,null);assert.equal(upgraded.generatedAt,null);
  assert.deepEqual(upgraded.pages[0].report.violations[0].wcag,[]);
  assert.equal(compareAudits(legacy,upgradeSnapshot(input)).totals.persistent,1);
  assert.equal(legacy.historyVersion,undefined);
});
test('strict enriched schema rejects coercions, unknown versions and contradictory evidence',()=>{
  for(const mutate of [r=>r.historyVersion=99,r=>r.generatedAt='2026-02-30T00:00:00.000Z',r=>r.pages[0].report.violations[0].impact='high',
    r=>r.pages[0].report.violations[0].wcag=['9.1.1'],r=>r.pages[0].report.passes='10',r=>r.pages[0].report.incomplete=2,
    r=>r.pages[0].report.violations[0].recommendation.language='fr',r=>r.pages[0].report.violations[0].help='x'.repeat(2001)]) {
    const input=richFixture();mutate(input);assert.throws(()=>upgradeSnapshot(input));
  }
});
test('metrics separate unknown/review data from failures and severity',()=>{
  const input=upgradeSnapshot(richFixture()),metrics=snapshotMetrics(input);
  assert.equal(metrics.severity.serious,1);assert.equal(metrics.review,1);assert.equal(metrics.complete,true);
  const old=snapshotMetrics(validateSnapshot(richFixture()));assert.equal(old.severity.unknown,1);assert.equal(old.review,null);
  input.pages[0]={url:input.pages[0].url,status:'failed'};
  const failed=snapshotMetrics(input);assert.equal(failed.pages.failed,1);assert.equal(failed.review,null);
});
test('trend changes require complete compatible adjacent runs and never bridge gaps',()=>{
  const before=upgradeSnapshot(richFixture()),after=structuredClone(before);after.pages[0].report.violations=[];
  const window={rows:[{id:'after',snapshot:after},{id:'before',snapshot:before}]};
  assert.deepEqual(trendRows(window)[0].delta,{added:0,resolved:1});
  after.generatedAt='2025-01-01T00:00:00.000Z';assert.equal(trendRows(window)[0].delta,null);
  after.generatedAt=before.generatedAt;
  after.coverageComplete=false;assert.equal(trendRows(window)[0].delta,null);
  after.coverageComplete=true;after.pages[0].report.engine.version='changed';assert.equal(trendRows(window)[0].delta,null);
  window.rows.splice(1,0,{id:'corrupt',error:'invalid'});assert.equal(trendRows(window)[0].delta,null);
});
test('evidence filtering searches selected-run rule, WCAG, selectors, severity and review category',()=>{
  const input=upgradeSnapshot(richFixture());
  const filters=evidenceFilters(new URLSearchParams('text=1.4.3&severity=moderate&category=review'));
  const pages=selectEvidence(input,filters);
  assert.equal(pages.length,1);assert.equal(pages[0].report.violations.length,0);assert.equal(pages[0].report.incompleteDetails[0].id,'color-contrast');
  assert.deepEqual(selectEvidence(input,evidenceFilters(new URLSearchParams('severity=critical'))),[]);
  assert.equal(selectEvidence(input,evidenceFilters(new URLSearchParams('text=%23image'))).length,1);
  assert.equal(input.pages[0].report.violations.length,1);
  for(const query of ['severity=high','category=pass','status=clean','text=%00','text='+ 'a'.repeat(101)]) assert.throws(()=>evidenceFilters(new URLSearchParams(query)));
});
test('bounded history windows preserve corruption gaps and legacy originals',async t=>{
  const root=await fixture(t),input=richFixture();
  for(let i=0;i<12;i++) await saveHistory(root,input);
  const ids=await listHistory(root,input.project);
  const file=join(root,projectKey(input.project),ids[1]);await writeFile(file,'broken');
  const window=await historyWindow(root,input.project);assert.equal(window.total,12);assert.equal(window.rows.length,10);
  assert.equal(window.rows[1].error,'invalid');assert.equal(trendRows(window)[0].delta,null);
  const legacyPath=join(root,'legacy.json');await writeFile(legacyPath,JSON.stringify(validateSnapshot(input)));
  const original=await readFile(legacyPath,'utf8');
  const upgraded=await loadSnapshot(legacyPath,{enrich:true});assert.equal(upgraded.historyVersion,2);
  assert.equal(await readFile(legacyPath,'utf8'),original);
});
test('import is an exclusive project-history operation',()=>{
  const args=['--project','p.json','--history','store','--import-history','old.json'];
  assert.equal(parse(args)['import-history'],'old.json');
  for(const extra of [['--serve-history'],['--list-history'],['--baseline','old.json'],['--output','out.json'],['--format','json']]) assert.throws(()=>parse([...args,...extra]));
  assert.throws(()=>parse(['--project','p.json','--import-history','old.json']));
});
test('analytics input budget marks oversized records as gaps without reading them',async t=>{
  const root=await fixture(t),input=richFixture(),id=await saveHistory(root,input);
  await truncate(join(root,projectKey(input.project),id),41*1024*1024);
  const window=await historyWindow(root,input.project);
  assert.equal(window.rows[0].error,'budget');assert.equal(trendRows(window)[0].error,'budget');
  assert.equal((await listHistory(root,input.project)).length,1);
});
test('offline history exports retain review and coverage, escape text and protect CSV formulas',()=>{
  const input=richFixture();input.project.name='=HYPERLINK';
  input.pages[0].report.violations[0].id='=CMD';input.pages[0].report.violations[0].help='<img src=x onerror="alert(1)">';
  const saved=upgradeSnapshot(input),html=exportHistory(saved,'html','es'),csv=exportHistory(saved,'csv','es');
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script'));assert.match(html,/&lt;img/);
  assert.match(html,/Requiere revisión humana/);assert.match(csv,/"'=CMD"/);assert.match(csv,/"review"/);assert.match(csv,/"page","succeeded"/);
  const legacy=exportHistory(validateSnapshot(input),'csv','en');assert.match(legacy,/review-unavailable/);
  assert.throws(()=>exportHistory(saved,'pdf'),/Unsupported/);
  assert.equal(JSON.parse(exportHistory(saved,'json')).historyVersion,2);
});
test('history exports reject large HTML input and repeated CSV guidance before unbounded output',()=>{
  const input=richFixture();input.pages[0].report.violations[0].nodes=Array.from({length:1000},()=>({target:['x'.repeat(6000)]}));
  assert.throws(()=>exportHistory(upgradeSnapshot(input),'html','es'),/5 MiB/);
  const repeated=richFixture(),rule=repeated.pages[0].report.violations[0];
  rule.recommendation.correction='x'.repeat(16000);rule.recommendation.verification='y'.repeat(16000);
  rule.nodes=Array.from({length:2000},(_,i)=>({target:[`#node-${i}`]}));
  assert.throws(()=>exportHistory(upgradeSnapshot(repeated),'csv','es'),/40 MiB/);
});
