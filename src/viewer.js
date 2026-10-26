import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { validateProject } from './project.js';
import { listHistory, readHistory, projectKey } from './history.js';
import { validateWorkspace } from './workspace.js';
import { historyFilters, filterHistory } from './history-filter.js';
import { compareAudits } from './comparison.js';

import { copy, escape, shell, query, runView, comparisonView, historyView, dashboardView } from './viewer-html.js';

/** Read-only, operator-selected projects only. Never launches audit jobs. */
export async function startHistoryViewer({root, project:input, workspace:workspaceInput, port=0}) {
  if(input && workspaceInput) throw new Error('Choose a project or workspace');
  const workspace=workspaceInput ? validateWorkspace(workspaceInput) : null;
  const single=workspace ? null : validateProject(input);
  const projects=new Map(workspace?.projects.map(project=>[projectKey(project),project])??[]);
  if(typeof root!=='string'||!root.trim()) throw new Error('History directory is required');
  if(!Number.isInteger(port)||port<0||port>65535) throw new Error('Viewer port must be 0–65535');
  const session=`/${randomBytes(32).toString('hex')}/`;
  let origin, active=0;
  const server=createServer({maxHeaderSize:8192}, async(req,res)=>{
    const nonce=randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    const reject=(status)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end('Request rejected');};
    if(req.headers.host!==origin.slice(7) || (req.headers.origin && req.headers.origin!==origin) || ['cross-site','same-site'].includes(req.headers['sec-fetch-site'])) {reject(403);return;}
    if(req.method!=='GET') {res.setHeader('Allow','GET');reject(405);return;}
    if(!req.url || req.url.length>2048 || !req.url.startsWith(session)) {reject(404);return;}
    if(active>=4) {reject(503);return;}
    active++;
    try {
      const url=new URL(req.url,origin);
      let project=single;
      const base=url.pathname;
      if(base!==session) {
        const path=base.slice(session.length);
        if(!workspace||!/^([a-f0-9]{64})\/$/.test(path)||!projects.has(path.slice(0,-1))) {reject(404);return;}
        project=projects.get(path.slice(0,-1));
      } else if(workspace) project=null;
      const allowed=['lang','run','before','after','page','download','q','from','to'];
      if([...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1)) {reject(400);return;}
      const lang=url.searchParams.get('lang')??(workspace??single).language;
      if(!['en','es'].includes(lang)) {reject(400);return;}
      const t=copy[lang], get=key=>url.searchParams.get(key);
      const run=get('run'),before=get('before'),after=get('after'),page=get('page');
      let filters;
      try {filters=historyFilters(url.searchParams);} catch {reject(400);return;}
      const hasFilters=['q','from','to'].some(key=>url.searchParams.has(key));
      if((run||before||after) && hasFilters) {reject(400);return;}
      if(!project) {
        if(['run','before','after','page','download','from','to'].some(key=>url.searchParams.has(key))) {reject(400);return;}
        const selected=workspace.projects.filter(p=>[p.name,...p.urls].some(value=>value.toLowerCase().includes(filters.q.toLowerCase())));
        const cards=await Promise.all(selected.map(async entry=>{
          try { return {project:entry,key:projectKey(entry),ids:await listHistory(root,entry)}; }
          catch { return {project:entry,key:projectKey(entry),error:true}; }
        }));
        const title=lang==='es'?'Panel de proyectos':'Project dashboard';
        const body=dashboardView(cards,filters.q,lang,session);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(shell(workspace,t,lang,base,title,body,nonce));return;
      }
      const download=get('download');
      if(download!==null && (download!=='json'||!run)) {reject(400);return;}
      if(['run','before','after'].some(key=>get(key)==='')) {reject(400);return;}
      if((run && (before||after||page)) || (!!before!==!!after) || ((before||after)&&page) || (page!==null&&!/^[1-9]\d{0,5}$/.test(page))) {reject(400);return;}
      let title=t.history,body='';
      if(run) {
        const [snapshot]=await readHistory(root,project,[run]);title=t.run;
        if(download) {
          res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="accesspilot-evidence.json"'});
          res.end(JSON.stringify(snapshot));return;
        }
        body=`<p class="run-id">${escape(run)}</p><p><a href="${escape(query(base,lang,{run,download:'json'}))}">${lang==='es'?'Descargar evidencia JSON':'Download JSON evidence'}</a></p>${runView(snapshot,t)}`;
      } else if(before&&after) {
        const snapshots=await readHistory(root,project,[before,after]);title=t.result;
        body=`<p class="run-id">${escape(t.before)}: ${escape(before)}<br>${escape(t.after)}: ${escape(after)}</p>${comparisonView(compareAudits(...snapshots),t)}`;
      } else {
        const all=await listHistory(root,project),ids=filterHistory(all,filters),offset=(Number(page??1)-1)*50;
        if(offset>0&&offset>=ids.length) {reject(404);return;}
        body=historyView(ids,offset,page,t,base,lang,{filters,total:all.length,latest:all[0]});
      }
      if(run||before) body=`<nav><a href="${escape(query(base,lang))}">${escape(t.back)}</a></nav>${body}`;
      if(workspace) body=`<nav><a href="${escape(query(session,lang))}">${lang==='es'?'Todos los proyectos':'All projects'}</a></nav>${body}`;
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(shell(project,t,lang,base,title,body,nonce));
    } catch(error) {
      const notFound=error.code==='HISTORY_NOT_FOUND';
      res.writeHead(notFound?404:503,{'Content-Type':'text/plain; charset=utf-8'});
      res.end(notFound?'History record not found':'History unavailable. Check records and permissions using the CLI.');
    } finally { active--; }
  });
  server.maxConnections=32;server.timeout=15000;
  server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=1000;server.maxRequestsPerSocket=100;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  return {url:origin+session,close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();})};
}
