import { escapeHtml, htmlReport } from './report.js';

export function renderProject(run, format) {
  if (format === 'json') return JSON.stringify(run, null, 2);
  const summary = `${run.project.name}: ${run.totals.succeeded} succeeded; ${run.totals.failed} failed; ${run.totals.cancelled} cancelled; ${run.totals.violatedRules} violated rules`;
  if (format === 'text') return [summary, ...run.pages.map(page =>
    `${page.status.toUpperCase()} ${page.url}: ${page.report ? `${page.report.violations.length} violated rules` : page.error}`),
    'Automated checks do not establish WCAG conformance.'].join('\n');
  if (format !== 'html') throw new Error('Unsupported project report format');
  // No scanned content is placed in an executable context.
  const pages = run.pages.map(page => `<section><h2>${escapeHtml(page.url)}</h2><p>${escapeHtml(page.status)}</p>${page.report ?
    `<iframe title="${escapeHtml(page.url)} findings" sandbox srcdoc="${escapeHtml(htmlReport(page.report))}" style="width:100%;height:30rem;border:1px solid #777"></iframe>` :
    `<p>${escapeHtml(page.error)}</p>`}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AccessPilot AI project report</title><style>body{font:1rem/1.6 system-ui;max-width:76rem;margin:auto;padding:1.5rem;overflow-wrap:anywhere}</style></head><body><main><h1>${escapeHtml(run.project.name)}</h1><p>${escapeHtml(summary)}</p>${pages}</main></body></html>`;
}
