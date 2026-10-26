import { escapeHtml as escape } from './report.js';
import { recommendation } from './i18n.js';
import { snapshotMetrics, trendRows } from './history-metrics.js';
import { selectEvidence } from './evidence-filter.js';
import { viewportLabel } from './viewport.js';

const words={
  es:{filters:'Filtrar evidencia',search:'Página, regla, criterio WCAG o selector',severity:'Gravedad',status:'Estado de página',category:'Tipo de evidencia',all:'Todos',violations:'Incidencias',review:'Revisión pendiente',succeeded:'Auditada',failed:'Fallida',cancelled:'Cancelada',critical:'Crítica',serious:'Grave',moderate:'Moderada',minor:'Leve',unknown:'Desconocida',apply:'Aplicar filtros',clear:'Limpiar filtros',summary:'Resumen de la ejecución',elements:'Elementos señalados',rules:'Reglas con incidencias',reviewRules:'Reglas para revisión',note:'El resumen corresponde a la ejecución completa; los filtros se aplican al detalle.',legacy:'Algunos datos históricos no se guardaron y aparecen como desconocidos. No se han reconstruido.',complete:'Se completó el alcance configurado.',partial:'Cobertura parcial o desconocida.',none:'No hay evidencia que coincida con los filtros.',noAudit:'Esta página no tiene una auditoría completada.',noFindings:'Sin incidencias automáticas observadas en esta evidencia.',unknownReview:'No se conserva el detalle de revisión de esta página.',limited:'Vista limitada a 50 incidencias por grupo, 512 caracteres por selector y 2000 por recomendación. La descarga JSON conserva la evidencia completa.',saved:'Recomendación guardada',current:'Orientación actual de AccessPilot',verify:'Cómo verificar',trends:'Tendencias de auditoría',window:'Se muestran hasta las 10 últimas ejecuciones; no es una puntuación de conformidad.',date:'Ejecución',pages:'Páginas auditadas / fallidas / canceladas',change:'Nuevas / no observadas de nuevo',incomparable:'No comparable',invalid:'Registro no disponible',budget:'Límite de lectura alcanzado',explanation:'Los cambios solo se muestran entre ejecuciones adyacentes con alcance completo, mismo motor, destinos y políticas compatibles. Los recuentos observados pueden cambiar por el alcance; no equivalen a accesibilidad total.'},
  en:{filters:'Filter evidence',search:'Page, rule, WCAG criterion or selector',severity:'Severity',status:'Page status',category:'Evidence type',all:'All',violations:'Violations',review:'Needs review',succeeded:'Audited',failed:'Failed',cancelled:'Cancelled',critical:'Critical',serious:'Serious',moderate:'Moderate',minor:'Minor',unknown:'Unknown',apply:'Apply filters',clear:'Clear filters',summary:'Run summary',elements:'Flagged elements',rules:'Rules with violations',reviewRules:'Rules needing review',note:'Summary covers the entire run; filters apply to the details.',legacy:'Some historical data was not stored and is shown as unknown. It has not been reconstructed.',complete:'Configured scope completed.',partial:'Partial or unknown coverage.',none:'No evidence matches the filters.',noAudit:'This page has no completed audit.',noFindings:'No automated findings observed in this evidence.',unknownReview:'Review details were not stored for this page.',limited:'View limited to 50 findings per group, 512 characters per selector and 2000 per recommendation. JSON downloads preserve complete evidence.',saved:'Saved recommendation',current:'Current AccessPilot guidance',verify:'How to verify',trends:'Audit trends',window:'Showing up to the latest 10 runs; this is not a conformance score.',date:'Run',pages:'Audited / failed / cancelled pages',change:'Added / not observed again',incomparable:'Incomparable',invalid:'Record unavailable',budget:'Read budget reached',explanation:'Changes are shown only between adjacent runs with complete configured scope, matching engine/destinations and compatible policies. Observed counts may change with scope; they do not measure total accessibility.'}
};
const href=(base,lang,params={})=>`${base}?${new URLSearchParams({lang,...params})}`;
function select(name,label,choices,value,t) {
  return `<div><label for="${name}">${escape(label)}</label><select id="${name}" name="${name}">${choices.map(key=>`<option value="${key}"${key===value?' selected':''}>${escape(t[key])}</option>`).join('')}</select></div>`;
}
function filterForm(base,run,lang,filters,t) {
  return `<section class="panel"><h2>${t.filters}</h2><form action="${base}" method="get">
    <input type="hidden" name="run" value="${escape(run)}"><input type="hidden" name="lang" value="${lang}">
    <label for="text">${t.search}</label><input id="text" name="text" type="search" maxlength="100" value="${escape(filters.text)}">
    <div class="grid">${select('severity',t.severity,['all','critical','serious','moderate','minor','unknown'],filters.severity,t)}
    ${select('status',t.status,['all','succeeded','failed','cancelled'],filters.status,t)}
    ${select('category',t.category,['all','violations','review'],filters.category,t)}</div>
    <button type="submit">${t.apply}</button> <a href="${escape(href(base,lang,{run}))}">${t.clear}</a>
  </form></section>`;
}
function rulesView(rules,t,lang) {
  if(!rules.length) return `<p>${t.noFindings}</p>`;
  let remaining=50;
  const items=[];
  for(const rule of rules) {
    if(remaining===0) break;
    const nodes=rule.nodes.slice(0,remaining);remaining-=nodes.length;
    const saved=rule.recommendation?.language===lang;
    const advice=saved?rule.recommendation:recommendation(rule.id,lang);
    items.push(`<details><summary>${escape(rule.id)} · ${escape(t[rule.impact??'unknown'])} · WCAG ${escape((rule.wcag??[]).join(', ')||t.unknown)}</summary>
      <p>${escape((rule.help??'').slice(0,512))}</p><p>${saved?t.saved:t.current} (${escape(lang==='es'&&advice.kind==='curated'?'específica':advice.kind)}): ${escape(advice.correction.slice(0,2000))}</p>
      <p>${t.verify}: ${escape(advice.verification.slice(0,2000))}</p><ul>${nodes.map(node=>`<li><code>${escape(JSON.stringify(node.target).slice(0,512))}</code></li>`).join('')}</ul></details>`);
  }
  return `<p>${t.limited}</p>${items.join('')}`;
}
export function richRunView(snapshot,filters,lang,base,run) {
  const t=words[lang],metrics=snapshotMetrics(snapshot),pages=selectEvidence(snapshot,filters);
  const legacy=snapshot.historyVersion!==2||snapshot.pages.some(page=>page.status==='succeeded'&&page.report.incompleteDetails==null);
  const cards=[...Object.entries(metrics.pages),['rules',metrics.rules],['elements',metrics.elements],['reviewRules',metrics.review??t.unknown],...Object.entries(metrics.severity)];
  const summary=`<h2>${t.summary}</h2><p>${t.note} ${metrics.complete===true?t.complete:t.partial}</p>${legacy?`<p class="notice">${t.legacy}</p>`:''}
    <div class="grid">${cards.map(([key,n])=>`<div class="metric"><strong>${escape(n)}</strong>${t[key]}</div>`).join('')}</div>`;
  const body=pages.map(page=>`<details><summary>${escape(page.url)} ${escape(viewportLabel(page.viewport))}${snapshot.project.authentication?' · '+escape(snapshot.project.authentication.profile):''} · ${t[page.status]}</summary>
    ${page.status!=='succeeded'?`<p>${t.noAudit}</p>`:`<p>${escape(page.report.engine?`${page.report.engine.name} ${page.report.engine.version}`:t.unknown)}</p>
      <h3>${t.violations}</h3>${rulesView(page.report.violations,t,lang)}
      <h3>${t.review}</h3>${page.report.incompleteDetails==null?`<p>${t.unknownReview}</p>`:rulesView(page.report.incompleteDetails,t,lang)}`}</details>`).join('');
  return filterForm(base,run,lang,filters,t)+summary+`<h2>${t.violations} / ${t.review}</h2>`+(body||`<p>${t.none}</p>`);
}
export function historyTrendView(window,lang,base) {
  const t=words[lang];
  const rows=trendRows(window).map(row=>{
    if(row.error) return `<tr><td>${escape(row.id)}</td><td colspan="4">${row.error==='budget'?t.budget:t.invalid}</td></tr>`;
    const m=row.metrics;
    return `<tr><th scope="row"><a href="${escape(href(base,lang,{run:row.id}))}">${escape(row.id)}</a></th>
      <td>${m.pages.succeeded} / ${m.pages.failed} / ${m.pages.cancelled}</td><td>${m.elements}</td><td>${m.review??t.unknown}</td>
      <td>${row.delta?`${row.delta.added} / ${row.delta.resolved}`:t.incomparable}</td></tr>`;
  }).join('');
  return `<h2>${t.trends}</h2><p>${t.window} (${window.rows.length} / ${window.total})</p><p>${t.explanation}</p>
    <p>${lang==='es'?'Orden por fecha de guardado. Los cambios requieren fechas originales conocidas y no invertidas.':'Ordered by save time. Changes require known original timestamps in chronological order.'}</p>
    <div class="scroll" role="region" tabindex="0" aria-label="${t.trends}"><table class="trend-table"><caption>${t.trends}</caption><thead><tr>
      <th scope="col">${t.date}</th><th scope="col">${t.pages}</th><th scope="col">${t.elements}</th><th scope="col">${t.reviewRules}</th><th scope="col">${t.change}</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}
