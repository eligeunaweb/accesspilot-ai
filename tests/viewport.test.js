import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import './helpers/outer-sandbox.js';
import { auditPage } from '../src/audit.js';
import { validateProject } from '../src/project.js';
import { auditProject, projectExitCode } from '../src/runner.js';
import { compareAudits, validateSnapshot, upgradeSnapshot } from '../src/comparison.js';
import { saveHistory, latestHistory } from '../src/history.js';
import { renderProject } from '../src/project-report.js';
import { csvReport, htmlReport } from '../src/report.js';
import { exportHistory } from '../src/history-export.js';
import { startHistoryViewer } from '../src/viewer.js';

const viewports=[{name:'mobile',width:375,height:812},{name:'desktop',width:1280,height:800}];
const project={schemaVersion:1,name:'Responsive fixture',urls:['https://example.org'],viewports};
function report(url,viewport,violations=true) {
  return {schemaVersion:1,kind:'page-audit',url,viewport,language:'en',engine:{name:'axe-core',version:'fixture'},passes:0,incomplete:0,incompleteDetails:[],
    violations:violations?[{id:'image-alt',impact:'serious',wcag:['1.1.1'],nodes:[{target:['#image']}]}]:[]};
}
const fake=async(url,{viewport})=>report(url,viewport);

test('viewport configuration is bounded, strict and leaves implicit legacy mode unchanged',()=>{
  assert.equal(validateProject({...project,viewports:undefined}).viewports,undefined);
  assert.equal(validateProject(project).viewports.length,2);
  for(const profiles of [[],null,Array(5).fill(viewports[0]),[{...viewports[0],width:'375'}],[{...viewports[0],height:0}],
    [{...viewports[0],width:3841}],[{...viewports[0],name:'../mobile'}],[{...viewports[0],isMobile:true}],[viewports[0],viewports[0]],
    [viewports[0],{...viewports[0],name:'same-size'}]]) assert.throws(()=>validateProject({...project,viewports:profiles}));
  assert.throws(()=>validateProject({...project,crawl:{maxPages:51}}),/100/);
  assert.throws(()=>validateProject({...project,urls:Array.from({length:51},(_,i)=>`https://example.org/${i}`)}),/100/);
});
test('profile batches share concurrency, preserve order and cancel queued combinations',async()=>{
  let active=0,maximum=0;
  const run=await auditProject({...project,urls:['https://example.org/a','https://example.org/b'],concurrency:2},{audit:async(url,options)=>{
    maximum=Math.max(maximum,++active);await new Promise(resolve=>setTimeout(resolve,5));active--;return fake(url,options);
  }});
  assert.equal(maximum,2);assert.equal(run.pages.length,4);
  assert.deepEqual(run.pages.map(page=>page.viewport.name),['mobile','mobile','desktop','desktop']);
  assert.equal(validateSnapshot(run).pages.length,4);
  const controller=new AbortController();let calls=0;
  const cancelled=await auditProject(project,{signal:controller.signal,audit:async(url,options)=>{calls++;controller.abort();return fake(url,options);}});
  assert.equal(calls,1);assert.equal(cancelled.totals.cancelled,2);assert.equal(projectExitCode(cancelled),2);
});
test('runner refuses mismatched effective viewport evidence',async()=>{
  const run=await auditProject(project,{audit:async url=>report(url,{name:'wrong',width:375,height:812})});
  assert.equal(run.totals.failed,2);assert.equal(projectExitCode(run),2);
});
test('snapshots keep URL/profile identities and reject duplicate or contradictory profiles',async()=>{
  const run=await auditProject(project,{audit:fake});
  assert.equal(upgradeSnapshot(run).pages[0].report.viewport.name,'mobile');
  const duplicate=structuredClone(run);duplicate.pages[1]=duplicate.pages[0];assert.throws(()=>validateSnapshot(duplicate),/scope/);
  const mismatch=JSON.parse(JSON.stringify(run));mismatch.pages[0].report.viewport.width=400;assert.throws(()=>validateSnapshot(mismatch),/viewport/);
  const unknown=structuredClone(run);unknown.pages[0].viewport.isMobile=true;assert.throws(()=>validateSnapshot(unknown),/viewport/);
  const missing=structuredClone(run);delete missing.pages[0].viewport;assert.throws(()=>validateSnapshot(missing),/viewport/);
});
test('dimensions, renamed profiles and implicit legacy runs never become false resolutions',async()=>{
  const before=await auditProject(project,{audit:fake}),after=structuredClone(before);
  after.project.viewports[0].width=400;after.pages[0].viewport.width=400;after.pages[0].report.viewport.width=400;after.pages[0].report.violations=[];
  const changed=compareAudits(before,after);
  assert.equal(changed.totals.resolved,0);assert.equal(changed.totals.incomparablePages,1);
  assert.equal(changed.pages.find(page=>page.viewport.name==='mobile').reason,'viewport-changed');
  const legacy=await auditProject({...project,viewports:undefined},{audit:fake});
  assert.equal(compareAudits(legacy,before).totals.comparablePages,0);
  assert.equal(compareAudits(before,before).totals.persistent,2);
  const renamed=structuredClone(before);renamed.project.viewports[0].name='phone';renamed.pages[0].viewport.name='phone';renamed.pages[0].report.viewport.name='phone';
  assert.equal(compareAudits(before,renamed).totals.resolved,0);
});
test('each responsive crawl discovers its own graph and all profiles share one deadline', {timeout:10000},async()=>{
  const run=await auditProject({...project,crawl:{maxPages:3,maxDepth:1}},{audit:async(url,{viewport})=>({...report(url,viewport),network:{policyVersion:1},discovery:{links:url==='https://example.org/'?[`https://example.org/${viewport.name}`]:[],truncated:false}})});
  assert.deepEqual(run.pages.map(page=>[page.url,page.viewport.name]),[
    ['https://example.org/','mobile'],['https://example.org/mobile','mobile'],['https://example.org/','desktop'],['https://example.org/desktop','desktop']]);
  assert.equal(run.crawl.completeWithinScope,true);assert.equal(validateSnapshot(run).pages.length,4);
  let calls=0;
  const deadline=await auditProject({...project,crawl:{maxDurationMs:1000}},{audit:async(url,{signal})=>{
    calls++;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('deadline')),{once:true}));
  }});
  assert.equal(calls,1);assert.equal(deadline.totals.cancelled,2);assert.equal(deadline.crawl.truncated,true);assert.equal(projectExitCode(deadline),2);
});
test('profiles are visible in text, HTML, CSV and historical exports',async()=>{
  const run=await auditProject(project,{audit:fake});
  for(const format of ['text','html','csv']) {
    const output=renderProject(run,format);assert.match(output,/mobile/);assert.match(output,/desktop/);
  }
  const csv=renderProject(run,'csv');assert.match(csv,/viewport_width/);assert.match(csv,/"mobile","375","812"/);
  assert.match(csvReport(run.pages[0].report),/"mobile","375","812"/);
  assert.match(htmlReport(run.pages[0].report),/mobile/);
  for(const format of ['html','csv']) assert.match(exportHistory(upgradeSnapshot(run),format),/desktop/);
});
test('audit rejects malformed viewport before launching Chromium',async()=>{
  let launched=false;
  await assert.rejects(auditPage('https://example.org',{viewport:{name:'bad',width:0,height:800},launch:async()=>{launched=true;}}),/Viewport/);
  assert.equal(launched,false);
});

test('real CSS breakpoints produce separate axe results, CLI history and accessible profile views', {timeout:60000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'accesspilot-responsive-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><title>Responsive fixture</title><style>@media(min-width:600px){#mobile-only{display:none}}</style></head><body><main><h1>Responsive</h1><button id="mobile-only"></button><p>Controlled fixture</p></main><script>if(location.pathname==="/"){const a=document.createElement("a");a.href=matchMedia("(max-width:600px)").matches?"/mobile":"/desktop";a.textContent="Next page";document.querySelector("main").append(a);}</script></body></html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/`,config={...project,urls:[url],network:{allowPrivateOrigins:[url]},language:'en'};
  const run=await auditProject(config);
  assert.equal(run.totals.succeeded,2,JSON.stringify(run.pages));
  assert.equal(run.pages[0].report.violations.some(rule=>rule.id==='button-name'),true);
  assert.equal(run.pages[1].report.violations.some(rule=>rule.id==='button-name'),false);
  await auditPage(url,{viewport:viewports[0],analyze:async page=>{
    assert.deepEqual(page.viewportSize(),{width:375,height:812});
    return new AxeBuilder({page}).analyze();
  }});
  const crawled=await auditProject({...config,crawl:{maxPages:2,maxDepth:1}});
  assert.equal(crawled.totals.succeeded,4,JSON.stringify(crawled.pages));
  assert.deepEqual(crawled.pages.map(page=>[new URL(page.url).pathname,page.viewport.name]),[
    ['/','mobile'],['/mobile','mobile'],['/','desktop'],['/desktop','desktop']]);
  assert.equal(crawled.crawl.completeWithinScope,true);assert.equal(validateSnapshot(crawled).pages.length,4);
  const id=await saveHistory(join(root,'history'),run),saved=await latestHistory(join(root,'history'),config);
  assert.equal(saved.pages.length,2);assert.equal(compareAudits(saved,run).totals.comparablePages,2);
  const file=join(root,'responsive.json');await writeFile(file,JSON.stringify(config));
  const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--import',new URL('./helpers/outer-sandbox.js',import.meta.url).href,cli,'--project',file,'--format','csv'],{windowsHide:true});
    let out='',err='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
  });
  assert.equal(result.code,0,result.err);assert.match(result.out,/viewport_width/);assert.match(result.out,/"desktop","1280","800"/);
  const viewer=await startHistoryViewer({root:join(root,'history'),project:config});t.after(()=>viewer.close());
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(viewer.url+'?run='+id);assert.equal(await page.locator('main > details').count(),2);
  const labels=await page.locator('main > details > summary').allTextContents();assert.match(labels[0],/mobile.*375/);assert.match(labels[1],/desktop.*1280/);
  assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(rule=>rule.id),[]);
  await page.goto(viewer.url+'?'+new URLSearchParams({before:id,after:id}));
  assert.match(await page.locator('main').innerText(),/mobile/);assert.match(await page.locator('main').innerText(),/desktop/);
  assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(rule=>rule.id),[]);
});
