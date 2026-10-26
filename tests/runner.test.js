import test from 'node:test';
import assert from 'node:assert/strict';
import { auditProject, projectExitCode } from '../src/runner.js';
import { renderProject } from '../src/project-report.js';
const project={schemaVersion:1,name:'<img src=x onerror=alert(1)>',urls:['https://a.org','https://b.org','https://c.org'],concurrency:2,timeoutMs:1000};
const report={url:'https://a.org/',violations:[],passes:0,incomplete:0,disclaimer:'Review'};

test('bounded concurrency, stable input order and independent failures',async()=>{
  const releases=[];let active=0, peak=0, started=0;
  const runPromise=auditProject(project,{audit:async url=>{
    active++;peak=Math.max(peak,active);started++;
    await new Promise(resolve=>releases.push(resolve));active--;
    if(url.includes('b.org')) throw new Error('<script>failure</script>');
    return report;
  }});
  assert.equal(started,2);releases[1]();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(started,3);releases[2]();releases[0]();
  const run=await runPromise;assert.equal(peak,2);
  assert.deepEqual(run.pages.map(p=>p.url),project.urls.map(u=>u+'/'));
  assert.deepEqual(run.pages.map(p=>p.status),['succeeded','failed','succeeded']);
  assert.equal(run.totals.succeeded,2);assert.equal(projectExitCode(run,true),2);
  const html=renderProject(run,'html');assert.ok(!html.includes('<script>failure'));
  assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;failure'));
  assert.deepEqual(JSON.parse(renderProject(run,'json')).totals,run.totals);
});
test('cancellation stops queued targets and records all statuses',async()=>{
  const controller=new AbortController();let calls=0;
  const run=await auditProject({...project,concurrency:1},{signal:controller.signal,audit:async()=>{
    calls++;controller.abort();throw new Error('cancelled');
  }});
  assert.equal(calls,1);assert.equal(run.totals.cancelled,3);assert.equal(projectExitCode(run),2);
});
test('pre-cancelled project never launches audits',async()=>{
  const controller=new AbortController();controller.abort();
  const run=await auditProject(project,{signal:controller.signal,audit:()=>assert.fail('must not run')});
  assert.equal(run.totals.cancelled,3);
});
test('violations gate is optional; failure has precedence',async()=>{
  const run=await auditProject(project,{audit:async()=>({...report,violations:[{nodes:[{},{}]}]})});
  assert.equal(run.totals.violatedRules,3);assert.equal(run.totals.affectedElements,6);
  assert.equal(projectExitCode(run),0);assert.equal(projectExitCode(run,true),1);
  assert.match(renderProject(run,'text'),/3 succeeded/);
  assert.throws(()=>renderProject(run,'unknown'),/Unsupported/);
});
