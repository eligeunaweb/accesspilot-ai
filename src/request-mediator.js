import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { isIP } from 'node:net';
import { resolveTarget,createNetworkPolicy } from './network-policy.js';
import { fields } from './worker-protocol.js';

// Internal host-side transport for a future isolated worker. This module does not
// contain a browser: auditPage continues to use its existing authenticated proxy.
const allowedHeaders=new Set(['accept','accept-language','user-agent','cookie','authorization','range','if-range']);
const droppedHeaders=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','proxy-connection','transfer-encoding','te','trailer','upgrade','content-length']);
export function createRequestMediator(urls,network,{maxRequests=200,maxBytes=16*1024*1024,maxRedirects=5,timeoutMs=10000,maxDurationMs=30000,signal,lookup,ca}={}) {
  for(const [name,value,max] of [['maxRequests',maxRequests,10000],['maxBytes',maxBytes,64*1024*1024],['maxRedirects',maxRedirects,20],['timeoutMs',timeoutMs,120000],['maxDurationMs',maxDurationMs,120000]]) {
    if(!Number.isInteger(value)||value<(name==='maxRedirects'?0:1)||value>max) throw new Error('Invalid mediator '+name);
  }
  const policy=createNetworkPolicy(urls,network),controller=new AbortController(),clients=new Set(),queue=[];
  let requests=0,bytes=0,redirects=0,active=0,failed=false,lifetime;
  const deadline=performance.now()+maxDurationMs;
  const close=()=>{clearTimeout(lifetime);controller.abort();for(const client of clients)client.destroy();while(queue.length)queue.shift().reject(new Error('Mediator closed'));};
  const cancel=()=>close();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)close();
  const fail=()=>{failed=true;close();};
  lifetime=setTimeout(fail,maxDurationMs);lifetime.unref();
  if(controller.signal.aborted)clearTimeout(lifetime);
  // A released slot transfers directly to the next waiter. Cancellation rejects
  // all waiters, while active requests release their own slots in finally.
  const acquire=async()=>{
    controller.signal.throwIfAborted();if(active<4){active++;return;}
    if(queue.length>=64)throw new Error('Mediator pending request budget exceeded');
    await new Promise((resolve,reject)=>queue.push({resolve,reject}));
  };
  const release=()=>{if(queue.length&&!controller.signal.aborted)queue.shift().resolve();else active--;};
  async function fetchRequest(input) {
    let acquired=false,timer,abort;
    try {
      if(performance.now()>=deadline)throw new Error('Mediator lifetime exhausted');
      controller.signal.throwIfAborted();
      fields(input,['url','method','headers','navigation']);
      if(typeof input.url!=='string'||input.url.length>8192) throw new Error('Invalid mediated URL');
      if(!['GET','HEAD'].includes(input.method)||typeof input.navigation!=='boolean') throw new Error('Only GET/HEAD requests are supported');
      fields(input.headers,Object.keys(input.headers??{}));
      if(Object.keys(input.headers).length>100) throw new Error('Too many mediated headers');
      if(++requests>maxRequests)throw new Error('Mediator request budget exceeded');
      const checked=policy.check(input.url,input.navigation),headers=Object.create(null);let headerBytes=0;
      for(const [key,value] of Object.entries(input.headers)) {
        if(typeof value!=='string'||key.length>256)throw new Error('Invalid mediated header');
        http.validateHeaderName(key);http.validateHeaderValue(key,value);headerBytes+=Buffer.byteLength(key+value);
        if(headerBytes>16384)throw new Error('Mediated request headers exceed budget');
        if(allowedHeaders.has(key.toLowerCase()))headers[key.toLowerCase()]=value;
      }
      await acquire();acquired=true;
      const target=await resolveTarget(checked.href,policy,{lookup,timeoutMs,signal:controller.signal});controller.signal.throwIfAborted();
      headers.host=target.url.host;
      // DNS is never repeated by Node's HTTP client. TLS still authenticates the
      // original hostname, rather than the selected numeric transport address.
      return await new Promise((resolve,reject)=>{
        const hostname=target.url.hostname.replace(/^\[|\]$/g,''),secure=target.url.protocol==='https:';
        const client=(secure?https:http).request({hostname:target.address,port:target.port,family:target.family,path:target.url.pathname+target.url.search,
          method:input.method,headers,agent:false,maxHeaderSize:16384,...(secure?{servername:isIP(hostname)?'':hostname,rejectUnauthorized:true,checkServerIdentity:(_,certificate)=>tls.checkServerIdentity(hostname,certificate),...(ca?{ca}:{})}:{})},response=>{
          const status=response.statusCode;
          try {
            if(status>=300&&status<400&&response.headers.location) {
              if(++redirects>maxRedirects)throw new Error('Mediator redirect budget exceeded');
              policy.check(new URL(response.headers.location,target.url).href,input.navigation);
            }
          } catch(error){response.destroy();client.destroy();reject(error);return;}
          const parts=[],outputHeaders=Object.create(null);
          const connectionHeaders=new Set(String(response.headers.connection??'').toLowerCase().split(',').map(value=>value.trim()));
          for(const [key,value] of Object.entries(response.headers)) if(!droppedHeaders.has(key)&&!connectionHeaders.has(key)&&value!==undefined) outputHeaders[key]=Array.isArray(value)?value.join('\n'):String(value);
          response.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){response.destroy();client.destroy();reject(new Error('Mediator transfer budget exceeded'));}else parts.push(chunk);});
          response.on('aborted',()=>reject(new Error('Mediated response aborted')));
          response.on('error',reject);response.on('end',()=>resolve({status,headers:outputHeaders,body:Buffer.concat(parts).toString('base64')}));
        });
        clients.add(client);client.once('close',()=>clients.delete(client));client.on('error',reject);
        abort=()=>client.destroy(new Error('Mediator cancelled'));controller.signal.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>client.destroy(new Error('Mediator response deadline exceeded')),timeoutMs);client.end();
      });
    } catch {fail();throw new Error('Mediated request denied or incomplete');}
    finally {clearTimeout(timer);if(abort)controller.signal.removeEventListener('abort',abort);if(acquired)release();}
  }
  return {fetch:fetchRequest,close(){signal?.removeEventListener('abort',cancel);close();},get failed(){return failed;},get requests(){return requests;},get bytes(){return bytes;}};
}
