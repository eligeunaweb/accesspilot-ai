import http from 'node:http';
import {performance} from 'node:perf_hooks';
import {createWebJobSupervisor} from './web-job-supervisor.js';
import {checkJobEnvelope,jobIdPattern,jobRequestError,MAX_COMMAND_BYTES} from './web-job-request.js';
import {createBrowserBootstrap} from './web-job-bootstrap.js';
import {loadBrowserAssets} from './web-jobs-page.js';

const defaults={maxSockets:32,maxActive:4,burst:120,refillPerSecond:2,bodyMs:10000,responseMs:15000};

// Explicit trusted entry point. No credentials, project configuration or engine controls in URLs.
export async function startWebJobTransport(options,{createSupervisor=createWebJobSupervisor,limits={}}={}) {
  if(Object.keys(limits).some(key=>!Object.hasOwn(defaults,key)))throw jobRequestError();
  const bounds={...defaults,...limits};
  for(const key of Object.keys(defaults))if(!Number.isSafeInteger(bounds[key])||bounds[key]<1||bounds[key]>defaults[key])throw jobRequestError();
  const assets=await loadBrowserAssets();
  const sockets=new Set(),handlers=new Set();let supervisor,bootstrap,origin,closing,stopped=false,active=0,tokens=bounds.burst,last=performance.now();
  function route(req) {
    if(assets.has(req.url))return {action:'asset',asset:assets.get(req.url)};
    if(req.url==='/api/v1/session')return {action:'pair'};
    if(req.url==='/api/v1/session/revoke')return {action:'revoke'};
    if(req.url==='/api/v1/jobs')return {action:'create'};
    if(req.url==='/api/v1/cancellations')return {action:'cancel'};
    const prefix='/api/v1/jobs/';
    if(req.url.startsWith(prefix)&&jobIdPattern.test(req.url.slice(prefix.length)))return {action:'status',id:req.url.slice(prefix.length)};
    throw jobRequestError(404);
  }
  function reply(res,status,value={error:'Job request rejected'},asset) {
    if(res.destroyed||res.writableEnded)return;
    res.writeHead(status,{'Content-Type':asset?.type??'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff','Content-Security-Policy':asset?"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'":"default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin',Connection:'close'});
    res.end(asset?asset.body:JSON.stringify(value));
  }
  function readBody(req,res) {
    return new Promise((resolve,reject)=>{
      const chunks=[];let bytes=0,done=false;
      const finish=(error)=>{
        if(done)return;done=true;clearTimeout(timer);
        req.off('data',data);req.off('end',end);req.off('aborted',abort);req.off('error',abort);res.off('close',abort);
        if(error)reject(error);else resolve(Buffer.concat(chunks,bytes));
      };
      const data=chunk=>{bytes+=chunk.length;if(bytes>MAX_COMMAND_BYTES)finish(jobRequestError(413));else chunks.push(chunk);};
      const end=()=>finish(bytes===Number(req.headers['content-length']??0)?undefined:jobRequestError());
      const abort=()=>finish(jobRequestError());
      const timer=setTimeout(()=>finish(jobRequestError(408)),bounds.bodyMs);
      req.on('data',data);req.once('end',end);req.once('aborted',abort);req.once('error',abort);res.once('close',abort);
    });
  }
  async function handle(req,res) {
    if(stopped||!supervisor){reply(res,503);return;}
    const now=performance.now();tokens=Math.min(bounds.burst,tokens+(now-last)*bounds.refillPerSecond/1000);last=now;
    if(tokens<1){reply(res,429);return;}tokens--;
    if(active>=bounds.maxActive){reply(res,503);return;}
    active++;let finished=false,responseDone=false,released=false;
    const release=()=>{if(finished&&responseDone&&!released){released=true;active--;}};
    const responseEnd=()=>{responseDone=true;release();};res.once('close',responseEnd);res.once('finish',responseEnd);
    // A response deadline does not cancel an already durable admission or release its active slot.
    const deadline=setTimeout(()=>{reply(res,504);res.destroy();},bounds.responseMs);
    try {
      if(req.url.length>512||req.rawHeaders.length>128)throw jobRequestError(431);
      const target=route(req);let permit;
      if(target.action==='asset')checkJobEnvelope(req,origin,'status');
      else if(target.action==='pair') {
        checkJobEnvelope(req,origin,'create');
        if(req.headers.authorization!==undefined||req.headers['x-accesspilot-csrf']!==undefined)throw jobRequestError();
      } else permit=supervisor.authorize(req,target.action);
      const body=await readBody(req,res);
      if(res.destroyed||res.writableEnded)throw jobRequestError();
      if(target.action==='asset'){reply(res,200,null,target.asset);return;}
      if(target.action==='pair'){reply(res,200,bootstrap.exchange(body));return;}
      if(target.action==='revoke') {
        reply(res,200,supervisor.endSession(permit,body));return;
      }
      const receipt=target.action==='create'?await supervisor.submit(permit,body):target.action==='cancel'?await supervisor.cancel(permit,body):supervisor.status(permit,target.id);
      reply(res,target.action==='create'?202:200,receipt);
    } catch(error) {reply(res,[400,403,404,405,408,409,413,415,429,431,503].includes(error.status)?error.status:503);}
    finally {clearTimeout(deadline);finished=true;release();}
  }
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000,connectionsCheckingInterval:1000},(req,res)=>{
    req.on('error',()=>{});
    const pending=handle(req,res);handlers.add(pending);pending.finally(()=>handlers.delete(pending)).catch(()=>{});
  });
  server.keepAliveTimeout=1;server.maxRequestsPerSocket=1;
  server.on('connection',socket=>{
    if(stopped||sockets.size>=bounds.maxSockets){socket.destroy();return;}
    sockets.add(socket);socket.once('close',()=>sockets.delete(socket));
    socket.setTimeout(10000,()=>socket.destroy());
  });
  server.on('clientError',(_error,socket)=>socket.destroy());
  server.on('checkContinue',(_req,res)=>reply(res,417));server.on('checkExpectation',(_req,res)=>reply(res,417));
  for(const event of ['upgrade','connect'])server.on(event,(_req,socket)=>socket.destroy());
  async function close() {
    if(closing)return closing;stopped=true;bootstrap?.close();
    closing=(async()=>{
      const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      for(const socket of sockets)socket.destroy();
      await Promise.allSettled([...handlers]);
      try{await supervisor?.close();}finally{await ended;}
    })();return closing;
  }
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  origin='http://127.0.0.1:'+server.address().port;
  try{supervisor=await createSupervisor({...options,origin});bootstrap=createBrowserBootstrap(supervisor);}catch(error){await close();throw error;}
  return {origin,connectionUrl:origin+'/connect',projects:()=>supervisor.projects(),openSession:()=>supervisor.openSession(),
    createPairingCode:()=>bootstrap.issue(),
    revokeSession:credentials=>supervisor.revokeSession(credentials),close};
}
