import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {equalSecret,jobRequestError,MAX_COMMAND_BYTES} from './web-job-request.js';

function flatCommand(body,keys) {
  if(!Buffer.isBuffer(body)||body.length>MAX_COMMAND_BYTES)throw jobRequestError();
  let value,source;
  try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);value=JSON.parse(source);}catch{throw jobRequestError();}
  if(!value||Array.isArray(value)||typeof value!=='object'||value.schemaVersion!==1||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key))||[...source.matchAll(/"(?:[^"\\]|\\.)*"\s*:/g)].length!==keys.length)throw jobRequestError();
  return value;
}
export function parseSessionRevocation(body){flatCommand(body,['schemaVersion']);}

// Operator-issued, short-lived capability. No public endpoint can mint pairing codes.
export function createBrowserBootstrap(supervisor,{now=()=>performance.now(),ttlMs=120000,maxPending=8}={}) {
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>120000||!Number.isSafeInteger(maxPending)||maxPending<1||maxPending>8)throw jobRequestError();
  const pending=new Set();let closed=false;
  function sweep(){for(const item of pending)if(now()>=item.expires)pending.delete(item);}
  return {
    issue(){sweep();if(closed||pending.size>=maxPending)throw jobRequestError(503);const code=randomBytes(32).toString('hex');pending.add({code,expires:now()+ttlMs});return {code,expiresInMs:ttlMs};},
    exchange(body) {
      const {pairingCode}=flatCommand(body,['schemaVersion','pairingCode']);
      if(typeof pairingCode!=='string'||!/^[a-f0-9]{64}$/.test(pairingCode))throw jobRequestError();
      sweep();let found;for(const item of pending)if(equalSecret(item.code,pairingCode))found=item;
      if(closed||!found)throw jobRequestError(403);
      // Consume before allocating a session, including when session capacity is exhausted.
      pending.delete(found);const credentials=supervisor.openSession();
      return {...credentials,projects:supervisor.projects()};
    },
    close(){closed=true;pending.clear();}
  };
}
