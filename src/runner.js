import { validateSessionState } from './session.js';
import { performance } from 'node:perf_hooks';
import { auditPage } from './audit.js';
import { validateProject } from './project.js';
import { normalizeUrl } from './url.js';
import { sameViewport, validateViewport } from './viewport.js';

async function auditTargets(targets, project, audit, signal) {
  const pages=new Array(targets.length);let cursor=0;
  async function worker() {
    while(cursor<targets.length) {
      const index=cursor++,target=targets[index],url=target.url;
      if(signal?.aborted) {pages[index]={...target,status:'cancelled',durationMs:0,error:'Audit cancelled'};continue;}
      const started=performance.now();
      try {
        const report=await audit(url,{signal,timeoutMs:project.timeoutMs,language:project.language,
          network:project.network,scopeUrls:project.urls,crawl:project.crawl,viewport:target.viewport});
        if(target.viewport&&!sameViewport(validateViewport(report.viewport),target.viewport)) throw new Error('Audit viewport evidence does not match the requested profile');
        if(project.authentication&&JSON.stringify(report.authentication)!==JSON.stringify(project.authentication)) throw new Error('Authentication evidence does not match the requested profile');
        if(signal?.aborted) throw new Error('Audit cancelled');
        pages[index]={...target,status:'succeeded',durationMs:Math.round(performance.now()-started),report};
      } catch(error) {
        pages[index]={...target,status:signal?.aborted?'cancelled':'failed',durationMs:Math.round(performance.now()-started),
          error:project.authentication?'Authenticated audit failed; session may be expired or access marker missing':error instanceof Error?error.message:'Audit failed'};
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(project.concurrency,targets.length)},worker));
  return pages;
}
function finish(project,pages,generatedAt,started,extra={}) {
  const totals={succeeded:0,failed:0,cancelled:0,violatedRules:0,affectedElements:0};
  for(const page of pages) {
    totals[page.status]++;
    if(page.report) for(const rule of page.report.violations) {totals.violatedRules++;totals.affectedElements+=rule.nodes.length;}
  }
  return {schemaVersion:1,kind:'project-audit',tool:'AccessPilot AI',version:'0.1.0',generatedAt,
    durationMs:Math.round(performance.now()-started),project,pages,totals,...extra};
}
function isExcluded(url,paths) {
  let path=new URL(url).pathname;
  try {path=decodeURIComponent(path);} catch { /* Keep the literal path. */ }
  return paths.some(prefix=>path.toLowerCase().startsWith(prefix.toLowerCase()));
}
async function crawlProject(project,audit,signal,generatedAt,started,viewport,deadlineExpired=false) {
  const limits=project.crawl,controller=new AbortController();let termination=null;
  const cancel=()=>{termination='cancelled';controller.abort();};
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted) cancel();
  const remaining=deadlineExpired?0:limits.maxDurationMs-(performance.now()-started);
  const timer=setTimeout(()=>{termination='deadline';controller.abort();},Math.max(1,remaining));
  if(remaining<=0) {termination='deadline';controller.abort();}
  const origins=new Set(project.urls.map(url=>new URL(url).origin));
  const seen=new Set(project.urls),pages=[];
  const skipped={duplicate:0,outOfScope:0,unsupported:0,excluded:0,depth:0,pageLimit:0};
  let frontier=project.urls.map(url=>({url,depth:0,sourceUrl:null,...(viewport?{viewport}:{})})),linkLimitReached=false;
  try {
    while(frontier.length) {
      const results=await auditTargets(frontier,project,audit,controller.signal);
      const next=[];
      // Expand only after an entire breadth-first layer, preserving input/link order.
      for(const page of results) {
        const discovery=page.report?.discovery;
        if(page.report) {
          const {discovery:unused,...report}=page.report;
          pages.push({...page,report});
        } else pages.push(page);
        if(page.status!=='succeeded'||controller.signal.aborted) continue;
        if(!discovery||!Array.isArray(discovery.links)) {linkLimitReached=true;continue;}
        if(discovery.truncated||discovery.links.length>limits.maxLinksPerPage) linkLimitReached=true;
        for(const value of discovery.links.slice(0,limits.maxLinksPerPage)) {
          let url;
          try {
            const candidate=new URL(value,page.report.url);
            if(!limits.followFragments) candidate.hash='';
            url=normalizeUrl(candidate.href);
          } catch {skipped.unsupported++;continue;}
          if(!origins.has(new URL(url).origin)) {skipped.outOfScope++;continue;}
          if(isExcluded(url,limits.excludePaths)) {skipped.excluded++;continue;}
          if(seen.has(url)) {skipped.duplicate++;continue;}
          if(page.depth>=limits.maxDepth) {skipped.depth++;continue;}
          if(seen.size>=limits.maxPages) {skipped.pageLimit++;continue;}
          seen.add(url);next.push({url,depth:page.depth+1,sourceUrl:page.url,...(viewport?{viewport}:{})});
        }
      }
      frontier=next;
    }
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  const truncated=linkLimitReached||skipped.pageLimit>0||termination!==null;
  return finish(project,pages,generatedAt,started,{crawl:{discoveredPages:seen.size,skipped,linkLimitReached,
    termination,truncated,completeWithinScope:!truncated&&pages.every(page=>page.status==='succeeded')}});
}
export async function auditProject(input,{audit=auditPage,signal,sessionState}={}) {
  const project=validateProject(input),started=performance.now(),generatedAt=new Date().toISOString();
  if(project.authentication) {
    const state=validateSessionState(sessionState,project),delegate=audit;
    audit=(url,options)=>delegate(url,{...options,authentication:project.authentication,sessionState:structuredClone(state)});
  } else if(sessionState!==undefined) throw new Error('Session state requires project authentication');
  if(project.crawl) {
    if(!project.viewports) return crawlProject(project,audit,signal,generatedAt,started);
    const pages=[],profiles=[];let deadlineExpired=false;
    for(const viewport of project.viewports) {
      const run=await crawlProject(project,audit,signal,generatedAt,started,viewport,deadlineExpired);
      deadlineExpired ||= run.crawl.termination==='deadline';
      pages.push(...run.pages);profiles.push({viewport,...run.crawl});
    }
    return finish(project,pages,generatedAt,started,{crawl:{profiles,truncated:profiles.some(p=>p.truncated),completeWithinScope:profiles.every(p=>p.completeWithinScope)}});
  }
  const targets=(project.viewports??[null]).flatMap(viewport=>project.urls.map(url=>({url,...(viewport?{viewport}:{})})));
  const pages=await auditTargets(targets,project,audit,signal);
  return finish(project,pages,generatedAt,started);
}
export function projectExitCode(run,failOnViolations=false) {
  if(run.totals.failed||run.totals.cancelled||run.crawl?.truncated) return 2;
  return failOnViolations&&run.totals.violatedRules?1:0;
}
