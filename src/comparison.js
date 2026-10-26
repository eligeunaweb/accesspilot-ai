import { open } from 'node:fs/promises';
import { normalizeUrl, validateProject } from './project.js';

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
  const project=validateProject(input.project);
  if (!Array.isArray(input.pages) || (project.crawl ? input.pages.length<project.urls.length||input.pages.length>project.crawl.maxPages : input.pages.length!==project.urls.length)) throw new Error('Invalid snapshot page count');
  const seen=new Set();
  const pages=input.pages.map(page=>{
    const url=normalizeUrl(page.url);
    const inScope=project.crawl ? project.urls.some(seed=>new URL(seed).origin===new URL(url).origin) : project.urls.includes(url);
    if(project.crawl&&(!Number.isInteger(page.depth)||page.depth<0||page.depth>project.crawl.maxDepth)) throw new Error('Invalid snapshot crawl depth');
    if (seen.has(url) || !inScope) throw new Error('Invalid snapshot page scope');
    seen.add(url);
    if (!['succeeded','failed','cancelled'].includes(page.status)) throw new Error('Invalid snapshot page status');
    if (page.status !== 'succeeded') return {url,status:page.status,...(project.crawl?{depth:page.depth}:{})};
    const report=page.report;
    if (!report || report.schemaVersion !== 1 || report.kind !== 'page-audit') throw new Error('Invalid snapshot page report');
    const finalUrl=normalizeUrl(report.url);
    let engine=null;
    if (report.engine) engine={name:text(report.engine.name,128,'engine name'),version:text(report.engine.version,128,'engine version')};
    if (!Array.isArray(report.violations) || report.violations.length > 5000) throw new Error('Invalid snapshot violations');
    const violations=report.violations.map(rule=>{
      const id=text(rule.id,200,'rule');
      if (!Array.isArray(rule.nodes) || rule.nodes.length > 10000) throw new Error('Invalid snapshot nodes');
      return {id,nodes:rule.nodes.map(node=>({target:target(node.target)}))};
    });
    let network=null;
    if(report.network) {
      if(!Number.isInteger(report.network.policyVersion)||report.network.policyVersion<1) throw new Error('Invalid snapshot network policy version');
      network={policyVersion:report.network.policyVersion};
    }
    return {url,status:'succeeded',...(project.crawl?{depth:page.depth}:{}),report:{schemaVersion:1,kind:'page-audit',url:finalUrl,engine,network,violations}};
  });
  for(const seed of project.urls) if(!seen.has(seed)) throw new Error('Snapshot omits a configured seed');
  return {schemaVersion:1,kind:'project-audit',project,pages};
}
export async function loadSnapshot(path) {
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
    return validateSnapshot(input);
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
  const fingerprint=project=>JSON.stringify([project.crawl ?? null,project.network ?? null,project.network ? [...new Set(project.urls.map(url=>new URL(url).origin))].sort() : null]);
  const oldPages=new Map(before.pages.map(page=>[page.url,page]));
  const newPages=new Map(after.pages.map(page=>[page.url,page]));
  const urls=[...new Set([...oldPages.keys(),...newPages.keys()])].sort();
  const totals={comparablePages:0,incomparablePages:0,added:0,resolved:0,persistent:0};
  const pages=urls.map(url=>{
    const oldPage=oldPages.get(url),newPage=newPages.get(url);
    let reason;
    if(fingerprint(before.project)!==fingerprint(after.project)) reason='policy-changed';
    else if (!oldPage || !newPage) reason='scope-changed';
    else if (oldPage.status !== 'succeeded' || newPage.status !== 'succeeded') reason='page-not-audited';
    else if (oldPage.report.url !== newPage.report.url) reason='destination-changed';
    else if(before.project.network&&(!oldPage.report.network||!newPage.report.network)) reason='network-policy-unknown';
    else if(before.project.network&&oldPage.report.network.policyVersion!==newPage.report.network.policyVersion) reason='network-policy-changed';
    else if (!oldPage.report.engine || !newPage.report.engine) reason='engine-unknown';
    else if (JSON.stringify(oldPage.report.engine) !== JSON.stringify(newPage.report.engine)) reason='engine-changed';
    if (reason) {totals.incomparablePages++;return {url,status:'incomparable',reason};}
    const oldFindings=findings(oldPage),newFindings=findings(newPage);
    const added=[...newFindings].filter(([key])=>!oldFindings.has(key)).map(([,value])=>value);
    const resolved=[...oldFindings].filter(([key])=>!newFindings.has(key)).map(([,value])=>value);
    const persistent=[...newFindings].filter(([key])=>oldFindings.has(key)).map(([,value])=>value);
    totals.comparablePages++;totals.added+=added.length;totals.resolved+=resolved.length;totals.persistent+=persistent.length;
    return {url,status:'comparable',added,resolved,persistent};
  });
  return {schemaVersion:1,kind:'audit-comparison',totals,pages,
    note:'Resolution means an automated finding was not observed at the same selector. DOM/selector changes can change identity. Human review and incomplete checks are not resolved by this comparison.'};
}
