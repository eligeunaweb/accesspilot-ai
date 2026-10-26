export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function summarize(results, url) {
  return {
    tool: 'AccessPilot AI', version: '0.1.0', url, generatedAt: new Date().toISOString(),
    violations: results.violations.map(v => ({
      id: v.id, impact: v.impact || 'unknown', description: v.description,
      help: v.help, helpUrl: v.helpUrl, tags: v.tags,
      nodes: v.nodes.map(n => ({target:n.target, html:n.html, failureSummary:n.failureSummary}))
    })),
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
    disclaimer: 'Automated checks do not establish WCAG conformance. Keyboard, screen-reader and human testing remain necessary.'
  };
}
export function htmlReport(report) {
  const rows = report.violations.flatMap(v => v.nodes.map(n => `<tr><td>${escapeHtml(v.id)}</td><td>${escapeHtml(v.impact)}</td><td>${escapeHtml(v.help)}</td><td><code>${escapeHtml(n.target.join(', '))}</code></td><td>${escapeHtml(n.failureSummary || '')}</td></tr>`)).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AccessPilot AI accessibility report</title><style>body{font:1rem/1.6 system-ui,sans-serif;max-width:76rem;margin:auto;padding:1.5rem;color:#202124;background:#fff}table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:.6rem;text-align:left;vertical-align:top}th{background:#eee}code{overflow-wrap:anywhere}a:focus-visible{outline:3px solid #1769aa}td{overflow-wrap:anywhere}@media(max-width:700px){table{display:block;overflow-x:auto}}</style></head><body><main><h1>AccessPilot AI accessibility report</h1><p><strong>URL:</strong> ${escapeHtml(report.url)}</p><p><strong>Violations:</strong> ${report.violations.length} rules; <strong>Passed checks:</strong> ${report.passes}; <strong>Needs review:</strong> ${report.incomplete}</p><p>${escapeHtml(report.disclaimer)}</p><h2>Findings</h2><table><caption>Automated accessibility findings</caption><thead><tr><th scope="col">Rule</th><th scope="col">Impact</th><th scope="col">Issue</th><th scope="col">Element</th><th scope="col">Details</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No automated violations detected. Manual review is still required.</td></tr>'}</tbody></table></main></body></html>`;
}
