import {performance} from 'node:perf_hooks';

const defaults={maxActive:4,maxResponseBytes:40*1024*1024,maxPendingBytes:64*1024*1024,burst:120,refillPerSecond:2,lifetimeMs:15000};
export function checkViewerRequest(req,origin,session) {
  const singleton=new Set(['host','origin','sec-fetch-site','content-length','transfer-encoding','expect']);
  const seen=new Set();
  for(let index=0;index<(req.rawHeaders?.length??0);index+=2) {
    const name=req.rawHeaders[index].toLowerCase();
    if(singleton.has(name)&&seen.has(name))return 400;
    seen.add(name);
  }
  const site=req.headers['sec-fetch-site'];
  if(req.headers.host!==origin.slice(7)||(req.headers.origin!==undefined&&req.headers.origin!==origin)||(site!==undefined&&!['same-origin','none'].includes(site)))return 403;
  if(req.method!=='GET')return 405;
  if(req.headers['transfer-encoding']!==undefined||(req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')||req.headers.expect!==undefined||req.headers.upgrade!==undefined)return 400;
  if(!req.url||req.url.length>2048||!req.url.startsWith(session))return 404;
  return 0;
}

// Budgets cover admitted work and queued response bodies, not total JS heap or OS buffers.
export function createLocalServiceGuard(limits={}, {now=()=>performance.now()}={}) {
  if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).some(key=>!Object.hasOwn(defaults,key)))throw new Error('Invalid local service limits');
  const config={...defaults,...limits};
  for(const key of Object.keys(defaults))if(!Number.isSafeInteger(config[key])||config[key]<1||config[key]>defaults[key])throw new Error('Invalid local service limit '+key);
  const live=new Set();let pendingBytes=0,tokens=config.burst,last=now(),closed=false;
  return {
    snapshot(){return {active:live.size,pendingBytes,closed};},
    admit(res) {
      if(closed||live.size>=config.maxActive)return {status:503};
      const instant=now();tokens=Math.min(config.burst,tokens+Math.max(0,instant-last)*config.refillPerSecond/1000);last=instant;
      if(tokens<1)return {status:429};tokens--;
      let workDone=false,responseDone=false,bytes=0,reserved=false;
      const entry={destroy:()=>res.destroy()};live.add(entry);
      const release=()=>{if(workDone&&responseDone)live.delete(entry);};
      const finished=()=>{
        if(responseDone)return;
        responseDone=true;pendingBytes-=bytes;bytes=0;clearTimeout(timer);release();
      };
      const timer=setTimeout(()=>res.destroy(),config.lifetimeMs);timer.unref();
      res.once('finish',finished);res.once('close',finished);
      return {status:200,lease:{
        reserve(body) {
          if(reserved||responseDone)return false;
          const size=Buffer.byteLength(body);
          if(size>config.maxResponseBytes||pendingBytes+size>config.maxPendingBytes)return false;
          reserved=true;bytes=size;pendingBytes+=size;return true;
        },
        done(){workDone=true;release();}
      }};
    },
    close(){closed=true;for(const entry of live)entry.destroy();}
  };
}
