import { manualReviewHTML } from './manual-review-view.js';
import { journeyLabel } from './journey.js';
import { validateSnapshot } from './comparison.js';
import { csvCell, htmlDocument, escapeHtml } from './report.js';
import { languageCode, recommendation, messages } from './i18n.js';
import { snapshotMetrics } from './history-metrics.js';
import { viewportLabel } from './viewport.js';

function guidance(rule,lang) {
  const stored=rule.recommendation?.language===lang;
  return {advice:stored?rule.recommendation:recommendation(rule.id,lang),source:stored?'stored':'current'};
}
export function exportHistory(input,format,language) {
  const snapshot=validateSnapshot(input),lang=languageCode(language??snapshot.project.language);
  if(format==='json') return JSON.stringify(snapshot);
  if(!['html','csv'].includes(format)) throw new Error('Unsupported history export format');
  if(Buffer.byteLength(JSON.stringify(snapshot))>5*1024*1024) throw new Error('HTML/CSV history export input exceeds 5 MiB; use JSON');
  const metrics=snapshotMetrics(snapshot),unknown=lang==='es'?'No disponible':'Unavailable';
  if(format==='csv') {
    const rows=[];let bytes=0;
    const emit=row=>{
      const line=row.map(csvCell).join(',')+'\r\n';bytes+=Buffer.byteLength(line);
      if(bytes>40*1024*1024) throw new Error('History CSV exceeds 40 MiB; use JSON');
      rows.push(line);
    };
    const manual=!!snapshot.manualReviews;
    const auth=snapshot.project.authentication;
    const add=(row,viewport,journey)=>emit([...row,viewport?.name??'',viewport?.width??'',viewport?.height??'',...(auth?[auth.profile]:[]),...(snapshot.project.journeys?[journeyLabel(journey)]:[]),...(manual?['','','','','','','']:[])]);
    emit(['record_type','status','url','rule','severity','wcag','target','correction','verification','guidance_source','coverage_complete','review_rules','viewport','viewport_width','viewport_height',...(auth?['authentication_profile']:[]),...(snapshot.project.journeys?['journey']:[]),...(manual?['manual_batch','manual_check','reviewer','reviewed_at','method','environment','manual_evidence']:[])]);
    add(['run','','','','','','','','','',metrics.complete??'unknown',metrics.review??'unknown']);
    for(const page of snapshot.pages) {
      add(['page',page.status,page.url,'','','','','','','','',''],page.viewport,page.journey);
      if(!page.report) continue;
      if(page.report.incomplete==null||page.report.incompleteDetails==null) add(['review-unavailable','unknown',page.url,'','','','','','','','',''],page.viewport,page.journey);
      for(const [kind,rules] of [['violation',page.report.violations],['review',page.report.incompleteDetails??[]]]) for(const rule of rules) {
        const {advice,source}=guidance(rule,lang);
        for(const node of rule.nodes.length?rule.nodes:[{target:null}]) add([kind,page.status,page.url,rule.id,rule.impact??'unknown',(rule.wcag??[]).join('; '),node.target===null?'':JSON.stringify(node.target),advice.correction,advice.verification,source,'',''],page.viewport,page.journey);
      }
    }
    for(const batch of snapshot.manualReviews??[]) for(const check of batch.checks) {
      const page=snapshot.pages.find(page=>page.url===check.url&&(page.viewport?.name??null)===check.viewport&&(page.journey?.name??null)===check.journey);
      emit(['manual-declaration',check.status,check.url,'','',check.criteria.join('; '),'','','','','','',page.viewport?.name??'',page.viewport?.width??'',page.viewport?.height??'',...(auth?[auth.profile]:[]),...(snapshot.project.journeys?[check.journey??'']:[]),batch.id,check.id,batch.reviewer,batch.reviewedAt,check.method,check.environment,check.evidence]);
    }
    return rows.join('');
  }
  const t=messages[lang];
  const provenance=lang==='es'?'Informe generado del historial disponible. No conserva HTML ni mensajes diagnósticos originales. Las recomendaciones del idioma guardado se conservan; en otros idiomas se usa la orientación actual de AccessPilot.':'Report generated from available history. Original HTML and diagnostic messages are not retained. Saved-language guidance is preserved; other languages use current AccessPilot guidance.';
  const rulesHTML=rules=>rules.map(rule=>{
    const {advice,source}=guidance(rule,lang);
    const severity=rule.impact&&rule.impact!=='unknown'?t[rule.impact]:unknown;
    return `<details><summary>${escapeHtml(rule.id)} · ${escapeHtml(severity)}</summary><p>${escapeHtml(rule.help??'')}</p><p>${escapeHtml(rule.description??'')}</p>
      <p>WCAG: ${escapeHtml((rule.wcag??[]).join(', ')||unknown)}</p><p>${escapeHtml(t.fix)} (${source}): ${escapeHtml(advice.correction)}</p><p>${escapeHtml(t.verify)}: ${escapeHtml(advice.verification)}</p>
      <ul>${rule.nodes.map(node=>`<li><code>${escapeHtml(JSON.stringify(node.target))}</code></li>`).join('')}</ul></details>`;
  }).join('');
  const pages=snapshot.pages.map((page,index)=>{
    const title=escapeHtml(page.url+' '+viewportLabel(page.viewport)+' '+journeyLabel(page.journey));
    if(!page.report) return `<section><h2>${title}</h2><p>${escapeHtml(t[page.status])}</p></section>`;
    const report=page.report;
    return `<section><h2>${title}</h2><p>${escapeHtml(t[page.status])}</p><p>${escapeHtml(t.passed)}: ${escapeHtml(report.passes??unknown)}</p>
      <h3>${escapeHtml(t.findings)}</h3>${rulesHTML(report.violations)||`<p>${escapeHtml(t.none)}</p>`}
      <h3>${escapeHtml(t.review)} (${escapeHtml(report.incomplete??unknown)})</h3>${report.incompleteDetails==null?`<p>${unknown}</p>`:rulesHTML(report.incompleteDetails)}</section>`;
  }).join('');
  const body=`${snapshot.project.authentication?`<p>${lang==='es'?'Perfil de acceso':'Access profile'}: ${escapeHtml(snapshot.project.authentication.profile)}</p>`:''}<p>${escapeHtml(provenance)}</p><p>${escapeHtml(t.disclaimer)}</p><p>${escapeHtml(snapshot.generatedAt??unknown)}</p><p>${lang==='es'?'Páginas auditadas/fallidas/canceladas':'Audited/failed/cancelled pages'}: ${metrics.pages.succeeded}/${metrics.pages.failed}/${metrics.pages.cancelled}</p><p>${lang==='es'?'Cobertura completa del alcance configurado':'Complete configured scope'}: ${escapeHtml(metrics.complete??unknown)}</p>${pages}`;
  const html=htmlDocument(snapshot.project.name,lang,body+manualReviewHTML(snapshot,lang));
  if(Buffer.byteLength(html)>40*1024*1024) throw new Error('History HTML exceeds 40 MiB; use JSON');
  return html;
}
