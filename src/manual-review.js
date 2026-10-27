import { createHash, randomUUID } from 'node:crypto';
import { pageKey } from './viewport.js';

function object(value,allowed) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))) throw new Error('Invalid manual review fields');
}
function text(value,max) {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error('Invalid manual review text');
  return value;
}
function identifier(value) {
  if(typeof value!=='string'||(!/^[a-z][a-z0-9-]{0,63}$/.test(value)||/[\r\n]/.test(value))) throw new Error('Invalid manual review identifier');return value;
}
export const manualStatuses=['passed','failed','not-applicable','not-tested'];
export const manualMethods=['keyboard','screen-reader','visual','zoom','other'];
// WCAG 2.x criterion identifiers, including legacy 4.1.1 (removed in 2.2).
// Reference: https://www.w3.org/TR/WCAG22/ . No normative text is copied.
const criterionLimits=new Map([['1.1',1],['1.2',9],['1.3',6],['1.4',13],['2.1',4],['2.2',6],['2.3',3],['2.4',13],['2.5',8],['3.1',6],['3.2',6],['3.3',9],['4.1',3]]);
function criterion(value) {
  if(typeof value!=='string'||!/^\d\.\d\.[1-9]\d?$/.test(value)||/[\r\n]/.test(value)) return false;
  const [principle,guideline,number]=value.split('.');return Number(number)<=(criterionLimits.get(`${principle}.${guideline}`)??0);
}

// Receives a canonical rich snapshot, without manual evidence. Not a signature.
export function auditFingerprint(snapshot) {
  const {manualReviews:ignored,...base}=snapshot;
  return createHash('sha256').update(JSON.stringify({...base,historyVersion:2})).digest('hex');
}
export function validateManualReviews(input,snapshot) {
  if(!Array.isArray(input)||input.length<1||input.length>20) throw new Error('Manual reviews must contain 1–20 batches');
  const fingerprint=auditFingerprint(snapshot),pages=new Map(snapshot.pages.map(page=>[pageKey(page),page])),ids=new Set();
  let previous=null;
  return input.map(batch=>{
    object(batch,['schemaVersion','kind','id','auditFingerprint','reviewedAt','reviewer','checks']);
    if(batch.schemaVersion!==1||batch.kind!=='manual-review'||batch.auditFingerprint!==fingerprint) throw new Error('Manual review does not match the audit evidence');
    const id=identifier(batch.id);if(ids.has(id)) throw new Error('Duplicate manual review batch');ids.add(id);
    const time=batch.reviewedAt;
    if(typeof time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(time)||!Number.isFinite(Date.parse(time))||new Date(time).toISOString()!==time||snapshot.generatedAt&&time<snapshot.generatedAt||previous&&time<previous) throw new Error('Invalid manual review chronology');
    previous=time;
    const reviewer=text(batch.reviewer,120);
    if(!Array.isArray(batch.checks)||batch.checks.length<1||batch.checks.length>100) throw new Error('Manual batch requires 1–100 checks');
    const seen=new Set();
    const checks=batch.checks.map(check=>{
      object(check,['id','url','viewport','journey','criteria','status','method','environment','evidence']);
      const checkId=identifier(check.id);if(seen.has(checkId)) throw new Error('Duplicate manual check identifier');seen.add(checkId);
      const url=text(check.url,8192);
      if(check.viewport!==null&&typeof check.viewport!=='string'||check.journey!==null&&typeof check.journey!=='string') throw new Error('Manual target requires explicit viewport and journey names or null');
      const page=pages.get(JSON.stringify([url,check.viewport,check.journey]));
      if(!page) throw new Error('Manual review target is outside the saved audit scope');
      if(!manualStatuses.includes(check.status)||!manualMethods.includes(check.method)) throw new Error('Invalid manual check status or method');
      if(page.status!=='succeeded'&&check.status!=='not-tested') throw new Error('Unavailable audit targets can only be recorded as not-tested');
      if(!Array.isArray(check.criteria)||!check.criteria.length||check.criteria.length>20||check.criteria.some(value=>!criterion(value))||new Set(check.criteria).size!==check.criteria.length) throw new Error('Invalid manual WCAG references');
      return {id:checkId,url,viewport:check.viewport,journey:check.journey,criteria:[...check.criteria],status:check.status,method:check.method,environment:text(check.environment,500),evidence:text(check.evidence,2000)};
    });
    return {schemaVersion:1,kind:'manual-review',id,auditFingerprint:fingerprint,reviewedAt:time,reviewer,checks};
  });
}

export function manualTemplate(snapshot) {
  const reviewedAt=new Date(Math.max(Date.now(),Date.parse(snapshot.generatedAt)||0)).toISOString();
  return {schemaVersion:1,kind:'manual-review',id:'review-'+randomUUID(),auditFingerprint:auditFingerprint(snapshot),reviewedAt,reviewer:'reviewer-alias',checks:snapshot.pages.map((page,index)=>({
    id:`check-${index+1}`,url:page.url,viewport:page.viewport?.name??null,journey:page.journey?.name??null,criteria:['2.1.1'],status:'not-tested',method:'keyboard',environment:'Record browser, OS and assistive technology versions',evidence:'Not performed. Replace this text with actual steps and observations before changing the status.'
  }))};
}

export function manualSummary(snapshot) {
  const result=Object.fromEntries(manualStatuses.map(status=>[status,0]));
  for(const batch of snapshot.manualReviews??[]) for(const check of batch.checks) result[check.status]++;
  return result; // Counts declarations, not coverage or unique criteria.
}
