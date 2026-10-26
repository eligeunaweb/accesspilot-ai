#!/usr/bin/env node
import { auditPage } from './audit.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { htmlReport } from './report.js';
import { parse } from './args.js';
import { loadProject } from './project.js';
import { auditProject, projectExitCode } from './runner.js';
import { renderProject } from './project-report.js';

function usage() {
  console.log('Usage: accesspilot <http(s) URL> | --project config.json [--format text|json|html] [--output filename] [--fail-on-violations]');
}
export async function main(args=process.argv.slice(2)) {
  let opts;
  try {opts=parse(args);} catch(err) {console.error(err.message);usage();return 2;}
  if(opts.help) {usage();return 0;}
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  try {
    if (opts.project) {
      const project = await loadProject(opts.project);
      const run = await auditProject(project, {signal:controller.signal});
      const output = renderProject(run, opts.format);
      if(opts.output) { await writeFile(opts.output, output, 'utf8'); console.log(`Report written to ${opts.output}`); }
      else console.log(output);
      return projectExitCode(run, opts.fail);
    }
    const report=await auditPage(opts.url, {signal:controller.signal});
    const output=opts.format==='json'?JSON.stringify(report,null,2):opts.format==='html'?htmlReport(report):[
      `AccessPilot AI v0.1.0 | ${report.url}`,
      `${report.violations.length} violated rules; ${report.incomplete} checks need review`,
      ...report.violations.map(v=>`${v.impact.toUpperCase()} ${v.id}: ${v.help} (${v.nodes.length} elements)`),
      report.disclaimer
    ].join('\n');
    if(opts.output) {await writeFile(opts.output,output,'utf8');console.log(`Report written to ${opts.output}`);}
    else console.log(output);
    return opts.fail && report.violations.length>0?1:0;
  } catch(err) {console.error(`Audit failed: ${err.message}`);return 2;}
  finally { process.removeListener('SIGINT', cancel); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode=await main();
}
