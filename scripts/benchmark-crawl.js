import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { auditProject } from '../src/runner.js';
const server=createServer((req,res)=>{
  const links=req.url==='/'?'<a href="/one">One</a><a href="/two">Two</a>':'';
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><button></button>${links}</main></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
 const origin=`http://127.0.0.1:${server.address().port}`;const samples=[];
 for(const concurrency of [1,2]) for(let repetition=1;repetition<=2;repetition++) {
  let peakNodeRss=process.memoryUsage().rss;const timer=setInterval(()=>peakNodeRss=Math.max(peakNodeRss,process.memoryUsage().rss),25);
  const cpu=process.cpuUsage();let run;
  try {run=await auditProject({schemaVersion:1,name:'Restricted crawl benchmark',urls:[origin],concurrency,crawl:{maxPages:3,maxDepth:1},network:{allowPrivateOrigins:[origin]}});}
  finally {clearInterval(timer);}
  if(!run.crawl.completeWithinScope||run.totals.succeeded!==3) throw new Error('Incomplete benchmark: '+JSON.stringify(run.pages));
  const used=process.cpuUsage(cpu);samples.push({concurrency,repetition,pages:3,wallMs:run.durationMs,nodePeakRssBytes:peakNodeRss,nodeCpuMs:(used.user+used.system)/1000,violatedRules:run.totals.violatedRules});
 }
 const output=JSON.stringify({generatedAt:new Date().toISOString(),platform:process.platform,node:process.version,
  includesBrowserProcesses:false,samples,limitations:'Four small fixture runs; Node CPU/RSS excludes Chromium. Check validation notes for any test-only launcher adapter. Not a throughput guarantee or competitor benchmark.'},null,2)+'\n';
 if(process.argv[2]) await writeFile(process.argv[2],output,'utf8');else console.log(output);
} finally {await new Promise(resolve=>server.close(resolve));}
