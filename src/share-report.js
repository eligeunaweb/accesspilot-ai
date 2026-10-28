import {upgradeSnapshot} from './comparison.js';
import {snapshotMetrics} from './history-metrics.js';
import {recommendation,languageCode,messages} from './i18n.js';
import {csvCell,htmlDocument,escapeHtml} from './report.js';

const severities=['critical','serious','moderate','minor','unknown'];
const labels={
  en:{yes:'Yes',no:'No',violation:'Violation',reviewCategory:'Review',title:'AccessPilot AI — shared summary',note:'Reduced-data summary, not original evidence or an anonymization guarantee. Counts and criteria can still be sensitive. Page and rule aliases apply only within this report. Manual declarations, comparisons and diagnostic details are omitted. Review before sharing.',page:'Page',status:'Status',category:'Category',rule:'Rule',severity:'Severity',elements:'Affected elements',review:'Rules requiring review',coverage:'Complete configured coverage',unknown:'Unknown',fix:'Correction',verify:'Verification'},
  es:{yes:'Sí',no:'No',violation:'Infracción',reviewCategory:'Revisión',title:'AccessPilot AI — resumen para compartir',note:'Resumen con datos reducidos, no evidencia original ni garantía de anonimato. Los recuentos y criterios aún pueden ser sensibles. Los alias de páginas y reglas solo valen dentro de este informe. Se omiten declaraciones manuales, comparaciones y diagnósticos. Revísalo antes de compartir.',page:'Página',status:'Estado',category:'Categoría',rule:'Regla',severity:'Gravedad',elements:'Elementos afectados',review:'Reglas que requieren revisión',coverage:'Cobertura completa del alcance configurado',unknown:'Desconocido',fix:'Corrección',verify:'Verificación'}
};

// A positive projection, never a recursive "remove known secrets" filter.
export function createShareSummary(input,language) {
  const snapshot=upgradeSnapshot(input),lang=languageCode(language??snapshot.project.language);
  const metrics=snapshotMetrics(snapshot),urls=new Map(),rules=new Map();let findingCount=0;
  const alias=(map,value,prefix)=>{if(!map.has(value))map.set(value,prefix+(map.size+1));return map.get(value);};
  const pages=snapshot.pages.map((page,index)=>({
    id:'target-'+(index+1),page:alias(urls,page.url,'page-'),status:page.status,
    ...(page.viewport?{viewport:{width:page.viewport.width,height:page.viewport.height}}:{}),
    reviewRules:page.report?.incomplete??null,
    findings:page.status==='succeeded' ? [['violation',page.report.violations],['review',page.report.incompleteDetails??[]]].flatMap(([category,items])=>items.map(rule=>{
      if(++findingCount>10000)throw new Error('Shared report exceeds 10000 finding rows');
      // Only shipped curated IDs may be retained. Unknown imported IDs become opaque aliases.
      const advice=recommendation(rule.id,lang),id=advice.kind==='curated'?rule.id:alias(rules,rule.id,'rule-');
      return {category,rule:id,severity:severities.includes(rule.impact)?rule.impact:'unknown',
        wcag:(rule.wcag??[]).filter(value=>/^[1-4]\.[1-9]\.[0-9]{1,2}$/.test(value)),
        affectedElements:rule.nodes.length,recommendation:advice};
    })) : []
  }));
  return {schemaVersion:1,kind:'shared-audit-summary',language:lang,privacyProfile:'reduced-data-v1',
    note:labels[lang].note,disclaimer:messages[lang].disclaimer,
    coverageComplete:metrics.complete,totals:{pages:metrics.pages,violatedRules:metrics.rules,affectedElements:metrics.elements,reviewRules:metrics.review},pages};
}

export function renderShareReport(input,format='text',language) {
  const summary=createShareSummary(input,language),t=labels[summary.language];
  let output;
  if(format==='json') output=JSON.stringify(summary,null,2);
  else if(format==='csv') {
    const header=['record_type','target','page','status','category','rule','severity','wcag','affected_elements','review_rules','coverage_complete','correction','verification'];
    const rows=[header,['privacy','','','','','','','','','','',summary.note,summary.disclaimer],['summary','','','','','','','','',summary.totals.reviewRules??'unknown',summary.coverageComplete??'unknown','','']];
    for(const page of summary.pages) {
      rows.push(['page',page.id,page.page,page.status,'','','','','',page.reviewRules??'unknown','','','']);
      for(const finding of page.findings)rows.push(['finding',page.id,page.page,page.status,finding.category,finding.rule,finding.severity,finding.wcag.join('; '),finding.affectedElements,'','',finding.recommendation.correction,finding.recommendation.verification]);
    }
    output=rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
  } else if(format==='html') {
    const text=value=>escapeHtml(value===null?t.unknown:value===true?t.yes:value===false?t.no:value);
    const pages=summary.pages.map(page=>`<section><h2>${t.page} ${text(page.page)} · ${text(page.id)}</h2><p>${t.status}: ${text(messages[summary.language][page.status]??page.status)}</p><p>${t.review}: ${text(page.reviewRules)}</p>${page.findings.map(finding=>`<details><summary>${text(finding.rule)} · ${text(messages[summary.language][finding.severity]??finding.severity)} · ${text(finding.category==='review'?t.reviewCategory:t.violation)}</summary><p>WCAG: ${text(finding.wcag.join(', ')||t.unknown)}</p><p>${t.elements}: ${finding.affectedElements}</p><h3>${t.fix}</h3><p>${text(finding.recommendation.correction)}</p><h3>${t.verify}</h3><p>${text(finding.recommendation.verification)}</p></details>`).join('')}</section>`).join('');
    output=htmlDocument(t.title,summary.language,`<p>${text(summary.note)}</p><p>${text(summary.disclaimer)}</p><p>${t.coverage}: ${text(summary.coverageComplete)}</p>${pages}`);
  } else if(format==='text') {
    output=[t.title,summary.note,summary.disclaimer,`${t.coverage}: ${summary.coverageComplete??t.unknown}`,
      ...summary.pages.flatMap(page=>[`${page.id} / ${page.page}: ${page.status}`, ...page.findings.map(finding=>`${finding.category} | ${finding.rule} | ${finding.severity} | WCAG ${finding.wcag.join(', ')} | ${t.elements}: ${finding.affectedElements}`)])].join('\n');
  } else throw new Error('Unsupported share report format');
  if(Buffer.byteLength(output)>20*1024*1024)throw new Error('Shared report exceeds 20 MiB');
  return output;
}
