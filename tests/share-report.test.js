import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import './helpers/outer-sandbox.js';
import {richFixture} from './fixtures/rich-history.js';
import {createShareSummary,renderShareReport} from '../src/share-report.js';
import {upgradeSnapshot,validateSnapshot} from '../src/comparison.js';
import {createReviewTemplate,attachManualReview} from '../src/manual-review-service.js';
import {auditFingerprint} from '../src/manual-review.js';
import {saveHistory} from '../src/history.js';
import {startHistoryViewer} from '../src/viewer.js';
import {parse} from '../src/args.js';

const secret='PRIVATE-CANARY-123';
function source() {
  const run=richFixture(),url='https://private-canary-123.example/account/private-canary-123?token='+secret+'#'+secret;
  run.project.name=secret;run.project.urls=[url];run.pages[0].url=url;run.pages[0].report.url=url;
  const report=run.pages[0].report;report.engine={name:secret,version:secret};
  for(const rule of [...report.violations,...report.incompleteDetails]) {
    rule.help=secret;rule.description=secret;rule.recommendation={...rule.recommendation,correction:secret,verification:secret};
    rule.nodes=[{target:['#'+secret],html:secret,failureSummary:secret}];
  }
  run.comparison={secret};return run;
}
async function temporary(t) {const root=await mkdtemp(join(tmpdir(),'accesspilot-share-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}

test('positive projection excludes canaries in URLs/names/content/selectors/imported guidance and engine metadata',()=>{
  const run=source(),original=structuredClone(run),result=createShareSummary(run);
  assert.equal(result.kind,'shared-audit-summary');assert.equal(result.pages[0].page,'page-1');
  assert.equal(result.totals.affectedElements,1);assert.equal(result.totals.reviewRules,1);
  assert.equal(result.pages[0].findings[0].severity,'serious');assert.deepEqual(result.pages[0].findings[0].wcag,['1.1.1']);
  for(const format of ['json','html','csv','text']) {
    const output=renderShareReport(run,format);assert.ok(!output.toLowerCase().includes('private-canary'));assert.ok(!output.includes('PRIVATE HTML'));assert.ok(!output.includes('PRIVATE ERROR'));
  }
  assert.deepEqual(run,original);
});

test('arbitrary imported rule IDs become local aliases; curated guidance is regenerated',()=>{
  const run=source();run.pages[0].report.violations.push({...structuredClone(run.pages[0].report.violations[0]),id:secret});
  const summary=createShareSummary(run,'en');
  assert.equal(summary.pages[0].findings[0].rule,'image-alt');
  assert.equal(summary.pages[0].findings[1].rule,'rule-1');
  assert.equal(summary.pages[0].findings[1].recommendation.kind,'general');
  assert.ok(!JSON.stringify(summary).includes(secret));assert.ok(summary.note.includes('not original evidence'));
});

test('unknown legacy review and failed coverage remain unknown/incomplete',()=>{
  const legacy=validateSnapshot(source());const summary=createShareSummary(legacy);
  assert.equal(summary.totals.reviewRules,null);assert.equal(summary.pages[0].reviewRules,null);
  const failed=source();failed.pages[0]={url:failed.pages[0].url,status:'failed',error:secret};
  const result=createShareSummary(failed);assert.equal(result.coverageComplete,false);assert.equal(result.totals.reviewRules,null);assert.deepEqual(result.pages[0].findings,[]);
});

test('manual declarations are omitted and source fingerprints stay unchanged; summary cannot be imported as audit',()=>{
  const original=upgradeSnapshot(source()),draft=createReviewTemplate(original);draft.reviewer=secret;draft.checks[0].environment=secret;draft.checks[0].evidence=secret;
  const reviewed=attachManualReview(original,draft),before=auditFingerprint(reviewed);
  const summary=createShareSummary(reviewed);assert.ok(!JSON.stringify(summary).includes(secret));assert.equal(summary.manualReviews,undefined);
  assert.equal(auditFingerprint(reviewed),before);assert.throws(()=>validateSnapshot(summary),/Expected project-audit/);
});

test('aliases retain repeated-page association across independent viewports without leaking names',()=>{
  const run=source();run.project.viewports=[{name:'private-canary-123',width:800,height:600},{name:'other-secret',width:1200,height:800}];
  const base=run.pages[0];run.pages=run.project.viewports.map(viewport=>({...structuredClone(base),viewport,report:{...structuredClone(base.report),viewport}}));
  const result=createShareSummary(run);assert.deepEqual(result.pages.map(p=>p.page),['page-1','page-1']);assert.deepEqual(result.pages.map(p=>p.id),['target-1','target-2']);
  assert.deepEqual(result.pages[0].viewport,{width:800,height:600});assert.ok(!JSON.stringify(result).includes('private-canary'));
});

test('offline CLI flags reject scanning/history/session combinations and unsupported formats',()=>{
  assert.equal(parse(['--share-report','saved.json','--lang','es'])['share-report'],'saved.json');
  for(const extra of [['--project','p.json'],['https://example.org'],['--history','history'],['--session-state','auth.json'],['--fail-on-violations'],['--job-store','jobs'],['--format','xml']])assert.throws(()=>parse(['--share-report','saved.json',...extra]));
  assert.throws(()=>renderShareReport(source(),'xml'),/Unsupported/);
});

test('real CLI exports offline without installed browsers and refuses overwriting input or output',async t=>{
  const root=await temporary(t),input=join(root,'source.json'),output=join(root,'shared.json');const saved=JSON.stringify(source());await writeFile(input,saved);
  const execute=promisify(execFile),cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
  const options={timeout:10000,windowsHide:true,shell:false,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:'not-installed-share-test'}};
  await execute(process.execPath,[cli,'--share-report',input,'--format','json','--output',output],options);
  assert.equal(JSON.parse(await readFile(output,'utf8')).kind,'shared-audit-summary');
  await assert.rejects(execute(process.execPath,[cli,'--share-report',input,'--output',input],options),error=>error.code===2);
  await assert.rejects(execute(process.execPath,[cli,'--share-report',input,'--output',output],options),error=>error.code===2);
  assert.equal(await readFile(input,'utf8'),saved);
});

test('bilingual shared HTML has no external resources, passes axe and supports keyboard details',async t=>{
  const root=await temporary(t),browser=await chromium.launch();t.after(()=>browser.close());
  for(const lang of ['es','en']) {
    const file=join(root,lang+'.html');await writeFile(file,renderShareReport(source(),'html',lang));
    const context=await browser.newContext(),page=await context.newPage();const external=[];page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url());});
    await page.goto(pathToFileURL(file).href);
    assert.equal(await page.locator('html').getAttribute('lang'),lang);
    const details=page.locator('summary').first();await details.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('details').first().getAttribute('open'),'');
    assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(rule=>rule.id),[]);assert.deepEqual(external,[]);await context.close();
  }
});

test('protected viewer exports reduced summaries in all formats and preserves original downloads',async t=>{
  const root=await temporary(t),run=source(),id=await saveHistory(root,run);
  const viewer=await startHistoryViewer({root,project:run.project});t.after(()=>viewer.close());
  for(const format of ['json','html','csv']) {
    const response=await fetch(viewer.url+'?'+new URLSearchParams({run:id,download:'share-'+format,lang:'es'}));
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('content-disposition'),`attachment; filename="accesspilot-shared-summary.${format}"`);
    assert.ok(!(await response.text()).toLowerCase().includes('private-canary'));
  }
  const original=await fetch(viewer.url+'?'+new URLSearchParams({run:id,download:'json'}));
  assert.ok((await original.text()).includes(secret));
  const invalid=await fetch(viewer.url+'?'+new URLSearchParams({run:id,download:'share-pdf'}));assert.equal(invalid.status,400);
  const missing=await fetch(viewer.url+'?download=share-json');assert.equal(missing.status,400);
  const page=await fetch(viewer.url+'?'+new URLSearchParams({run:id,lang:'es'}));assert.ok((await page.text()).includes('Resumen para compartir'));
});

test('oversized finding projections fail before constructing a share artifact',()=>{
  const run=source(),page=run.pages[0];run.project.urls.push('https://example.org/other');
  page.report.violations=Array(5000).fill(page.report.violations[0]);
  const other=structuredClone(page);other.url='https://example.org/other';other.report.url=other.url;run.pages.push(other);
  assert.throws(()=>createShareSummary(run),/10000 finding rows/);
});

test('authentication profiles and declarative journey definitions never enter shared artifacts',()=>{
  const run=source(),authentication={profile:'private-canary-123',readySelector:'#'+secret};
  const journey={name:'private-canary-123',steps:[{action:'click',selector:'#'+secret}],readySelector:'#'+secret};
  run.project.network={};run.project.authentication=authentication;run.project.journeys=[journey];
  run.pages[0].journey=journey;run.pages[0].report.journey=journey;run.pages[0].report.authentication=authentication;
  for(const format of ['json','html','csv','text'])assert.ok(!renderShareReport(run,format).toLowerCase().includes('private-canary'));
});
