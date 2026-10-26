import { messages, languageCode, recommendation } from './i18n.js';
import { viewportLabel } from './viewport.js';

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function wcagCriteria(tags = []) {
  return [...new Set(tags.flatMap(tag => {
    const match = /^wcag([1-4])([1-9])(\d{1,2})$/.exec(tag);
    return match ? [`${match[1]}.${match[2]}.${match[3]}`] : [];
  }))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
}
function finding(rule, language) {
  return {id:rule.id, impact:rule.impact || 'unknown', description:rule.description,
    help:rule.help, helpUrl:rule.helpUrl, tags:rule.tags, wcag:wcagCriteria(rule.tags),
    recommendation:recommendation(rule.id,language),
    nodes:(rule.nodes ?? []).map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))};
}
export function summarize(results, url, {language = 'en'} = {}) {
  const lang = languageCode(language);
  return {
    schemaVersion:1, kind:'page-audit', tool:'AccessPilot AI', version:'0.1.0', url,
    generatedAt:new Date().toISOString(), language:lang,
    engine:results.testEngine ? {name:results.testEngine.name,version:results.testEngine.version} : null,
    violations:results.violations.map(v=>finding(v,lang)),
    passes:results.passes.length, incomplete:results.incomplete.length,
    incompleteDetails:results.incomplete.map(v=>finding(v,lang)),
    inapplicable:results.inapplicable.length, disclaimer:messages[lang].disclaimer
  };
}
export function csvCell(value) {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution, including whitespace/control prefixes.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export const csvHeaders = ['status','url','rule','severity','wcag','target','evidence','correction','verification'];
export function findingRows(report) {
  return [['violation',report.violations],['review',report.incompleteDetails ?? []]].flatMap(([status,rules])=>
    rules.flatMap(rule=>rule.nodes.map(node=>[status,report.url,rule.id,rule.impact,(rule.wcag ?? wcagCriteria(rule.tags)).join('; '),
      JSON.stringify(node.target),node.failureSummary,rule.recommendation?.correction,rule.recommendation?.verification])));
}
export function csvReport(report) {
  if(report.viewport) {
    const columns=[report.viewport.name,report.viewport.width,report.viewport.height];
    return [[...csvHeaders,'viewport','viewport_width','viewport_height'],...[
      ['succeeded',report.url,'','','','','','',''],...findingRows(report)
    ].map(row=>[...row,...columns])].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
  }
  return [csvHeaders,...findingRows(report)].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export const reportStyle = `body{font:1rem/1.6 system-ui,sans-serif;max-width:76rem;margin:auto;padding:1.5rem;color:#202124;background:#fff}table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:.6rem;text-align:left;vertical-align:top}th{background:#eee}code,td,p,h2,summary{overflow-wrap:anywhere}summary{cursor:pointer;padding:.7rem;font-weight:600}details{border:1px solid #777;margin:1rem 0;padding:.6rem}a:focus-visible,summary:focus-visible{outline:3px solid #1769aa;outline-offset:3px}nav ul{display:flex;flex-wrap:wrap;gap:1.5rem;padding-left:1.5rem}.scroll{overflow-x:auto}.metrics{padding:1rem;background:#f1f5f9}pre{white-space:pre-wrap}h2{margin-top:2rem}`;
function safeHelpUrl(value) {
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password ? url.href : null;}
  catch {return null;}
}
function renderFinding(rule, lang) {
  const t=messages[lang];const advice=rule.recommendation ?? recommendation(rule.id,lang);
  const criteria=rule.wcag ?? wcagCriteria(rule.tags);const link=safeHelpUrl(rule.helpUrl);
  const rows=rule.nodes.map(node=>`<tr><td><code>${escapeHtml(node.target.join(', '))}</code></td><td><pre>${escapeHtml(node.failureSummary ?? '')}</pre><code>${escapeHtml(node.html ?? '')}</code></td></tr>`).join('');
  return `<details><summary>${escapeHtml(rule.id)} — ${escapeHtml(rule.help)}</summary><p>${escapeHtml(rule.description ?? '')}</p><p>${escapeHtml(t.criterion)}: ${escapeHtml(criteria.join(', ') || t.unknown)}</p><h4>${t.fix}</h4><p>${escapeHtml(advice.correction)}</p><h4>${t.verify}</h4><p>${escapeHtml(advice.verification)}</p>${link?`<p><a href="${escapeHtml(link)}" rel="noreferrer noopener">${escapeHtml(rule.id)} — ${t.details}</a></p>`:''}<div class="scroll" role="region" aria-label="${escapeHtml(rule.id)} ${t.details}" tabindex="0"><table><caption>${escapeHtml(rule.id)} — ${t.details}</caption><thead><tr><th scope="col">${t.element}</th><th scope="col">${t.details}</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
export function pageReportBody(report, prefix = 'page') {
  prefix=String(prefix).replace(/[^a-zA-Z0-9_-]/g,'') || 'page';
  const lang=languageCode(report.language);const t=messages[lang];
  const groups=['critical','serious','moderate','minor','unknown'];
  const sections=groups.map(impact=>{
    const rules=report.violations.filter(rule=>(groups.includes(rule.impact)?rule.impact:'unknown')===impact);
    return rules.length ? `<section id="${prefix}-${impact}"><h3>${impact === 'unknown' ? t.other : t[impact]} (${rules.length})</h3>${rules.map(rule=>renderFinding(rule,lang)).join('')}</section>` : '';
  }).join('');
  const nav=groups.filter(impact=>report.violations.some(rule=>(groups.includes(rule.impact)?rule.impact:'unknown')===impact))
    .map(impact=>`<li><a href="#${prefix}-${impact}">${impact === 'unknown' ? t.other : t[impact]}</a></li>`).join('');
  return `<p><strong>URL:</strong> ${escapeHtml(report.url)}</p>${report.viewport?`<p>Viewport: ${escapeHtml(viewportLabel(report.viewport))}</p>`:''}<p class="metrics">${t.rules}: ${report.violations.length}; ${t.passed}: ${escapeHtml(report.passes)}; ${t.review}: ${escapeHtml(report.incomplete)}</p><p>${escapeHtml(report.disclaimer)}</p><h2>${t.findings}</h2>${nav?`<nav aria-label="${t.severity}"><ul>${nav}</ul></nav>`:''}${sections || `<p>${t.none}</p>`}<section><h2>${t.review} (${escapeHtml(report.incomplete)})</h2>${(report.incompleteDetails ?? []).map(rule=>renderFinding(rule,lang)).join('')}</section>`;
}
export function htmlDocument(title, language, body) {
  const lang=languageCode(language);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)}</title><style>${reportStyle}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
}
export function htmlReport(report) {
  return htmlDocument('AccessPilot AI — '+messages[languageCode(report.language)].title,report.language,pageReportBody(report));
}
