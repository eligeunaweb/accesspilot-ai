#!/usr/bin/env node
import { auditPage } from './audit.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { htmlReport, csvReport } from './report.js';
import { parse } from './args.js';
import { loadProject } from './project.js';
import { auditProject, projectExitCode } from './runner.js';
import { renderProject } from './project-report.js';
import { compareAudits, loadSnapshot } from './comparison.js';
import { messages } from './i18n.js';
import { saveHistory, latestHistory, listHistory, pruneHistory } from './history.js';
import { startHistoryViewer } from './viewer.js';

function usage() {
  console.log('Usage: accesspilot <http(s) URL> | --project config.json [--format text|json|html|csv] [--lang en|es] [--baseline prior.json|latest] [--history directory] [--list-history] [--output filename] [--fail-on-violations]');
  console.log('Retention preview: --project config.json --history directory --prune-history --keep-runs N [--apply-retention]');
  console.log('Local viewer: --project config.json --history directory --serve-history [--port 0]');
}
export async function main(args=process.argv.slice(2)) {
  let opts;
  try {opts=parse(args);} catch(err) {console.error(err.message);usage();return 2;}
  if(opts.help) {usage();return 0;}
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  if(opts.serveHistory) process.once('SIGTERM', cancel);
  try {
    if (opts.project) {
      const project = await loadProject(opts.project);
      if (opts.lang) project.language = opts.lang;
      if (opts.serveHistory) {
        const viewer = await startHistoryViewer({root:opts.history, project, port:opts.port});
        console.log(`AccessPilot AI: ${viewer.url}`);
        console.error('Read-only local history. Stop with Ctrl+C. Keep the session URL private.');
        try {
          if(!controller.signal.aborted) await new Promise(resolve=>controller.signal.addEventListener('abort',resolve,{once:true}));
        } finally { await viewer.close(); }
        return 0;
      }
      if (opts.listHistory) { console.log(JSON.stringify(await listHistory(opts.history, project), null, 2)); return 0; }
      if (opts.pruneHistory) { console.log(JSON.stringify(await pruneHistory(opts.history, project, {keep:opts.keepRuns, apply:opts.applyRetention ?? false}), null, 2)); return 0; }
      const baseline = opts.baseline==='latest' ? await latestHistory(opts.history, project) : opts.baseline ? await loadSnapshot(opts.baseline) : null;
      const run = await auditProject(project, {signal:controller.signal});
      if (baseline) run.comparison = compareAudits(baseline, run);
      if (opts.history) { const id = await saveHistory(opts.history, run); console.error(`History saved: ${id}`); }
      const output = renderProject(run, opts.format);
      if(opts.output) { await writeFile(opts.output, output, 'utf8'); console.log(`Report written to ${opts.output}`); }
      else console.log(output);
      return projectExitCode(run, opts.fail);
    }
    const report=await auditPage(opts.url, {signal:controller.signal, language:opts.lang});
    const output=opts.format==='json'?JSON.stringify(report,null,2):opts.format==='html'?htmlReport(report):opts.format==='csv'?csvReport(report):[
      `AccessPilot AI v0.1.0 | ${report.url}`,
      `${report.violations.length} ${messages[report.language].rules.toLowerCase()}; ${report.incomplete} ${messages[report.language].review.toLowerCase()}`,
      ...report.violations.map(v=>`${v.impact.toUpperCase()} ${v.id}: ${v.help} (${v.nodes.length} elements)\n${v.recommendation.correction}\n${v.recommendation.verification}`),
      report.disclaimer
    ].join('\n');
    if(opts.output) {await writeFile(opts.output,output,'utf8');console.log(`Report written to ${opts.output}`);}
    else console.log(output);
    return opts.fail && report.violations.length>0?1:0;
  } catch(err) {console.error(`Audit failed: ${err.message}`);return 2;}
  finally { process.removeListener('SIGINT', cancel); if(opts.serveHistory) process.removeListener('SIGTERM', cancel); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode=await main();
}
