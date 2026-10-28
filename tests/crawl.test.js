import { renderProject } from '../src/project-report.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditProject, projectExitCode } from '../src/runner.js';
import { compareAudits } from '../src/comparison.js';
import { validateProject } from '../src/project.js';
const project={schemaVersion:1,name:'Crawl',urls:['https://example.org/'],concurrency:2,crawl:{maxDepth:2}};
const evidence=(url,links=[])=>({schemaVersion:1,kind:'page-audit',url,engine:{name:'axe-core',version:'fixture'},
 network:{policyVersion:1},violations:[],discovery:{links,truncated:false}});
test('crawl follows deterministic breadth-first order, deduplicates and excludes unsafe scope',async()=>{
 const graph={'/':['/b','/a','/b','/logout','https://other.org','mailto:a@example.org'],'/b':['/c'],'/a':['/c'],'/c':[]};
 const calls=[];
 const run=await auditProject(project,{audit:async(url,options)=>{
  calls.push(url);assert.ok(options.network);assert.deepEqual(options.scopeUrls,project.urls);
  await new Promise(r=>setTimeout(r,url.endsWith('/b')?10:0));return evidence(url,graph[new URL(url).pathname]);
 }});
 assert.deepEqual(run.pages.map(p=>new URL(p.url).pathname),['/','/b','/a','/c']);
 assert.deepEqual(run.pages.map(p=>p.depth),[0,1,1,2]);assert.equal(run.crawl.skipped.excluded,1);
 assert.equal(run.crawl.skipped.outOfScope,1);assert.equal(run.crawl.skipped.unsupported,1);
 assert.equal(run.crawl.completeWithinScope,true);assert.equal(projectExitCode(run),0);
 assert.ok(!Object.hasOwn(run.pages[0].report,'discovery'));assert.equal(compareAudits(run,run).totals.comparablePages,4);
});
test('page and extraction limits make incomplete coverage explicit and exit 2',async()=>{
 const run=await auditProject({...project,crawl:{maxPages:2}},{audit:async url=>evidence(url,['/a','/b','/c'])});
 assert.equal(run.pages.length,2);assert.ok(run.crawl.skipped.pageLimit>0);assert.equal(run.crawl.truncated,true);assert.equal(projectExitCode(run),2);
 const truncated=await auditProject(project,{audit:async url=>({...evidence(url),discovery:{links:[],truncated:true}})});
 assert.equal(truncated.crawl.linkLimitReached,true);assert.equal(projectExitCode(truncated),2);
});
test('configured depth is a declared scope boundary, not a whole-site claim',async()=>{
 const run=await auditProject({...project,crawl:{maxDepth:0}},{audit:async url=>evidence(url,['/a'])});
 assert.equal(run.pages.length,1);assert.equal(run.crawl.skipped.depth,1);assert.equal(run.crawl.completeWithinScope,true);
});
test('discovered fragments are opt-in while explicit seed fragments survive',async()=>{
 const run=await auditProject({...project,urls:['https://example.org/#seed'],crawl:{maxDepth:1,followFragments:true}},{audit:async url=>evidence(url,['/#route'])});
 assert.deepEqual(run.pages.map(p=>p.url),['https://example.org/#seed','https://example.org/#route']);
});
test('deadline cancels the active audit and records incomplete coverage',async()=>{
 const run=await auditProject({...project,crawl:{maxDurationMs:1000}},{audit:async(url,{signal})=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(new Error('deadline')),{once:true});
 })});
 assert.equal(run.crawl.termination,'deadline');assert.equal(run.totals.cancelled,1);assert.equal(projectExitCode(run),2);
});
test('changed crawl/network policy cannot be labelled improvement',async()=>{
 const before=await auditProject(project,{audit:async url=>evidence(url)});
 const after=await auditProject({...project,crawl:{maxDepth:1}},{audit:async url=>evidence(url)});
 assert.equal(compareAudits(before,after).pages[0].reason,'policy-changed');
});
test('strict crawl and network configuration rejects coercions and unknown properties',()=>{
 for(const crawl of [null,[],{unknown:true},{maxPages:0},{maxDepth:6},{maxRequestsPerPage:0},{maxBytesPerPage:1},{maxDurationMs:999},{followFragments:'yes'},{excludePaths:['relative']},{excludePaths:['/bad\\path']}]) assert.throws(()=>validateProject({...project,crawl}));
 assert.throws(()=>validateProject({...project,network:{allowPrivateOrigins:['http://unrelated.org']}}));
});

test('CSV preserves a coverage warning even when all completed pages pass',async()=>{
 const run=await auditProject({...project,crawl:{maxPages:1}},{audit:async url=>evidence(url,['/unscanned'])});
 assert.equal(run.totals.failed,0);assert.equal(run.crawl.truncated,true);
 assert.match(renderProject(run,'csv'),/coverage-incomplete/);
});

test('network implementation version changes cannot silently become improvements',async()=>{
 const before=await auditProject(project,{audit:async url=>evidence(url)});
 const after=structuredClone(before);after.pages[0].report.network.policyVersion=2;
 assert.equal(compareAudits(before,after).pages[0].reason,'network-policy-changed');
 delete after.pages[0].report.network;
 assert.equal(compareAudits(before,after).pages[0].reason,'network-policy-unknown');
});
