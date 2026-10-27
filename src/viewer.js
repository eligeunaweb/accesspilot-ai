import {createReportRenderer} from './report-renderer.js';
import {checkViewerRequest,createLocalServiceGuard} from './local-service-guard.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { validateProject } from './project.js';
import { listHistory, readHistory, projectKey, historyWindow } from './history.js';
import { validateWorkspace } from './workspace.js';
import { historyFilters, filterHistory } from './history-filter.js';
import { evidenceFilters } from './evidence-filter.js';

import { copy, escape, shell, query, historyView, dashboardView } from './viewer-html.js';

/** Read-only, operator-selected projects only. Never launches audit jobs. */
export async function startHistoryViewer({root, project:input, workspace:workspaceInput, port=0, limits}) {
  if(input && workspaceInput) throw new Error('Choose a project or workspace');
  const workspace=workspaceInput ? validateWorkspace(workspaceInput) : null;
  const single=workspace ? null : validateProject(input);
  const projects=new Map(workspace?.projects.map(project=>[projectKey(project),project])??[]);
  if(typeof root!=='string'||!root.trim()) throw new Error('History directory is required');
  if(!Number.isInteger(port)||port<0||port>65535) throw new Error('Viewer port must be 0–65535');
  const session=`/${randomBytes(32).toString('hex')}/`;
  const guard=createLocalServiceGuard(limits);
  const renderer=createReportRenderer();
  let origin;
  const server=createServer({maxHeaderSize:8192,connectionsCheckingInterval:1000}, async(req,res)=>{
    const nonce=randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    let lease;
    const reply=(status,headers,body)=>{
      if(res.destroyed||res.writableEnded)return;
      if(lease&&!lease.reserve(body)) {
        status=503;headers={'Content-Type':'text/plain; charset=utf-8'};body='Response budget exceeded';
      }
      res.writeHead(status,headers);res.end(body);
    };
    const reject=status=>reply(status,{'Content-Type':'text/plain; charset=utf-8'},'Request rejected');
    const rejected=checkViewerRequest(req,origin,session);
    if(rejected) {if(rejected===405)res.setHeader('Allow','GET');res.setHeader('Connection','close');reject(rejected);return;}
    const admission=guard.admit(res);
    if(!admission.lease) {if(admission.status===429)res.setHeader('Retry-After','1');reject(admission.status);return;}
    lease=admission.lease;
    const controller=new AbortController(),abort=()=>controller.abort();
    res.once('close',abort);
    const render=(operation,payload)=>renderer.render(operation,payload,{signal:controller.signal});
    try {
      const url=new URL(req.url,origin);
      let project=single;
      const base=url.pathname;
      if(base!==session) {
        const path=base.slice(session.length);
        if(!workspace||!/^([a-f0-9]{64})\/$/.test(path)||!projects.has(path.slice(0,-1))) {reject(404);return;}
        project=projects.get(path.slice(0,-1));
      } else if(workspace) project=null;
      const allowed=['lang','run','before','after','page','download','q','from','to','text','severity','status','category','view'];
      if([...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1)) {reject(400);return;}
      const lang=url.searchParams.get('lang')??(workspace??single).language;
      if(!['en','es'].includes(lang)) {reject(400);return;}
      const t=copy[lang], get=key=>url.searchParams.get(key);
      const run=get('run'),before=get('before'),after=get('after'),page=get('page');
      let filters;
      try {filters=historyFilters(url.searchParams);} catch {reject(400);return;}
      const hasFilters=['q','from','to'].some(key=>url.searchParams.has(key));
      if((run||before||after) && hasFilters) {reject(400);return;}
      const hasEvidenceFilters=['text','severity','status','category'].some(key=>url.searchParams.has(key));
      if(hasEvidenceFilters&&!run) {reject(400);return;}
      let evidence;
      try {evidence=evidenceFilters(url.searchParams);} catch {reject(400);return;}
      const view=get('view');
      if(view!==null&&(view!=='trends'||!project||run||before||after||page||hasFilters||get('download'))) {reject(400);return;}
      if(!project) {
        if(['run','before','after','page','download','from','to'].some(key=>url.searchParams.has(key))) {reject(400);return;}
        const selected=workspace.projects.filter(p=>[p.name,...p.urls].some(value=>value.toLowerCase().includes(filters.q.toLowerCase())));
        const cards=await Promise.all(selected.map(async entry=>{
          try { return {project:entry,key:projectKey(entry),ids:await listHistory(root,entry)}; }
          catch { return {project:entry,key:projectKey(entry),error:true}; }
        }));
        const title=lang==='es'?'Panel de proyectos':'Project dashboard';
        const body=dashboardView(cards,filters.q,lang,session);
        reply(200,{'Content-Type':'text/html; charset=utf-8'},shell(workspace,t,lang,base,title,body,nonce));return;
      }
      const download=get('download');
      if(download!==null && (!['json','html','csv','share-json','share-html','share-csv'].includes(download)||!run)) {reject(400);return;}
      if(['run','before','after'].some(key=>get(key)==='')) {reject(400);return;}
      if((run && (before||after||page)) || (!!before!==!!after) || ((before||after)&&page) || (page!==null&&!/^[1-9]\d{0,5}$/.test(page))) {reject(400);return;}
      let title=t.history,body='';
      if(run) {
        const [snapshot]=await readHistory(root,project,[run]);title=t.run;
        if(download) {
          const shared=download.startsWith('share-'),format=shared?download.slice(6):download;
          const output=await render('export',{snapshot,format,lang,shared});
          const type={json:'application/json',html:'text/html',csv:'text/csv'}[format];
          reply(200,{'Content-Type':`${type}; charset=utf-8`,'Content-Disposition':`attachment; filename="accesspilot-${shared?'shared-summary':'evidence'}.${format}"`},output);return;
        }
        const downloads=['json','html','csv'].map(format=>`<a href="${escape(query(base,lang,{run,download:format}))}">${lang==='es'?'Descargar evidencia':'Download evidence'} ${format.toUpperCase()}</a>`).join(' · ');
        const sharedDownloads=['json','html','csv'].map(format=>`<a href="${escape(query(base,lang,{run,download:'share-'+format}))}">${lang==='es'?'Resumen para compartir':'Shared summary'} ${format.toUpperCase()}</a>`).join(' · ');
        body=`<p class="run-id">${escape(run)}</p><p>${downloads}</p><p>${sharedDownloads}</p><p>${lang==='es'?'Los resúmenes reducen datos sensibles; revísalos antes de compartir. No sustituyen la evidencia original.':'Summaries reduce sensitive data; review before sharing. They do not replace original evidence.'}</p>${await render('detail',{snapshot,evidence,lang,base,run})}`;
      } else if(before&&after) {
        const snapshots=await readHistory(root,project,[before,after]);title=t.result;
        body=`<p class="run-id">${escape(t.before)}: ${escape(before)}<br>${escape(t.after)}: ${escape(after)}</p>${await render('compare',{snapshots,lang})}`;
      } else if(view==='trends') {
        title=lang==='es'?'Tendencias del historial':'History trends';
        body=await render('trends',{window:await historyWindow(root,project),lang,base});
      } else {
        const all=await listHistory(root,project),ids=filterHistory(all,filters),offset=(Number(page??1)-1)*50;
        if(offset>0&&offset>=ids.length) {reject(404);return;}
        body=historyView(ids,offset,page,t,base,lang,{filters,total:all.length,latest:all[0]});
        body=`<nav aria-label="Trends"><a href="${escape(query(base,lang,{view:'trends'}))}">${lang==='es'?'Ver tendencias':'View trends'}</a></nav>${body}`;
      }
      if(run||before||view) body=`<nav aria-label="History"><a href="${escape(query(base,lang))}">${escape(t.back)}</a></nav>${body}`;
      if(workspace) body=`<nav aria-label="Projects"><a href="${escape(query(session,lang))}">${lang==='es'?'Todos los proyectos':'All projects'}</a></nav>${body}`;
      reply(200,{'Content-Type':'text/html; charset=utf-8'},shell(project,t,lang,base,title,body,nonce));
    } catch(error) {
      const notFound=error.code==='HISTORY_NOT_FOUND';
      reply(notFound?404:503,{'Content-Type':'text/plain; charset=utf-8'},notFound?'History record not found':'History unavailable. Check records and permissions using the CLI.');
    } finally {res.off('close',abort);lease.done();}
  });
  const refuseExpectation=(_req,res)=>{res.writeHead(417,{'Connection':'close','Content-Length':'0'});res.end();};
  server.on('checkContinue',refuseExpectation);server.on('checkExpectation',refuseExpectation);
  const refuseTunnel=(_req,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  server.on('upgrade',refuseTunnel);server.on('connect',refuseTunnel);
  server.maxConnections=32;server.timeout=15000;
  server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=1000;server.maxRequestsPerSocket=100;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  return {url:origin+session,close:()=>new Promise((resolve,reject)=>{guard.close();server.close(error=>{renderer.close().then(()=>error?reject(error):resolve(),reject);});server.closeAllConnections();})};
}
