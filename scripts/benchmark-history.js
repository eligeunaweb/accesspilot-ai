// Synthetic local diagnostic, not a website audit or competitor benchmark.
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { saveHistory, historyWindow, projectKey } from '../src/history.js';
import { trendRows } from '../src/history-metrics.js';

const directory=resolve(tmpdir()),root=await mkdtemp(join(directory,'accesspilot-history-bench-'));
try {
  const project={schemaVersion:1,name:'Synthetic history benchmark',language:'en',urls:Array.from({length:5},(_,i)=>`https://fixture.invalid/page-${i}`)};
  const run={schemaVersion:1,kind:'project-audit',project,generatedAt:new Date().toISOString(),
    pages:project.urls.map(url=>({url,status:'succeeded',report:{schemaVersion:1,kind:'page-audit',url,
      engine:{name:'fixture',version:'1'},passes:20,incomplete:0,incompleteDetails:[],
      violations:Array.from({length:10},(_,rule)=>({id:`fixture-rule-${rule}`,impact:'moderate',wcag:['1.1.1'],
        nodes:Array.from({length:20},(_,node)=>({target:[`#fixture-${rule}-${node}`]}))}))}}))};
  const rssBefore=process.memoryUsage().rss,saveStarted=performance.now();
  for(let i=0;i<30;i++) await saveHistory(root,run);
  const saveMs=performance.now()-saveStarted,readStarted=performance.now();
  const window=await historyWindow(root,project),rows=trendRows(window),readAndCompareMs=performance.now()-readStarted;
  if(window.total!==30||rows.length!==10||rows.some(row=>row.error)) throw new Error('Benchmark fixture did not round trip');
  let loadedInputBytes=0;
  for(const row of rows) loadedInputBytes+=(await stat(join(root,projectKey(project),row.id))).size;
  console.log(JSON.stringify({kind:'synthetic-history-benchmark',node:process.version,platform:process.platform,
    savedRuns:30,pagesPerRun:5,rulesPerPage:10,nodesPerRule:20,loadedRuns:rows.length,loadedInputBytes,
    saveMs:Math.round(saveMs),readAndCompareMs:Math.round(readAndCompareMs),rssBefore,rssAfter:process.memoryUsage().rss,
    limitations:'One local synthetic sample. Node process RSS only; excludes Chromium and does not establish a large-history SLA.'},null,2));
} finally {
  if(!root.startsWith(directory+sep)) throw new Error('Unexpected benchmark cleanup path');
  await rm(root,{recursive:true,force:true});
}
