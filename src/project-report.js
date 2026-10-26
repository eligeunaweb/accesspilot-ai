import { escapeHtml, htmlDocument, pageReportBody, csvHeaders, csvCell, findingRows } from './report.js';
import { messages, languageCode } from './i18n.js';

export function renderProject(run, format) {
  if (format === 'json') return JSON.stringify(run, null, 2);
  const lang=languageCode(run.project.language);const t=messages[lang];
  if (format === 'csv') {
    const rows=run.pages.flatMap(page=>page.report ? findingRows(page.report) : [[page.status,page.url,'','','','',page.error,'','']]);
    if(run.crawl?.truncated) rows.push(['coverage-incomplete','','','','','',JSON.stringify(run.crawl),'','']);
    return [csvHeaders,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
  }
  const coverage=run.crawl ? JSON.stringify(run.crawl) : '';
  const changes=run.comparison ? JSON.stringify(run.comparison.totals) : '';
  const summary=`${run.project.name}: ${run.totals.succeeded} ${t.succeeded}; ${run.totals.failed} ${t.failed}; ${run.totals.cancelled} ${t.cancelled}; ${run.totals.violatedRules} ${t.rules.toLowerCase()}`;
  if (format === 'text') return [summary,...run.pages.map(page=>
    `${page.status.toUpperCase()} ${page.url}: ${page.report ? `${page.report.violations.length} ${t.rules.toLowerCase()}` : page.error}`),coverage,changes,t.disclaimer].filter(Boolean).join('\n');
  if (format !== 'html') throw new Error('Unsupported project report format');
  const pages=run.pages.map((page,index)=>`<section><h2>${escapeHtml(page.url)}</h2><p>${escapeHtml(t[page.status])}</p>${page.report ? pageReportBody(page.report,`page-${index}`) : `<p>${escapeHtml(page.error)}</p>`}</section>`).join('');
  return htmlDocument(run.project.name,lang,`<p class="metrics">${escapeHtml(summary)}</p><p>${t.duration}: ${run.durationMs} ms</p>${coverage?`<section><h2>${lang==='es'?'Alcance del rastreo':'Crawl coverage'}</h2><pre>${escapeHtml(JSON.stringify(run.crawl,null,2))}</pre></section>`:''}${changes?`<section><h2>${lang==='es'?'Comparación con la base':'Baseline comparison'}</h2><pre>${escapeHtml(JSON.stringify(run.comparison,null,2))}</pre></section>`:''}${pages}`);
}
