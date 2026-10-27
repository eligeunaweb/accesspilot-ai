import {immutableImage} from './isolation.js';
import { languageCode } from './i18n.js';
export function parse(args) {
  if (args.includes('--help') || args.includes('-h')) return {help:true};
  const opts = {format:'text', output:null, fail:false, url:null, project:null};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--format' || arg==='--output' || arg==='--project' || arg==='--workspace' || arg==='--lang' || arg==='--baseline' || arg==='--history' || arg==='--keep-runs' || arg==='--port' || arg==='--import-history' || arg==='--session-state' || arg==='--review-template' || arg==='--review-audit' || arg==='--manual-review' || arg==='--isolation-image' || arg==='--job-store' || arg==='--share-report') {
      if(!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      opts[arg.slice(2)]=args[++i];
    } else if(arg==='--list-history') opts.listHistory=true;
    else if(arg==='--serve-history') opts.serveHistory=true;
    else if(arg==='--prune-history') opts.pruneHistory=true;
    else if(arg==='--apply-retention') opts.applyRetention=true;
    else if(arg==='--fail-on-violations') opts.fail=true;
    else if(arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if(opts.url) throw new Error('Only one URL is supported');
    else opts.url=arg;
  }
  if(opts['share-report']!==undefined) {
    const allowed=new Set(['format','output','fail','url','project','share-report','lang']);
    if(Object.keys(opts).some(key=>!allowed.has(key))||opts.fail||opts.url||opts.project) throw new Error('--share-report is an offline export; use only --format, --lang and --output');
    if(!['text','json','html','csv'].includes(opts.format))throw new Error('Format must be text, json, html, or csv');
    if(opts.lang!==undefined)languageCode(opts.lang);
    return opts;
  }
  if(opts.project && opts.url) throw new Error('Use a URL or --project, not both');
  if(opts.workspace && (opts.project || opts.url)) throw new Error('Use --workspace or a project/URL, not both');
  if(opts.workspace && !opts.serveHistory) throw new Error('--workspace requires --serve-history');
  if(!opts.url && !opts.project && !opts.workspace) throw new Error('Provide an http(s) URL, --project or --workspace file');
  if(!['text','json','html','csv'].includes(opts.format)) throw new Error('Format must be text, json, html, or csv');
  if(opts.lang !== undefined) languageCode(opts.lang);
  if(opts.baseline && !opts.project) throw new Error('--baseline requires --project');
  if(opts.history && !opts.project && !opts.workspace) throw new Error('--history requires --project or --workspace');
  if(opts.listHistory && (!opts.project || !opts.history)) throw new Error('--list-history requires --project and --history');
  if(opts.baseline==='latest' && !opts.history) throw new Error('--baseline latest requires --history');
  if(opts.pruneHistory) {
    if(!opts.project || !opts.history) throw new Error('--prune-history requires --project and --history');
    if(!/^[1-9]\d{0,4}$/.test(opts['keep-runs'] ?? '') || Number(opts['keep-runs'])>10000) throw new Error('--keep-runs must be an integer between 1 and 10000');
    opts.keepRuns=Number(opts['keep-runs']);
  } else if(opts['keep-runs']!==undefined || opts.applyRetention) throw new Error('--keep-runs and --apply-retention require --prune-history');
  if(opts.serveHistory && ((!opts.project && !opts.workspace) || !opts.history)) throw new Error('--serve-history requires --project or --workspace, and --history');
  if(opts['import-history']&&(!opts.project||!opts.history)) throw new Error('--import-history requires --project and --history');
  if(opts.port!==undefined) {
    if(!opts.serveHistory || !/^(0|[1-9]\d{0,4})$/.test(opts.port) || Number(opts.port)>65535) throw new Error('--port requires --serve-history and an integer from 0 to 65535');
    opts.port=Number(opts.port);
  }
  if(opts['review-template']||opts['manual-review']||opts['review-audit']) {
    if(!opts.project||opts.workspace||opts.url||opts.baseline||opts.fail||opts['session-state']||opts.listHistory||opts.pruneHistory||opts.serveHistory||opts['import-history']||opts.format!=='text') throw new Error('Manual review operations require an offline project operation');
    if(opts['review-template']) {
      if(opts['manual-review']||opts['review-audit']) throw new Error('Choose template or manual review attachment');
    } else if(!opts['manual-review']||!opts['review-audit']||!opts.history||opts.output) throw new Error('Manual attachment requires --manual-review, --review-audit and --history without --output');
  }
  if(opts.listHistory || opts.pruneHistory || opts.serveHistory || opts['import-history']) {
    if([opts.listHistory,opts.pruneHistory,opts.serveHistory,opts['import-history']].filter(Boolean).length>1) throw new Error('Choose one history operation');
    if(opts.baseline || opts.output || opts.fail || opts.format!=='text') throw new Error('History maintenance cannot be combined with audit output or baseline options');
  }
  if(opts['session-state']&&(!opts.project||opts.listHistory||opts.pruneHistory||opts.serveHistory||opts['import-history'])) throw new Error('--session-state requires a project audit');
  if(opts['isolation-image']!==undefined) {
    immutableImage(opts['isolation-image']);
    if(!opts.project||opts.workspace||opts.listHistory||opts.pruneHistory||opts.serveHistory||opts['import-history']||opts['review-template']||opts['manual-review']||opts['review-audit'])throw new Error('--isolation-image requires a project audit');
  }
  if(opts['job-store']!==undefined && !opts['isolation-image']) throw new Error('--job-store requires --isolation-image');
  if(opts.project || opts.workspace) return opts;
  let url;
  try {url=new URL(opts.url);} catch {throw new Error('Invalid URL');}
  if(!['http:','https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported');
  if(url.username || url.password) throw new Error('URLs with credentials are not supported');
  opts.url=url.toString();
  return opts;
}
