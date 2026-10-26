import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import './helpers/outer-sandbox.js';
import { validateProject } from '../src/project.js';
import { runJourney } from '../src/journey.js';
import { auditProject, projectExitCode } from '../src/runner.js';
import { validateSnapshot, compareAudits, upgradeSnapshot } from '../src/comparison.js';
import { renderProject } from '../src/project-report.js';
import { exportHistory } from '../src/history-export.js';
import { csvReport, htmlReport } from '../src/report.js';
import { richRunView } from '../src/history-detail-view.js';
import { evidenceFilters } from '../src/evidence-filter.js';
import { saveHistory, latestHistory } from '../src/history.js';
import { startHistoryViewer } from '../src/viewer.js';

const journeys=[{name:'initial',steps:[],readySelector:'#home'},
  {name:'dialog-open',steps:[{action:'click',selector:'#open'},{action:'waitFor',selector:'#panel',state:'visible'}],readySelector:'#panel'},
  {name:'dialog-closed',steps:[{action:'click',selector:'#open'},{action:'press',selector:'#panel',key:'Escape'},{action:'waitFor',selector:'#panel',state:'hidden'}],readySelector:'#home'}];
const project={schemaVersion:1,name:'Interactive fixture',urls:['https://example.org/'],journeys};
function fakeReport(url,options) {return {schemaVersion:1,kind:'page-audit',url,journey:options.journey,viewport:options.viewport,engine:{name:'axe-core',version:'test'},network:{policyVersion:1},violations:[]};}
const fake=async(url,options)=>fakeReport(url,options);

test('journeys validate strict bounded declarative actions and force restricted networking',()=>{
  const config=validateProject(project);assert.deepEqual(config.journeys,journeys);assert.ok(config.network);
  for(const journey of [{...journeys[0],name:[]},{...journeys[0],name:'A'}, {...journeys[0],readySelector:''}, {...journeys[0],script:'alert(1)'},
    {...journeys[0],steps:[{action:'fill',selector:'#password',value:'SECRET'}]}, {...journeys[0],steps:[{action:'click',selector:'#open',force:true}]},
    {...journeys[0],steps:[{action:'press',selector:'#open',key:'Control+L'}]}, {...journeys[0],steps:[{action:'waitFor',selector:'#open',state:'attached'}]},
    {...journeys[0],steps:Array(21).fill({action:'click',selector:'#open'})}]) assert.throws(()=>validateProject({...project,journeys:[journey]}));
  assert.throws(()=>validateProject({...project,crawl:{}}),/crawling/);
  assert.throws(()=>validateProject({...project,journeys:[journeys[0],journeys[0]]}),/unique/);
  assert.throws(()=>validateProject({...project,journeys:Array(11).fill(journeys[0])}),/1–10/);
  assert.throws(()=>validateProject({...project,urls:Array.from({length:34},(_,i)=>`https://example.org/${i}`)}),/100 page/);
});
test('step execution preserves order, uses bounded waits and sanitizes failures',async()=>{
  const calls=[],page={locator:selector=>({click:async options=>calls.push(['click',selector,options.timeout]),press:async(key,options)=>calls.push(['press',selector,key,options.timeout]),waitFor:async options=>calls.push(['waitFor',selector,options.state,options.timeout])})};
  await runJourney(page,journeys[2],{timeoutMs:10000});
  assert.deepEqual(calls,[['click','#open',5000],['press','#panel','Escape',5000],['waitFor','#panel','hidden',5000],['waitFor','#home','visible',5000]]);
  await assert.rejects(runJourney({locator:()=>({click:()=>{throw new Error('SECRET');}})},journeys[1]),error=>error.message==='Journey step 1 failed');
  const controller=new AbortController();controller.abort();await assert.rejects(runJourney(page,journeys[0],{signal:controller.signal}));
});
test('checkpoint targets share concurrency, preserve order and reject mismatched evidence',async()=>{
  let active=0,peak=0;
  const config={...project,concurrency:2,viewports:[{name:'phone',width:375,height:812},{name:'desktop',width:1280,height:800}]};
  const run=await auditProject(config,{audit:async(url,options)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return fakeReport(url,options);}});
  assert.equal(peak,2);assert.equal(run.totals.succeeded,6);assert.deepEqual(run.pages.map(page=>page.journey.name),[...journeys,...journeys].map(item=>item.name));
  assert.equal(validateSnapshot(run).pages.length,6);
  const failed=await auditProject(project,{audit:async(url,options)=>({...fakeReport(url,options),journey:undefined})});assert.equal(failed.totals.failed,3);assert.equal(projectExitCode(failed),2);
  const controller=new AbortController();controller.abort();const cancelled=await auditProject(project,{signal:controller.signal,audit:()=>assert.fail('must not run')});assert.equal(cancelled.totals.cancelled,3);
});
test('history binds URL viewport and checkpoint definitions without false resolutions',async()=>{
  const before=await auditProject(project,{audit:fake}),changed=structuredClone(project);changed.journeys[1].steps[0].selector='#other';
  const after=await auditProject(changed,{audit:fake}),result=compareAudits(before,after);
  assert.equal(result.totals.comparablePages,2);assert.equal(result.totals.incomparablePages,1);assert.equal(result.pages.find(page=>page.journey.name==='dialog-open').reason,'journey-changed');assert.equal(result.totals.resolved,0);
  const legacy=await auditProject({...project,journeys:undefined,network:{}},{audit:fake});assert.equal(compareAudits(legacy,before).totals.comparablePages,0);
  for(const mutate of [snapshot=>{snapshot.pages[1].journey=snapshot.pages[0].journey;},snapshot=>{delete snapshot.pages[0].report.journey;},snapshot=>{snapshot.pages.pop();}]) {
    const snapshot=JSON.parse(JSON.stringify(before));mutate(snapshot);assert.throws(()=>validateSnapshot(snapshot));
  }
  const rich=upgradeSnapshot(before);for(const format of ['text','csv','html']) assert.match(renderProject(before,format),/dialog-open/);
  for(const format of ['csv','html']) assert.match(exportHistory(rich,format),/dialog-open/);
  assert.match(csvReport(before.pages[1].report),/dialog-open/);assert.match(htmlReport(before.pages[1].report),/dialog-open/);
  assert.match(richRunView(rich,evidenceFilters(new URLSearchParams()),'en','/','run'),/dialog-open/);
  assert.match(richRunView(rich,evidenceFilters(new URLSearchParams()),'es','/','run'),/dialog-open/);
});
test('real dialog checkpoints, keyboard closure, missing markers, POST blocking, sessions, CLI and viewer', {timeout:60000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'accesspilot-journeys-'));t.after(()=>rm(root,{recursive:true,force:true}));let posts=0;
  const server=createServer((req,res)=>{
    if(req.method==='POST'){posts++;res.end('unexpected');return;}
    if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
    res.setHeader('Content-Type','text/html');
    if(req.url==='/private'&&!req.headers.cookie?.includes('session=private-token')) {res.end('<h1>Login</h1>');return;}
    res.end(`<!doctype html><html lang="en"><title>Dialog fixture</title><main id="home" data-access="member"><h1>Settings</h1><button id="open">Open options</button><button id="post">Submit</button><div id="panel" role="dialog" aria-modal="true" aria-label="Options" tabindex="-1" hidden><h2>Options</h2><button></button></div></main><script>document.querySelector('#open').onclick=()=>{document.querySelector('#panel').hidden=false;${req.url==='/lose-access'?"document.querySelector('#home').removeAttribute('data-access');":''}};document.onkeydown=event=>{if(event.key==='Escape')document.querySelector('#panel').hidden=true};document.querySelector('#post').onclick=()=>fetch('/write',{method:'POST'}).catch(()=>{});</script></html>`);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`,config={...project,urls:[url+'/'],network:{allowPrivateOrigins:[url]},timeoutMs:15000};
  const run=await auditProject(config);assert.equal(run.totals.succeeded,3,JSON.stringify(run.pages));
  assert.deepEqual(run.pages.map(page=>page.report.violations.some(rule=>rule.id==='button-name')),[false,true,false]);
  const history=join(root,'history'),id=await saveHistory(history,run),saved=await latestHistory(history,config);assert.equal(compareAudits(saved,run).totals.comparablePages,3);
  const viewer=await startHistoryViewer({root:history,project:config});t.after(()=>viewer.close());
  const html=await (await fetch(viewer.url+'?run='+id)).text();assert.match(html,/dialog-open/);assert.match(html,/dialog-closed/);
  const missing=await auditProject({...config,timeoutMs:1000,journeys:[{...journeys[0],readySelector:'#missing'}]});assert.equal(missing.totals.failed,1);assert.equal(compareAudits(run,missing).totals.resolved,0);
  const blocked=await auditProject({...config,journeys:[{name:'submit',steps:[{action:'click',selector:'#post'}],readySelector:'#home'}]});assert.equal(blocked.totals.failed,1);assert.equal(posts,0);
  const authenticated={...config,urls:[url+'/private'],journeys:[journeys[1]],authentication:{profile:'member',readySelector:'[data-access="member"]'}};
  const sessionState={cookies:[{name:'session',value:'private-token',domain:'127.0.0.1',path:'/',expires:-1,httpOnly:true,secure:false,sameSite:'Lax'}],origins:[]};
  const authRun=await auditProject(authenticated,{sessionState});assert.equal(authRun.totals.succeeded,1,JSON.stringify(authRun.pages));assert.equal(upgradeSnapshot(authRun).pages[0].report.journey.name,'dialog-open');
  const lostAccess=await auditProject({...authenticated,urls:[url+'/lose-access']},{sessionState});assert.equal(lostAccess.totals.failed,1);
  const file=join(root,'journeys.json');await writeFile(file,JSON.stringify(config));
  const cli=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--import',new URL('./helpers/outer-sandbox.js',import.meta.url).href,fileURLToPath(new URL('../src/cli.js',import.meta.url)),'--project',file,'--format','csv'],{windowsHide:true});let out='',err='';
    child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
  });assert.equal(cli.code,0,cli.err);assert.match(cli.out,/"journey"/);assert.match(cli.out,/dialog-open/);assert.match(cli.out,/dialog-closed/);
});
