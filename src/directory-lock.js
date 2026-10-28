import {mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';

// mkdir remains the only acquisition operation. Never unlink/steal another owner's lock.
// Windows may transiently deny recreating a just-removed directory under contention.
export async function acquireDirectoryLock(path,{create=mkdir,wait=delay,now=()=>performance.now(),platform=process.platform,timeoutMs=5000}={}) {
  const deadline=now()+timeoutMs;
  while(true) {
    try {await create(path,{mode:0o700});return;}
    catch(error) {
      const retry=error.code==='EEXIST' || platform==='win32' && error.code==='EPERM';
      if(!retry)throw error;
      if(now()>=deadline)throw new Error('History is busy, inaccessible or has an abandoned .history-lock; stop other history processes before inspecting permissions or removing the lock',{cause:error});
      await wait(Math.min(25,Math.max(1,deadline-now())));
    }
  }
}
