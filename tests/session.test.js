import test from 'node:test';
import { fileURLToPath } from 'node:url';
import './helpers/outer-sandbox.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { validateProject } from '../src/project.js';
import { validateSessionState, loadSessionState } from '../src/session.js';
import { auditProject, projectExitCode } from '../src/runner.js';
import { compareAudits, upgradeSnapshot } from '../src/comparison.js';
import { saveHistory, latestHistory } from '../src/history.js';
import { parse } from '../src/args.js';
import { renderProject } from '../src/project-report.js';
import { exportHistory } from '../src/history-export.js';
import { csvReport, htmlReport } from '../src/report.js';

const authentication={profile:'member',readySelector:'[data-access="member"]'};
const config={schemaVersion:1,name:'Members',urls:['https://example.org/private'],authentication};
const state={cookies:[{name:'session',value:'PRIVATE-SESSION-VALUE',domain:'example.org',path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'}],origins:[]};
const report=(url,options)=>({schemaVersion:1,kind:'page-audit',url,authentication:options.authentication,engine:{name:'axe-core',version:'4'},network:{policyVersion:1},violations:[]});

test('authentication validates public metadata and forces a single restricted HTTPS origin',()=>{
  const project=validateProject(config);assert.ok(project.network);assert.deepEqual(project.authentication,authentication);
  for(const change of [{authentication:{...authentication,password:'secret'}},{authentication:{...authentication,profile:'bad role'}},{authentication:{...authentication,readySelector:''}},
    {urls:['https://example.org','https://other.org']},{urls:['http://example.org']},{network:{resourceOrigins:['https://cdn.example.org']}}]) assert.throws(()=>validateProject({...config,...change}));
});
test('state validation rejects scope escapes, expired cookies, unsupported storage and duplicate keys',()=>{
  const project=validateProject(config);assert.deepEqual(validateSessionState(state,project),state);
  for(const change of [{domain:'.example.org'},{domain:'other.org'},{expires:1},{secure:false},{partitionKey:'https://example.org'},{value:'bad\nvalue'}]) {
    assert.throws(()=>validateSessionState({...state,cookies:[{...state.cookies[0],...change}]},project));
  }
  assert.throws(()=>validateSessionState({...state,cookies:[state.cookies[0],state.cookies[0]]},project));
  assert.throws(()=>validateSessionState({...state,origins:[{origin:'https://other.org',localStorage:[]}]},project));
  assert.throws(()=>validateSessionState({...state,origins:[{origin:'https://example.org',localStorage:[],indexedDB:[]}]},project));
  assert.throws(()=>validateSessionState({cookies:[],origins:[]},project));
  assert.throws(()=>validateSessionState({...state,cookies:Array(101).fill(state.cookies[0])},project));
  const local={cookies:[],origins:[{origin:'https://example.org',localStorage:[{name:'token',value:'private'}]}]};
  assert.deepEqual(validateSessionState(local,project),local);
  assert.throws(()=>validateSessionState({...local,origins:[{...local.origins[0],localStorage:[...local.origins[0].localStorage,...local.origins[0].localStorage]}]},project));
});
test('CLI sessions are audit-only and never accepted for history operations or legacy URL',()=>{
  assert.equal(parse(['--project','project.json','--session-state','private.json'])['session-state'],'private.json');
  for(const args of [['https://example.org'],['--project','p','--history','h','--serve-history'],['--project','p','--history','h','--import-history','i']]) assert.throws(()=>parse([...args,'--session-state','secret']));
});
test('session input is bounded and diagnostics never echo file paths or secret values',async t=>{
  const root=await mkdtemp(join(tmpdir(),'accesspilot-session-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,'PRIVATE-FILENAME.json'),project=validateProject(config);
  await writeFile(file,JSON.stringify(state));assert.deepEqual(await loadSessionState(file,project),state);
  for(const content of ['PRIVATE-SESSION-VALUE','x'.repeat(1024*1024+1)]) {
    await writeFile(file,content);await assert.rejects(loadSessionState(file,project),error=>error.message==='Session state could not be loaded or validated');
  }
  await assert.rejects(loadSessionState(join(root,'MISSING-SECRET'),project),/Session state could not be loaded or validated/);
});
test('runtime secrets are isolated per target and excluded from snapshots; changed roles are incomparable',async()=>{
  const calls=[];
  const run=await auditProject({...config,urls:['https://example.org/private','https://example.org/second']},{sessionState:state,audit:async(url,options)=>{
    calls.push(options.sessionState.cookies[0].value);options.sessionState.cookies[0].value='mutated';return report(url,options);
  }});
  assert.deepEqual(calls,['PRIVATE-SESSION-VALUE','PRIVATE-SESSION-VALUE']);assert.equal(run.totals.succeeded,2);
  assert.ok(!JSON.stringify(run).includes('PRIVATE-SESSION-VALUE'));assert.equal(upgradeSnapshot(run).pages.length,2);
  for(const format of ['text','csv','html']) assert.match(renderProject(run,format),/member/);
  for(const format of ['csv','html']) assert.match(exportHistory(upgradeSnapshot(run),format),/member/);
  const other=await auditProject({...config,authentication:{...authentication,profile:'admin'}},{sessionState:state,audit:async(url,opts)=>report(url,opts)});
  assert.equal(compareAudits(run,other).totals.comparablePages,0);
  const wrong=structuredClone(run);delete wrong.pages[0].report.authentication;assert.throws(()=>upgradeSnapshot(wrong),/authentication evidence/);
  const failed=await auditProject(config,{sessionState:state,audit:()=>{throw new Error('PRIVATE-SESSION-VALUE');}});
  assert.ok(!JSON.stringify(failed).includes('PRIVATE-SESSION-VALUE'));assert.equal(projectExitCode(failed),2);
  await assert.rejects(auditProject(config),/configuration or session state/);
  await assert.rejects(auditProject({...config,authentication:undefined},{sessionState:state}),/requires project authentication/);
});
test('real authenticated pages, isolated state, expired access, egress and CLI history', {timeout:60000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'accesspilot-auth-real-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let escaped=0,protectedRequests=0;
  const outside=createServer((req,res)=>{escaped++;res.end('unexpected');});await new Promise(resolve=>outside.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>outside.close(resolve)));
  const remote=`http://127.0.0.1:${outside.address().port}/`;
  const server=createServer((req,res)=>{
    if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
    res.setHeader('Content-Type','text/html');
    const ok=req.headers.cookie?.includes('session=PRIVATE-SESSION-VALUE');
    if(!ok){res.end('<!doctype html><html lang="en"><title>Login</title><main><h1>Sign in</h1></main></html>');return;}
    protectedRequests++;
    res.setHeader('Set-Cookie','session=changed; Path=/; HttpOnly');
    res.end(`<!doctype html><html lang="en"><title>Private</title><main data-access="member"><h1>Private</h1><button></button><a href="/second">Next</a><script>if(localStorage.getItem('token')!=='LOCAL-SECRET') document.querySelector('main').removeAttribute('data-access');localStorage.setItem('token','changed');${req.url==='/escape'?`fetch('${remote}').catch(()=>{})`:''}</script></main></html>`);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`,project={...config,urls:[url+'/private',url+'/second'],timeoutMs:15000,network:{allowPrivateOrigins:[url]}};
  const session={cookies:[{...state.cookies[0],domain:'127.0.0.1',secure:false}],origins:[{origin:url,localStorage:[{name:'token',value:'LOCAL-SECRET'}]}]};
  const run=await auditProject(project,{sessionState:session});assert.equal(run.totals.succeeded,2,JSON.stringify(run.pages));assert.equal(protectedRequests,2);
  assert.ok(run.pages.every(page=>page.report.violations.some(rule=>rule.id==='button-name')));
  const history=join(root,'history');await saveHistory(history,run);const saved=await latestHistory(history,project);assert.equal(compareAudits(saved,run).totals.comparablePages,2);
  assert.match(csvReport(run.pages[0].report),/authentication_profile/);assert.match(htmlReport(run.pages[0].report),/Access profile: member/);
  assert.ok(!JSON.stringify(saved).includes('PRIVATE-SESSION-VALUE'));assert.ok(!JSON.stringify(saved).includes('LOCAL-SECRET'));
  const invalid={...session,cookies:[{...session.cookies[0],value:'expired'}]};
  const expired=await auditProject({...project,urls:[url+'/private'],timeoutMs:1000},{sessionState:invalid});assert.equal(expired.totals.failed,1);assert.equal(compareAudits(run,expired).totals.resolved,0);
  const blocked=await auditProject({...project,urls:[url+'/escape']},{sessionState:session});assert.equal(blocked.totals.failed,1);assert.equal(escaped,0);
  const projectFile=join(root,'project.json'),sessionFile=join(root,'private-session.json');await writeFile(projectFile,JSON.stringify(project));await writeFile(sessionFile,JSON.stringify(session));
  const before=await readFile(sessionFile,'utf8');
  const cli=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--import',new URL('./helpers/outer-sandbox.js',import.meta.url).href,fileURLToPath(new URL('../src/cli.js',import.meta.url)),'--project',projectFile,'--session-state',sessionFile,'--format','json','--history',history],{windowsHide:true});
    let out='',err='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
  });
  assert.equal(cli.code,0,cli.err);assert.equal(JSON.parse(cli.out).totals.succeeded,2);assert.ok(!cli.out.includes('PRIVATE-SESSION-VALUE'));assert.equal(await readFile(sessionFile,'utf8'),before);
});
