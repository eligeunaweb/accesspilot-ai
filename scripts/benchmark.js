import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { auditProject } from '../src/runner.js';

// Development diagnostic: CPU/RSS below include Node only, never the Chromium tree.
const server=createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><title>Benchmark fixture</title></head><body><main><h1>Benchmark</h1><button></button></main></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  const origin=`http://127.0.0.1:${server.address().port}`;
  const samples=[];
  for(const concurrency of [1,2]) for(let repetition=1;repetition<=2;repetition++) {
    let peakNodeRss=process.memoryUsage().rss;
    const timer=setInterval(()=>{peakNodeRss=Math.max(peakNodeRss,process.memoryUsage().rss);},25);
    const cpu=process.cpuUsage();let run;
    try {run=await auditProject({schemaVersion:1,name:'Benchmark',urls:['/one','/two','/three'].map(path=>origin+path),concurrency});}
    finally {clearInterval(timer);}
    if(run.totals.succeeded!==3) throw new Error('Benchmark targets failed: '+JSON.stringify(run.pages));
    const used=process.cpuUsage(cpu);
    samples.push({concurrency,repetition,pages:3,wallMs:run.durationMs,nodePeakRssBytes:peakNodeRss,
      nodeCpuMs:(used.user+used.system)/1000,violatedRules:run.totals.violatedRules});
  }
  const output=JSON.stringify({generatedAt:new Date().toISOString(),platform:process.platform,node:process.version,
    sampleIntervalMs:25,includesBrowserProcesses:false,samples,
    limitations:'Two repetitions on a tiny local fixture, warm installed browser. CPU and RSS are Node only; browser process-tree resources and competitor benchmarks remain unmeasured. No throughput/SLA claims.'},null,2);
  if(process.argv[2]) await writeFile(process.argv[2],output+'\n','utf8');
  else console.log(output);
} finally {await new Promise(resolve=>server.close(resolve));}
