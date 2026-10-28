import {createWebJobSupervisor} from '../src/web-job-supervisor.js';
import {startWebJobTransport} from '../src/web-job-transport.js';
import https from 'node:https';
import {createRequestMediator} from '../src/request-mediator.js';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdtemp,readFile,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {auditPageInDocker} from '../src/docker-audit.js';
import {immutableImage} from '../src/isolation.js';
import {auditProject} from '../src/runner.js';
import {saveHistory,latestHistory,projectKey} from '../src/history.js';
import {validateSnapshot} from '../src/comparison.js';

const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--image'||args[2]!=='--output')throw new Error('Usage: node scripts/contained-acceptance.js --image sha256:... --output NEW_RESULT.json');
const imageId=immutableImage(args[1]),execute=promisify(execFile),checks={};let stage='fixtures',failure,forbiddenHits=0,postHits=0,upgradeHits=0,cookieHits=0,notifySlow;
const key=await readFile(new URL('../tests/fixtures/localhost-test-key.pem',import.meta.url)),cert=await readFile(new URL('../tests/fixtures/localhost-cert.pem',import.meta.url));
const secure=https.createServer({key,cert},(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><title>TLS fixture</title><main><h1>TLS</h1><button></button></main></html>');});
const forbidden=http.createServer((_,res)=>{forbiddenHits++;res.end('forbidden');});
const server=http.createServer((req,res)=>{
  if(req.url==='/page'&&req.headers.cookie?.includes('session=fixture'))cookieHits++;
  if(req.method!=='GET'){postHits++;res.end('write');return;}
  if(req.url==='/slow'){notifySlow?.();return;}
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/page','Set-Cookie':['session=fixture; HttpOnly; SameSite=Lax','language=es; SameSite=Lax']});res.end();return;}
  const attack=req.url==='/foreign'?`<img src="http://127.0.0.1:${forbidden.address().port}/secret" alt="fixture">`:
    req.url==='/socket'?`<script>new WebSocket("ws://127.0.0.1:${server.address().port}/socket")</script>`:
    req.url==='/metadata'?'<script>fetch("http://169.254.169.254/").catch(()=>{})</script>':
    req.url==='/post'?'<script>fetch("/write",{method:"POST"}).catch(()=>{})</script>':'';
  const marker=req.url==='/member'&&req.headers.cookie?.includes('session=fixture')?'<p id="member">Member</p><button id="open" onclick="document.querySelector(\'#checkpoint\').showModal()">Open</button><dialog id="checkpoint"><h2>Checkpoint</h2><button>Close</button></dialog>':'';
  const page=`<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><button></button>${marker}${attack}<a href="/next">Next</a></main></body></html>`;
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Encoding':'gzip'});res.end(gzipSync(page));
});
server.on('upgrade',(req,socket)=>{upgradeHits++;socket.destroy();});
const dockerIds=async()=> (await execute('docker',['ps','-aq','--filter',`ancestor=${imageId}`],{timeout:30000,maxBuffer:65536,windowsHide:true,shell:false})).stdout.trim().split(/\s+/).filter(Boolean).sort();
let before;
try {
  before=await dockerIds();for(const fixture of [forbidden,server,secure]){fixture.listen(0,'127.0.0.1');await once(fixture,'listening');}
  const origin=`http://127.0.0.1:${server.address().port}`,network={allowPrivateOrigins:[origin]},audit=(url,options)=>auditPageInDocker(url,{...options,imageId});
  stage='real-axe';const report=await audit(origin+'/redirect',{network});assert.ok(report.violations.some(rule=>rule.id==='button-name'));assert.equal(report.url,origin+'/page');assert.equal(report.network.policyVersion,3);assert.equal(report.isolation.chromiumSandbox,true);assert.equal(cookieHits,1);checks.realAxeRedirectGzipCookies=true;
  stage='authenticated-project';const project={schemaVersion:1,name:'Contained fixture',urls:[origin+'/member'],network,viewports:[{name:'desktop',width:1000,height:700}],authentication:{profile:'member',readySelector:'#member'},journeys:[{name:'open-dialog',steps:[{action:'click',selector:'#open'}],readySelector:'#checkpoint[open]'}]};
  const sessionState={cookies:[{name:'session',value:'fixture',domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax',expires:-1}],origins:[]};
  const run=await auditProject(project,{audit,sessionState});assert.equal(run.totals.failed,0,run.pages[0].error);assert.equal(run.totals.succeeded,1);assert.equal(run.pages[0].report.viewport.width,1000);
  const root=await mkdtemp(join(tmpdir(),'accesspilot-contained-'));const savedId=await saveHistory(root,run);const saved=await latestHistory(root,project);assert.equal(saved.pages[0].report.isolation.imageId,imageId);validateSnapshot(saved);assert.equal(saved.pages[0].report.journey.name,'open-dialog');checks.authenticatedViewportJourneyHistory=true;
  // Fixed fixture data only; no session/user files are mounted into the worker.
  checks.historySaved=typeof savedId==='string';
  stage='crawl';const crawled=await auditProject({schemaVersion:1,name:'Contained crawl',urls:[origin+'/page'],network,crawl:{maxPages:2,maxDepth:1}},{audit});assert.equal(crawled.totals.succeeded,2);assert.equal(crawled.crawl.completeWithinScope,true);checks.crawl=true;
  stage='blocked-egress';await assert.rejects(audit(origin+'/foreign',{network}));await assert.rejects(audit(origin+'/post',{network}));await assert.rejects(audit(origin+'/socket',{network}));await assert.rejects(audit(origin+'/metadata',{network}));assert.equal(forbiddenHits,0);assert.equal(postHits,0);assert.equal(upgradeHits,0);checks.scopePostWebSocketMetadataDenied=true;
  stage='cancel-pending';const controller=new AbortController(),reached=new Promise(resolve=>notifySlow=resolve);
  const pending=audit(origin+'/slow',{network,signal:controller.signal});const observed=pending.then(()=>{throw new Error('Cancelled audit succeeded');},()=>{});
  await Promise.race([reached,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Slow fixture not reached')),20000).unref())]);controller.abort();await observed;checks.pendingCancellation=true;
  stage='tls';const tlsOrigin=`https://localhost:${secure.address().port}`,tlsNetwork={allowPrivateOrigins:[tlsOrigin]};
  const tlsReport=await auditPageInDocker(tlsOrigin,{imageId,network:tlsNetwork},{createMediator:(urls,network,options)=>createRequestMediator(urls,network,{...options,ca:cert})});assert.ok(tlsReport.violations.some(rule=>rule.id==='button-name'));
  await assert.rejects(auditPageInDocker(tlsOrigin,{imageId,network:tlsNetwork}));checks.verifiedTlsAndUntrustedCertificateDenied=true;
  stage='cli';const file=join(root,'project.json'),output=join(root,'cli.json');await writeFile(file,JSON.stringify({schemaVersion:1,name:'Contained CLI',urls:[origin+'/page'],network}));
  await execute(process.execPath,['src/cli.js','--project',file,'--isolation-image',imageId,'--job-store',join(root,'jobs'),'--resource-store',join(root,'resources'),'--format','json','--output',output],{timeout:60000,maxBuffer:65536,windowsHide:true,shell:false});const cli=JSON.parse(await readFile(output,'utf8'));assert.equal(cli.totals.succeeded,1);assert.equal(cli.pages[0].report.isolation.imageId,imageId);checks.cli=true;
  const journal=JSON.parse(await readFile(join(root,'jobs','jobs.json'),'utf8'));assert.equal(journal.records.length,1);assert.equal(journal.records[0].state,'succeeded');checks.queueJournal=true;
  await assert.rejects(lstat(join(root,'resources','.resource-lock')),{code:'ENOENT'});await assert.rejects(lstat(join(root,'jobs','resource-lease.json')),{code:'ENOENT'});checks.sharedResourceReleased=true;
  stage='managed-admission';
  let managed;
  const transport=await startWebJobTransport({workspace:{schemaVersion:1,name:'Managed fixture',projects:[project]},
    directory:join(root,'managed-jobs'),resourceDirectory:join(root,'resources'),historyRoot:join(root,'managed-history'),imageId,
    sessionStates:{[projectKey(project)]:sessionState}}, {createSupervisor:async options=>managed=await createWebJobSupervisor(options)});
  try {
    const credentials=transport.openSession(),body=JSON.stringify({schemaVersion:1,projectId:transport.projects()[0].id,requestId:'00000000-0000-4000-8000-000000000001'});
    const headers={origin:transport.origin,authorization:'Bearer '+credentials.token,'x-accesspilot-csrf':credentials.csrf,'content-type':'application/json'};
    assert.equal((await fetch(transport.origin+'/api/v1/jobs',{method:'POST',headers:{...headers,origin:'https://foreign.example'},body})).status,403);
    checks.httpCommandsSecured=true;
    const submit=async()=>{const response=await fetch(transport.origin+'/api/v1/jobs',{method:'POST',headers,body});assert.equal(response.status,202);return response.json();};
    const [one,two]=await Promise.all([submit(),submit()]);assert.equal(one.id,two.id);assert.equal((await managed.wait(one.id)).state,'succeeded');
    assert.equal(managed.inspect().queue.records.length,1);checks.managedWebAdmission=true;
    const status=await fetch(transport.origin+'/api/v1/jobs/'+one.id,{headers:{authorization:headers.authorization}});assert.equal(status.status,200);assert.equal((await status.json()).state,'succeeded');
    const foreign=transport.openSession();assert.equal((await fetch(transport.origin+'/api/v1/jobs/'+one.id,{headers:{authorization:'Bearer '+foreign.token}})).status,404);checks.httpStatusOwned=true;
    const managedSaved=await latestHistory(join(root,'managed-history'),project);assert.equal(managedSaved.pages[0].report.isolation.imageId,imageId);assert.equal(managedSaved.pages[0].report.journey.name,'open-dialog');checks.managedHistorySaved=true;
  } finally {await transport.close();}
  await assert.rejects(lstat(join(root,'resources','.resource-lock')),{code:'ENOENT'});checks.managedResourceReleased=true;
  stage='cleanup';assert.deepEqual(await dockerIds(),before);checks.ownedContainersRemoved=true;stage='complete';
} catch(error) {failure={message:error.message,cause:error.cause?.message};}
finally {for(const fixture of [server,forbidden,secure]){fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));}}
const result={schemaVersion:1,kind:'contained-browser-acceptance',passed:!failure,imageId,stage,checks,...(failure?{failure}:{}),note:'Controlled fixture acceptance for this image/runner. Not independent security review or production readiness; platform coverage depends on where this harness was actually executed.'};
await writeFile(args[3],JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(result));process.exitCode=failure?2:0;
