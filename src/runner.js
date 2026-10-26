import { performance } from 'node:perf_hooks';
import { auditPage } from './audit.js';
import { validateProject } from './project.js';

export async function auditProject(input, { audit = auditPage, signal } = {}) {
  const project = validateProject(input);
  const started = performance.now();
  const generatedAt = new Date().toISOString();
  const pages = new Array(project.urls.length);
  let cursor = 0;
  async function worker() {
    while (cursor < project.urls.length) {
      const index = cursor++;
      const url = project.urls[index];
      if (signal?.aborted) {
        pages[index] = { url, status: 'cancelled', durationMs: 0, error: 'Audit cancelled' };
        continue;
      }
      const pageStarted = performance.now();
      try {
        const report = await audit(url, { signal, timeoutMs: project.timeoutMs, language:project.language });
        if (signal?.aborted) throw new Error('Audit cancelled');
        pages[index] = {url, status: 'succeeded', durationMs: Math.round(performance.now() - pageStarted), report};
      } catch (error) {
        pages[index] = {url, status: signal?.aborted ? 'cancelled' : 'failed',
          durationMs: Math.round(performance.now() - pageStarted), error: error instanceof Error ? error.message : 'Audit failed'};
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(project.concurrency, project.urls.length)}, worker));
  const totals = {succeeded: 0, failed: 0, cancelled: 0, violatedRules: 0, affectedElements: 0};
  for (const page of pages) {
    totals[page.status]++;
    if (page.report) for (const rule of page.report.violations) {
      totals.violatedRules++;
      totals.affectedElements += rule.nodes.length;
    }
  }
  return {schemaVersion: 1, kind: 'project-audit', tool: 'AccessPilot AI', version: '0.1.0',
    generatedAt, durationMs: Math.round(performance.now() - started), project, pages, totals};
}
export function projectExitCode(run, failOnViolations = false) {
  if (run.totals.failed || run.totals.cancelled) return 2;
  return failOnViolations && run.totals.violatedRules ? 1 : 0;
}
