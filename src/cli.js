#!/usr/bin/env node
import { auditPage } from './audit.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { htmlReport } from './report.js';
import { parse } from './args.js';

function usage() {
  console.log('Usage: accesspilot <http(s) URL> [--format text|json|html] [--output filename] [--fail-on-violations]');
}
export async function main(args=process.argv.slice(2)) {
  let opts;
  try {opts=parse(args);} catch(err) {console.error(err.message);usage();return 2;}
  if(opts.help) {usage();return 0;}
  try {
    const report=await auditPage(opts.url);
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

}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode=await main();
}
