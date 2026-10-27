import http from 'node:http';
import net from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveTarget } from './network-policy.js';

const hopHeaders=new Set(['proxy-authorization','proxy-authenticate','proxy-connection','connection','keep-alive','te','trailer','transfer-encoding','upgrade']);
function headers(input) {
  const connectionTokens=String(input.connection ?? '').toLowerCase().split(',').map(s=>s.trim());
  return Object.fromEntries(Object.entries(input).filter(([key])=>!hopHeaders.has(key.toLowerCase())&&!connectionTokens.includes(key.toLowerCase())));
}
export async function startEgressProxy(policy, {maxBytes=16*1024*1024, timeoutMs=10000, maxRedirects=5, maxConnections=64, maxRequests=200,maxDurationMs=120000,lookup} = {}) {
  for(const [key,value,min,max] of [['maxBytes',maxBytes,1,64*1024*1024],['timeoutMs',timeoutMs,1,120000],['maxRedirects',maxRedirects,0,10],['maxConnections',maxConnections,1,128],['maxRequests',maxRequests,1,1000],['maxDurationMs',maxDurationMs,1,900000]]) {
    if(!Number.isInteger(value)||value<min||value>max) throw new Error(`Invalid proxy ${key}`);
  }
  const username='accesspilot',password=randomBytes(32).toString('hex');
  const expected=Buffer.from('Basic '+Buffer.from(username+':'+password).toString('base64'));
  const sockets=new Set(),failures=[],controller=new AbortController();let bytes=0,redirects=0,requests=0,exhausted=false,closing=false,closePromise;
  const record=reason=>{if(!closing&&failures.length<20) failures.push(reason);};
  const authorize=req=>{
    const supplied=Buffer.from(String(req.headers['proxy-authorization'] ?? ''));
    return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
  };
  const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});return socket;};
  const exhaust=reason=>{if(!exhausted) record(reason);exhausted=true;controller.abort();for(const socket of sockets) socket.destroy();};
  const admit=()=>{
    if(exhausted||closing) return false;
    if(++requests>maxRequests) {exhaust('Proxy request budget exceeded');return false;}
    return true;
  };
  const budget=chunk=>{
    bytes+=chunk.length;
    if(bytes>maxBytes) {exhaust('Transfer budget exceeded');return false;}
    return true;
  };
  function reply(res,status,message) {if(!res.headersSent){res.writeHead(status,{'Content-Type':'text/plain','Connection':'close'});res.end(message);}else res.destroy();}
  const server=http.createServer({maxHeaderSize:16384,headersTimeout:5000,requestTimeout:timeoutMs},async(req,res)=>{
    if(!authorize(req)){res.writeHead(407,{'Proxy-Authenticate':'Basic realm="AccessPilot"','Connection':'close'});res.end();return;}
    if(!admit()){reply(res,403,'Egress exhausted');return;}
    let target;
    try {
      if(!['GET','HEAD'].includes(req.method)||req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0) throw new Error('Only body-free GET/HEAD requests are allowed');
      target=await resolveTarget(req.url,policy,{lookup,timeoutMs,signal:controller.signal});
      if(target.url.protocol!=='http:') throw new Error('HTTPS requires CONNECT');
      if(closing||exhausted||res.destroyed) return;
    } catch(error) {record(error.message);reply(res,403,'Egress denied');return;}
    const forwarded=headers(req.headers);forwarded.host=target.url.host;delete forwarded['content-length'];
    const outgoing=http.request({host:target.address,port:target.port,family:target.family,method:req.method,
      path:target.url.pathname+target.url.search,headers:forwarded,agent:false},response=>{
      if(response.statusCode>=300&&response.statusCode<400&&response.headers.location) {
        try {
          if(++redirects>maxRedirects) throw new Error('Redirect budget exceeded');
          policy.check(new URL(response.headers.location,target.url).href,req.headers['sec-fetch-mode']==='navigate');
        } catch(error) {record(error.message);response.destroy();reply(res,403,'Redirect denied');return;}
      }
      res.writeHead(response.statusCode,headers(response.headers));
      response.on('data',budget);response.on('error',()=>{record('Upstream response failed');res.destroy();});response.pipe(res);
    });
    outgoing.on('socket',track);outgoing.setTimeout(timeoutMs,()=>outgoing.destroy(new Error('Upstream timeout')));
    outgoing.on('error',()=>{record('Upstream HTTP request failed');reply(res,502,'Upstream failed');});
    res.on('close',()=>outgoing.destroy());outgoing.end();
  });
  server.maxConnections=maxConnections;
  server.maxRequestsPerSocket=100;
  server.on('drop',()=>record('Connection budget exceeded'));
  server.on('connection',socket=>{track(socket);socket.setTimeout(timeoutMs,()=>socket.destroy());});
  server.on('clientError',(_,socket)=>socket.destroy());
  server.on('upgrade',(_,socket)=>{record('Protocol upgrades are blocked');socket.destroy();});
  server.on('connect',async(req,client,head)=>{
    if(!authorize(req)){client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="AccessPilot"\r\nConnection: close\r\n\r\n');return;}
    if(!admit()){client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    let target;
    try {
      if(!/^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+):[0-9]+$/.test(req.url)) throw new Error('Invalid CONNECT authority');
      target=await resolveTarget('https://'+req.url,policy,{lookup,timeoutMs,signal:controller.signal});
      if(head.length>16384) throw new Error('CONNECT preface too large');
      if(closing||exhausted||client.destroyed) return;
    } catch(error) {record(error.message);client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    const upstream=track(net.connect({host:target.address,port:target.port,family:target.family}));
    upstream.setTimeout(timeoutMs,()=>upstream.destroy(new Error('Tunnel timeout')));
    upstream.once('connect',()=>{
      if(client.destroyed||closing||exhausted){upstream.destroy();return;}
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length&&budget(head)) upstream.write(head);
      client.on('data',budget);upstream.on('data',budget);
      client.pipe(upstream);upstream.pipe(client);
    });
    upstream.on('error',()=>{record('Upstream tunnel failed');client.destroy();});
    client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const deadline=setTimeout(()=>exhaust('Proxy absolute deadline exceeded'),maxDurationMs);deadline.unref();
  return {server:`http://127.0.0.1:${server.address().port}`,username,password,failures,
    get bytes(){return bytes;},
    get requests(){return requests;},
    close(){
      if(!closePromise) {closing=true;clearTimeout(deadline);controller.abort();closePromise=new Promise(resolve=>{
        server.close(resolve);for(const socket of sockets) socket.destroy();
      });}
      return closePromise;
    }};
}
