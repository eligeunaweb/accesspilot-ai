import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const defaults={maxWorkers:2,timeoutMs:10000,maxInputBytes:64*1024*1024,maxOutputBytes:40*1024*1024};
const worker=fileURLToPath(new URL('./report-render-worker.js',import.meta.url));
const failure=()=>new Error('Report rendering unavailable');

// Process separation and a V8 heap ceiling are not an OS sandbox or RSS limit.
export function createReportRenderer(limits={}, {forkChild=fork}={}) {
  if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).some(key=>!Object.hasOwn(defaults,key)))throw failure();
  const config={...defaults,...limits};
  for(const key of Object.keys(defaults))if(!Number.isSafeInteger(config[key])||config[key]<1||config[key]>defaults[key])throw failure();
  const active=new Set();let closed=false;
  return {
    async render(operation,payload,{signal}={}) {
      if(closed||signal?.aborted||active.size>=config.maxWorkers||!['detail','compare','export','trends'].includes(operation))throw failure();
      const input=JSON.stringify(payload);
      if(Buffer.byteLength(input)>config.maxInputBytes)throw failure();
      return new Promise((resolve,reject)=>{
        let child,result,failed=false,timer;
        const entry={cancel:()=>{failed=true;child?.kill('SIGKILL');},finished:null};
        active.add(entry);
        entry.finished=new Promise(done=>{
          const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',entry.cancel);active.delete(entry);done();if(failed||result===undefined)reject(failure());else resolve(result);};
          try {
            const env={};for(const key of ['SystemRoot','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
            child=forkChild(worker,[],{execArgv:['--max-old-space-size=192','--stack-size=1024'],env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],serialization:'json'});
          } catch {failed=true;finish();return;}
          child.once('close',finish);
          child.on('error',()=>{failed=true;child.kill('SIGKILL');});
          child.once('message',message=>{
            if(!failed&&message?.ok===true&&typeof message.body==='string'&&Buffer.byteLength(message.body)<=config.maxOutputBytes)result=message.body;
            else failed=true;
            child.kill('SIGKILL');
          });
          signal?.addEventListener('abort',entry.cancel,{once:true});
          timer=setTimeout(entry.cancel,config.timeoutMs);timer.unref();
          if(signal?.aborted){entry.cancel();return;}
          child.send({operation,input,maxOutputBytes:config.maxOutputBytes},error=>{if(error){failed=true;child.kill('SIGKILL');}});
        });
      });
    },
    async close(){closed=true;const pending=[...active];for(const entry of pending)entry.cancel();await Promise.all(pending.map(entry=>entry.finished));}
  };
}
