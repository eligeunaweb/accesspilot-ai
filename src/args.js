export function parse(args) {
  if (args.includes('--help') || args.includes('-h')) return {help:true};
  const opts = {format:'text', output:null, fail:false, url:null, project:null};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--format' || arg==='--output' || arg==='--project') {
      if(!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      opts[arg.slice(2)]=args[++i];
    } else if(arg==='--fail-on-violations') opts.fail=true;
    else if(arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if(opts.url) throw new Error('Only one URL is supported');
    else opts.url=arg;
  }
  if(opts.project && opts.url) throw new Error('Use a URL or --project, not both');
  if(!opts.url && !opts.project) throw new Error('Provide an http(s) URL or --project file');
  if(!['text','json','html'].includes(opts.format)) throw new Error('Format must be text, json, or html');
  if(opts.project) return opts;
  let url;
  try {url=new URL(opts.url);} catch {throw new Error('Invalid URL');}
  if(!['http:','https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported');
  if(url.username || url.password) throw new Error('URLs with credentials are not supported');
  opts.url=url.toString();
  return opts;
}
