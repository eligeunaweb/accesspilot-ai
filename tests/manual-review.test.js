import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import './helpers/outer-sandbox.js';
import { richFixture } from './fixtures/rich-history.js';
import { upgradeSnapshot, validateSnapshot, compareAudits } from '../src/comparison.js';
import { createReviewTemplate, attachManualReview } from '../src/manual-review-service.js';
import { auditFingerprint, manualSummary } from '../src/manual-review.js';
import { manualReviewHTML } from '../src/manual-review-view.js';
import { saveHistory, latestHistory, listHistory } from '../src/history.js';
import { exportHistory } from '../src/history-export.js';
import { snapshotMetrics } from '../src/history-metrics.js';
import { parse } from '../src/args.js';
import { startHistoryViewer } from '../src/viewer.js';

const snapshot=()=>upgradeSnapshot(richFixture());
function batchFor(source) {
  const batch=createReviewTemplate(source);batch.reviewer='test-reviewer';batch.checks[0].status='failed';batch.checks[0].environment='Synthetic test data; not a human assessment';batch.checks[0].evidence='Synthetic keyboard observation for software testing';return batch;
}
async function temporary(t) {const root=await mkdtemp(join(tmpdir(),'accesspilot-manual-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
function cli(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('../src/cli.js',import.meta.url)),...args],{windowsHide:true,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:'not-installed-offline-test'}});let out='',err='';
    child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
  });
}

test('manual templates default to not-tested and bind canonical audit evidence',()=>{
  const source=snapshot(),draft=createReviewTemplate(source);
  assert.equal(draft.auditFingerprint,auditFingerprint(source));assert.equal(draft.checks[0].status,'not-tested');assert.equal(draft.checks[0].viewport,null);assert.equal(draft.checks[0].journey,null);
  assert.deepEqual(manualSummary(source),{passed:0,failed:0,'not-applicable':0,'not-tested':0});assert.match(manualReviewHTML(source,'en'),/does not imply a successful review/);
  assert.equal(attachManualReview(source,draft).manualReviews[0].checks[0].status,'not-tested');
});
test('history v3 preserves declarations; legacy versions remain readable and automated evidence unchanged',()=>{
  const source=snapshot(),reviewed=attachManualReview(source,batchFor(source));
  assert.equal(reviewed.historyVersion,3);assert.equal(reviewed.generatedAt,source.generatedAt);assert.deepEqual(validateSnapshot(reviewed),reviewed);assert.deepEqual(upgradeSnapshot(reviewed),reviewed);
  assert.deepEqual(snapshotMetrics(reviewed),snapshotMetrics(source));assert.equal(compareAudits(source,reviewed).totals.persistent,1);assert.equal(compareAudits(source,reviewed).totals.resolved,0);
  assert.equal(manualSummary(reviewed).failed,1);assert.equal(auditFingerprint(reviewed),auditFingerprint(source));
  assert.throws(()=>validateSnapshot({...reviewed,historyVersion:2}),/historyVersion 3/);
  assert.throws(()=>validateSnapshot({...source,historyVersion:3}),/1–20/);
  assert.equal(upgradeSnapshot({...richFixture(),historyVersion:1}).historyVersion,2);
});
test('manual schema rejects invalid scope, chronology, methods, duplicates and executable fields',()=>{
  const source=snapshot(),valid=batchFor(source);
  const mutations=[b=>b.extra='ignored?',b=>b.auditFingerprint='0'.repeat(64),b=>b.reviewedAt='2020-01-01T00:00:00.000Z',b=>b.reviewedAt='2026-02-30T00:00:00.000Z',b=>b.reviewer='',b=>b.checks=[],
    b=>b.checks[0].url='https://other.org/',b=>b.checks[0].viewport='unknown',b=>delete b.checks[0].journey,b=>b.checks[0].status='compliant',b=>b.checks[0].method='javascript',b=>b.checks[0].evidence='',
    b=>b.checks[0].environment='x'.repeat(501),b=>b.checks[0].criteria=['99.2.3'],b=>b.checks[0].criteria=['4.5.99'],b=>b.checks[0].criteria=['2.1.5'],b=>b.id='id\n',b=>b.checks[0].criteria=['2.1.1','2.1.1'],b=>b.checks[0].attachment='file:///secret',b=>b.checks.push(structuredClone(b.checks[0]))];
  for(const mutate of mutations){const batch=structuredClone(valid);mutate(batch);assert.throws(()=>attachManualReview(source,batch));}
  const reviewed=attachManualReview(source,valid);assert.throws(()=>attachManualReview(reviewed,valid),/Duplicate/);
  assert.throws(()=>validateSnapshot({...reviewed,manualReviews:Array(21).fill(valid)}),/1–20/);
  const modern=structuredClone(valid);modern.checks[0].criteria=['2.4.13','3.3.9','4.1.1'];assert.equal(attachManualReview(source,modern).manualReviews[0].checks[0].criteria.length,3);
  const tampered=structuredClone(reviewed);tampered.pages[0].report.violations=[];assert.throws(()=>validateSnapshot(tampered),/does not match/);
});
test('reviews remain append-only, chronological and tied to available page/profile/checkpoint identities',()=>{
  const source=snapshot(),first=batchFor(source),one=attachManualReview(source,first),next=batchFor(one);next.id='follow-up';next.reviewedAt=new Date(Date.parse(first.reviewedAt)+1).toISOString();next.checks[0].status='passed';
  const two=attachManualReview(one,next);assert.equal(two.manualReviews.length,2);assert.equal(two.manualReviews[0].checks[0].status,'failed');assert.deepEqual(manualSummary(two),{passed:1,failed:1,'not-applicable':0,'not-tested':0});assert.equal(source.manualReviews,undefined);
  const earlier=batchFor(two);earlier.reviewedAt=first.reviewedAt;assert.throws(()=>attachManualReview(two,earlier),/chronology/);
  const failed=snapshot();failed.pages[0]={url:failed.pages[0].url,status:'failed'};failed.coverageComplete=false;
  const draft=createReviewTemplate(failed);assert.equal(attachManualReview(failed,draft).manualReviews.length,1);draft.checks[0].status='passed';assert.throws(()=>attachManualReview(failed,draft),/not-tested/);
});
test('HTML escapes human content and CSV separates declarations with formula protection',()=>{
  const source=snapshot(),batch=batchFor(source);batch.reviewer='=HYPERLINK("bad")';batch.checks[0].evidence='<script>alert(1)</script>';const reviewed=attachManualReview(source,batch);
  for(const lang of ['es','en']) {const html=exportHistory(reviewed,'html',lang);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/test|declar/i);}
  const csv=exportHistory(reviewed,'csv');assert.match(csv,/manual-declaration/);assert.match(csv,/manual_evidence/);assert.ok(csv.includes("'=HYPERLINK"));
  assert.equal(JSON.parse(exportHistory(reviewed,'json')).manualReviews.length,1);
  const many=structuredClone(reviewed);many.manualReviews=Array.from({length:7},(_,i)=>({...structuredClone(reviewed.manualReviews[0]),id:'batch-'+i,checks:Array.from({length:21},(_,j)=>({...structuredClone(reviewed.manualReviews[0].checks[0]),id:'check-'+j}))}));
  const validated=validateSnapshot(many);assert.equal((manualReviewHTML(validated,'en',{limited:true}).match(/<article>/g)??[]).length,100);assert.equal((exportHistory(validated,'html').match(/<article>/g)??[]).length,147);
});
test('offline CLI generates safe templates and adds history without overwriting the source',async t=>{
  const root=await temporary(t),source=snapshot(),project=join(root,'project.json'),audit=join(root,'audit.json'),review=join(root,'review.json'),history=join(root,'history');
  await writeFile(project,JSON.stringify(source.project));await writeFile(audit,JSON.stringify(source));const original=await readFile(audit,'utf8');
  let result=await cli(['--project',project,'--review-template',audit,'--output',review]);assert.equal(result.code,0,result.err);let batch=JSON.parse(await readFile(review,'utf8'));assert.equal(batch.checks[0].status,'not-tested');
  result=await cli(['--project',project,'--review-template',audit,'--output',review]);assert.equal(result.code,2);assert.equal(await readFile(audit,'utf8'),original);
  batch.reviewer='synthetic-reviewer';await writeFile(review,JSON.stringify(batch));
  await saveHistory(history,source);result=await cli(['--project',project,'--review-audit',audit,'--manual-review',review,'--history',history]);assert.equal(result.code,0,result.err);assert.equal(JSON.parse(result.out).kind,'manual-review-import');
  assert.equal((await listHistory(history,source.project)).length,2);assert.equal((await latestHistory(history,source.project)).historyVersion,3);assert.equal(await readFile(audit,'utf8'),original);
  const other={...source.project,name:'Other'};await writeFile(project,JSON.stringify(other));result=await cli(['--project',project,'--review-audit',audit,'--manual-review',review,'--history',history]);assert.equal(result.code,2);assert.match(result.err,/another project/);
});
test('manual CLI rejects audit/network and conflicting operation flags',()=>{
  const base=['--project','p','--review-template','a'];assert.equal(parse(base)['review-template'],'a');
  for(const args of [['https://example.org','--review-template','a'],[...base,'--session-state','secret'],[...base,'--serve-history','--history','h'],[...base,'--format','json'],[...base,'--manual-review','r'],['--project','p','--manual-review','r','--review-audit','a']]) assert.throws(()=>parse(args));
});
test('manual declarations are accessible and downloadable in the protected bilingual viewer', {timeout:30000},async t=>{
  const root=await temporary(t),source=snapshot(),reviewed=attachManualReview(source,batchFor(source)),id=await saveHistory(root,reviewed);
  const viewer=await startHistoryViewer({root,project:source.project});t.after(()=>viewer.close());const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const context=await browser.newContext(),page=await context.newPage();
  for(const lang of ['es','en']) {await page.goto(viewer.url+'?'+new URLSearchParams({run:id,lang}));await page.locator('summary').filter({hasText:reviewed.manualReviews[0].id}).click();assert.equal(await page.getByText('test-reviewer',{exact:false}).isVisible(),true);assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(rule=>rule.id),[]);}
  for(const format of ['json','html','csv']) {const response=await fetch(viewer.url+'?'+new URLSearchParams({run:id,download:format}));assert.equal(response.status,200);assert.match(await response.text(),/test-reviewer/);}
});
