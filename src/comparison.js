import { validateJourney, sameJourney } from './journey.js';
import { open } from 'node:fs/promises';
import { normalizeUrl, validateProject } from './project.js';
import { ruleDetails, reviewDetails } from './snapshot-detail.js';
import { pageKey, sameViewport, validateViewport } from './viewport.js';

const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
function text(value, limit, label) {
  if (typeof value !== 'string' || !value || value.length > limit) throw new Error(`Invalid snapshot ${label}`);
  return value;
}
function target(value, depth = 0) {
  if (typeof value === 'string') return text(value,8192,'selector');
  if (!Array.isArray(value) || !value.length || value.length > 100 || depth > 5) throw new Error('Invalid snapshot selector');
  return value.map(item=>target(item,depth+1));
}
export function validateSnapshot(input) {
  if (!input || input.schemaVersion !== 1 || input.kind !== 'project-audit') throw new Error('Expected project-audit snapshot schemaVersion 1');
  if(input.historyVersion!==undefined&&![1,2].includes(input.historyVersion)) throw new Error('Unsupported historyVersion');
  const rich=input.historyVersion===2;
  const project=validateProject(input.project);
  const profiles=project.viewports??[null],count=profiles.length*(project.journeys?.length??1);
  if (!Array.isArray(input.pages) || (project.crawl ? input.pages.length<project.urls.length*count||input.pages.length>project.crawl.maxPages*count : input.pages.length!==project.urls.length*count)) throw new Error('Invalid snapshot page count');
  const seen=new Set();
  const pages=input.pages.map(page=>{
    const url=normalizeUrl(page.url);
    const requested=page.viewport==null?undefined:validateViewport(page.viewport);
    const viewport=project.viewports?.find(profile=>sameViewport(profile,requested));
    if(project.viewports&&!viewport || !project.viewports&&page.viewport!=null) throw new Error('Invalid snapshot viewport');
    const requestedJourney=page.journey==null?undefined:validateJourney(page.journey);
    const journey=project.journeys?.find(item=>sameJourney(item,requestedJourney));
    if(project.journeys&&!journey||!project.journeys&&requestedJourney) throw new Error('Invalid snapshot journey');
    const identity=pageKey({url,viewport,journey}),profile={...(viewport?{viewport}:{}),...(journey?{journey}:{})};
    const inScope=project.crawl ? project.urls.some(seed=>new URL(seed).origin===new URL(url).origin) : project.urls.includes(url);
    if(project.crawl&&(!Number.isInteger(page.depth)||page.depth<0||page.depth>project.crawl.maxDepth)) throw new Error('Invalid snapshot crawl depth');
    if (seen.has(identity) || !inScope) throw new Error('Invalid snapshot page scope');
    seen.add(identity);
    if (!['succeeded','failed','cancelled'].includes(page.status)) throw new Error('Invalid snapshot page status');
    if (page.status !== 'succeeded') return {url,status:page.status,...profile,...(project.crawl?{depth:page.depth}:{})};
    const report=page.report;
    if (!report || report.schemaVersion !== 1 || report.kind !== 'page-audit') throw new Error('Invalid snapshot page report');
    if(!sameJourney(report.journey,journey)) throw new Error('Snapshot report journey mismatch');
    const actual=report.viewport==null?undefined:validateViewport(report.viewport);
    if(!sameViewport(actual,viewport)) throw new Error('Snapshot report viewport mismatch');
    if(JSON.stringify(report.authentication??null)!==JSON.stringify(project.authentication??null)) throw new Error('Snapshot authentication evidence mismatch');
    const authentication=project.authentication?{authentication:{...project.authentication}}:{};
    const finalUrl=normalizeUrl(report.url);
    let engine=null;
    if (report.engine) engine={name:text(report.engine.name,128,'engine name'),version:text(report.engine.version,128,'engine version')};
    if (!Array.isArray(report.violations) || report.violations.length > 5000) throw new Error('Invalid snapshot violations');
    const violations=report.violations.map(rule=>{
      const id=text(rule.id,200,'rule');
      if (!Array.isArray(rule.nodes) || rule.nodes.length > 10000) throw new Error('Invalid snapshot nodes');
      return {id,...(rich?ruleDetails(rule):{}),nodes:rule.nodes.map(node=>({target:target(node.target)}))};
    });
    let network=null;
    if(report.network) {
      if(!Number.isInteger(report.network.policyVersion)||report.network.policyVersion<1) throw new Error('Invalid snapshot network policy version');
      network={policyVersion:report.network.policyVersion};
    }
    return {url,status:'succeeded',...profile,...(project.crawl?{depth:page.depth}:{}),report:{schemaVersion:1,kind:'page-audit',url:finalUrl,...profile,...authentication,engine,network,violations,...(rich?reviewDetails(report,target):{})}};
  });
  for(const seed of project.urls) for(const viewport of profiles) for(const journey of project.journeys??[null]) if(!seen.has(pageKey({url:seed,viewport,journey}))) throw new Error('Snapshot omits a configured seed/profile');
  let generatedAt=null;
  if(rich&&input.generatedAt!==undefined&&input.generatedAt!==null) {
    if(typeof input.generatedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.generatedAt)||Number.isNaN(Date.parse(input.generatedAt))||new Date(input.generatedAt).toISOString()!==input.generatedAt) throw new Error('Invalid history timestamp');
    generatedAt=input.generatedAt;
  }
  let coverageComplete=null;
  if(rich) {
    coverageComplete=input.coverageComplete??input.crawl?.completeWithinScope??(project.crawl?null:pages.every(page=>page.status==='succeeded'));
    if(coverageComplete!==null&&typeof coverageComplete!=='boolean') throw new Error('Invalid history coverage');
    if(coverageComplete===true&&pages.some(page=>page.status!=='succeeded')) throw new Error('Contradictory history coverage');
  }
  const tool=rich&&input.tool!=null?text(input.tool,128,'tool'):null;
  const version=rich&&input.version!=null?text(input.version,128,'version'):null;
  return {schemaVersion:1,kind:'project-audit',...(rich?{historyVersion:2,generatedAt,coverageComplete,tool,version}:{}),project,pages};
}
// Additive conversion: never invent missing metadata or rewrite the original record.
export function upgradeSnapshot(input) {
  if(input?.historyVersion!==undefined&&![1,2].includes(input.historyVersion)) throw new Error('Unsupported historyVersion');
  return validateSnapshot({...input,historyVersion:2});
}
export async function loadSnapshot(path, {enrich=false}={}) {
  const file=await open(path,'r');
  try {
    if (!(await file.stat()).isFile()) throw new Error('Snapshot must be a file');
    const buffer=Buffer.alloc(MAX_SNAPSHOT_BYTES+1);let size=0;
    while(size<buffer.length) {
      const {bytesRead}=await file.read(buffer,size,buffer.length-size,null);
      if(!bytesRead) break;size+=bytesRead;
    }
    if(size>MAX_SNAPSHOT_BYTES) throw new Error('Snapshot exceeds 20 MiB');
    let input;
    try {input=JSON.parse(buffer.subarray(0,size).toString('utf8').replace(/^\uFEFF/,''));}
    catch {throw new Error('Snapshot must contain valid JSON');}
    return enrich?upgradeSnapshot(input):validateSnapshot(input);
  } finally {await file.close();}
}
function findings(page) {
  const map=new Map();
  for (const rule of page.report.violations) for (const node of rule.nodes) {
    const value={rule:rule.id,target:node.target};map.set(JSON.stringify(value),value);
  }
  return map;
}
export function compareAudits(beforeInput, afterInput) {
  const before=validateSnapshot(beforeInput), after=validateSnapshot(afterInput);
  const fingerprint=project=>JSON.stringify([project.authentication??null,project.crawl ?? null,project.network ?? null,project.network ? [...new Set(project.urls.map(url=>new URL(url).origin))].sort() : null]);
  const oldPages=new Map(before.pages.map(page=>[pageKey(page),page]));
  const newPages=new Map(after.pages.map(page=>[pageKey(page),page]));
  const urls=[...new Set([...oldPages.keys(),...newPages.keys()])].sort();
  const totals={comparablePages:0,incomparablePages:0,added:0,resolved:0,persistent:0};
  const pages=urls.map(identity=>{
    const oldPage=oldPages.get(identity),newPage=newPages.get(identity);
    const selected=newPage??oldPage,url=selected.url,profile={...(selected.viewport?{viewport:selected.viewport}:{}),...(selected.journey?{journey:selected.journey}:{})};
    let reason;
    if(fingerprint(before.project)!==fingerprint(after.project)) reason='policy-changed';
    else if (!oldPage || !newPage) reason='scope-changed';
    else if(!sameJourney(oldPage.journey,newPage.journey)) reason='journey-changed';
    else if(!sameViewport(oldPage.viewport,newPage.viewport)) reason='viewport-changed';
    else if (oldPage.status !== 'succeeded' || newPage.status !== 'succeeded') reason='page-not-audited';
    else if (oldPage.report.url !== newPage.report.url) reason='destination-changed';
    else if(before.project.network&&(!oldPage.report.network||!newPage.report.network)) reason='network-policy-unknown';
    else if(before.project.network&&oldPage.report.network.policyVersion!==newPage.report.network.policyVersion) reason='network-policy-changed';
    else if (!oldPage.report.engine || !newPage.report.engine) reason='engine-unknown';
    else if (JSON.stringify(oldPage.report.engine) !== JSON.stringify(newPage.report.engine)) reason='engine-changed';
    if (reason) {totals.incomparablePages++;return {url,...profile,status:'incomparable',reason};}
    const oldFindings=findings(oldPage),newFindings=findings(newPage);
    const added=[...newFindings].filter(([key])=>!oldFindings.has(key)).map(([,value])=>value);
    const resolved=[...oldFindings].filter(([key])=>!newFindings.has(key)).map(([,value])=>value);
    const persistent=[...newFindings].filter(([key])=>oldFindings.has(key)).map(([,value])=>value);
    totals.comparablePages++;totals.added+=added.length;totals.resolved+=resolved.length;totals.persistent+=persistent.length;
    return {url,...profile,status:'comparable',added,resolved,persistent};
  });
  return {schemaVersion:1,kind:'audit-comparison',totals,pages,
    note:'Resolution means an automated finding was not observed at the same selector. DOM/selector changes can change identity. Human review and incomplete checks are not resolved by this comparison.'};
}
