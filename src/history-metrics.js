import { compareAudits } from './comparison.js';
import { severities } from './snapshot-detail.js';

export function snapshotMetrics(snapshot) {
  const pages={succeeded:0,failed:0,cancelled:0},severity=Object.fromEntries(severities.map(key=>[key,0]));
  let elements=0,rules=0,review=0,reviewKnown=true;
  for(const page of snapshot.pages) {
    pages[page.status]++;
    if(page.status!=='succeeded') {reviewKnown=false;continue;}
    for(const rule of page.report.violations) {
      rules++;elements+=rule.nodes.length;severity[rule.impact??'unknown']+=rule.nodes.length;
    }
    if(page.report.incomplete===undefined||page.report.incomplete===null) reviewKnown=false;
    else review+=page.report.incomplete;
  }
  return {pages,rules,elements,severity,review:reviewKnown?review:null,
    complete:pages.failed||pages.cancelled?false:(snapshot.coverageComplete??(snapshot.project.crawl?null:true))};
}
export function trendRows(window) {
  return window.rows.map((row,index)=>{
    if(!row.snapshot) return {id:row.id,error:row.error};
    const metrics=snapshotMetrics(row.snapshot),previous=window.rows[index+1];let delta=null;
    const chronological=previous?.snapshot?.generatedAt&&row.snapshot.generatedAt&&row.snapshot.generatedAt>=previous.snapshot.generatedAt;
    if(chronological&&metrics.complete===true&&snapshotMetrics(previous.snapshot).complete===true) {
      const comparison=compareAudits(previous.snapshot,row.snapshot);
      if(comparison.totals.incomparablePages===0) delta={added:comparison.totals.added,resolved:comparison.totals.resolved};
    }
    return {id:row.id,metrics,delta};
  });
}
