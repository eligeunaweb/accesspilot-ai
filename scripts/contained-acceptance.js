import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {auditPageInDocker} from '../src/docker-audit.js';
import {immutableImage} from '../src/isolation.js';
import {auditProject} from '../src/runner.js';
import {saveHistory,latestHistory} from '../src/history.js';
import {validateSnapshot} from '../src/comparison.js';

const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--image'||args[2]!=='--output')throw new Error('Usage: node scripts/contained-acceptance.js --image sha256:... --output NEW_RESULT.json');
const imageId=immutableImage(args[1]),execute=promisify(execFile),checks={};let stage='fixtures',failure,forbiddenHits=0,postHits=0,notifySlow;
const forbidden=http.createServer((_,res)=>{forbiddenHits++;res.end('forbidden');});
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'){postHits++;res.end('write');return;}
  if(req.url==='/slow'){notifySlow?.();return;}
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/page','Set-Cookie':['session=fixture; HttpOnly; SameSite=Lax','language=es; SameSite=Lax']});res.end();return;}
  const attack=req.url==='/foreign'?`<img src="http://127.0.0.1:${forbidden.address().port}/secret" alt="fixture">`:
    req.url==='/post'?'<script>fetch("/write",{method:"POST"}).catch(()=>{})</script>':'';
  const marker=req.url==='/member'&&req.headers.cookie?.includes('session=fixture')?'<p id="member">Member</p>':'';
  const page=`<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><button></button>${marker}${attack}</main></body></html>`;
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Encoding':'gzip'});res.end(gzipSync(page));
});
const dockerIds=async()=> (await execute('docker',['ps','-aq','--filter',`ancestor=${imageId}`],{timeout:30000,maxBuffer:65536,windowsHide:true,shell:false})).stdout.trim().split(/\s+/).filter(Boolean).sort();
let before;
try {
  before=await dockerIds();for(const fixture of [forbidden,server]){fixture.listen(0,'127.0.0.1');await once(fixture,'listening');}
  const origin=`http://127.0.0.1:${server.address().port}`,network={allowPrivateOrigins:[origin]},audit=(url,options)=>auditPageInDocker(url,{...options,imageId});
  stage='real-axe';const report=await audit(origin+'/redirect',{network});assert.ok(report.violations.some(rule=>rule.id==='button-name'));assert.equal(report.url,origin+'/page');assert.equal(report.network.policyVersion,3);assert.equal(report.isolation.chromiumSandbox,true);checks.realAxeRedirectGzip=true;
  stage='authenticated-project';const project={schemaVersion:1,name:'Contained fixture',urls:[origin+'/member'],network,viewports:[{name:'desktop',width:1000,height:700}],authentication:{profile:'member',readySelector:'#member'}};
  const sessionState={cookies:[{name:'session',value:'fixture',domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax',expires:-1}],origins:[]};
  const run=await auditProject(project,{audit,sessionState});assert.equal(run.totals.failed,0,run.pages[0].error);assert.equal(run.totals.succeeded,1);assert.equal(run.pages[0].report.viewport.width,1000);
  const root=await mkdtemp(join(tmpdir(),'accesspilot-contained-'));const savedId=await saveHistory(root,run);const saved=await latestHistory(root,project);assert.equal(saved.pages[0].report.isolation.imageId,imageId);validateSnapshot(saved);checks.authenticatedViewportHistory=true;
  // Fixed fixture data only; no session/user files are mounted into the worker.
  checks.historySaved=typeof savedId==='string';
  stage='blocked-egress';await assert.rejects(audit(origin+'/foreign',{network}));await assert.rejects(audit(origin+'/post',{network}));assert.equal(forbiddenHits,0);assert.equal(postHits,0);checks.scopeAndPostDenied=true;
  stage='cancel-pending';const controller=new AbortController(),reached=new Promise(resolve=>notifySlow=resolve);
  const pending=audit(origin+'/slow',{network,signal:controller.signal});const observed=pending.then(()=>{throw new Error('Cancelled audit succeeded');},()=>{});
  await Promise.race([reached,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Slow fixture not reached')),20000).unref())]);controller.abort();await observed;checks.pendingCancellation=true;
  stage='cli';const file=join(root,'project.json'),output=join(root,'cli.json');await writeFile(file,JSON.stringify({schemaVersion:1,name:'Contained CLI',urls:[origin+'/page'],network}));
  await execute(process.execPath,['src/cli.js','--project',file,'--isolation-image',imageId,'--format','json','--output',output],{timeout:60000,maxBuffer:65536,windowsHide:true,shell:false});const cli=JSON.parse(await readFile(output,'utf8'));assert.equal(cli.totals.succeeded,1);assert.equal(cli.pages[0].report.isolation.imageId,imageId);checks.cli=true;
  stage='cleanup';assert.deepEqual(await dockerIds(),before);checks.ownedContainersRemoved=true;stage='complete';
} catch(error) {failure={message:error.message,cause:error.cause?.message};}
finally {for(const fixture of [server,forbidden]){fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));}}
const result={schemaVersion:1,kind:'contained-browser-acceptance',passed:!failure,imageId,stage,checks,...(failure?{failure}:{}),note:'Controlled fixture acceptance for this image/runner. Not independent security review, production readiness or Docker Desktop browser validation.'};
await writeFile(args[3],JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(result));process.exitCode=failure?2:0;
