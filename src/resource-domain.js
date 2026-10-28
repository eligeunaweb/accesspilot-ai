import {mkdir,lstat,realpath,open,readFile,unlink,rmdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const budget=Object.freeze({workers:2,memoryMiB:2048,cpu:2,pids:512});
async function identity(path) {
  const canonical=await realpath(path);
  return createHash('sha256').update(process.platform==='win32'?canonical.toLowerCase():canonical).digest('hex');
}
async function readRecord(path) {
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2048)throw new Error('Invalid resource reservation file');
  const value=JSON.parse(await readFile(path,'utf8'));
  if(!value||Object.keys(value).sort().join()!=='budget,domain,owner,schemaVersion,store'||value.schemaVersion!==1||!uuid.test(value.owner)||!digest.test(value.domain)||!digest.test(value.store)||JSON.stringify(value.budget)!==JSON.stringify(budget))throw new Error('Invalid resource reservation');
  return value;
}
async function writeRecord(path,record) {
  const file=await open(path,'wx',0o600);
  try {await file.writeFile(JSON.stringify(record));await file.sync();}finally {await file.close();}
}
export async function hasResourceLease(root) {
  try {await lstat(join(root,'resource-lease.json'));return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}
}

// Trusted local API; caller holds this job store's .queue-lock throughout.
// One supervisor per explicit domain. Never steal/reap leases based on PID or age.
export async function createResourceDomain(root,directory,{recovery=false}={}) {
  if(typeof directory!=='string'||!directory)throw new Error('Invalid resource directory');
  const base=resolve(directory);await mkdir(base,{recursive:true,mode:0o700});
  const stat=await lstat(base);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Resource directory must be real');
  const domain=await identity(base),store=await identity(root),lock=join(base,'.resource-lock'),lease=join(root,'resource-lease.json'),recordPath=join(lock,'owner.json');
  let record;
  if(recovery) {
    if(await hasResourceLease(root)) {
      record=await readRecord(lease);
      if(record.domain!==domain||record.store!==store)throw new Error('Resource domain/store identity mismatch');
    }
  } else {
    if(await hasResourceLease(root))throw new Error('Unresolved resource lease; run offline recovery');
    try {await mkdir(lock,{mode:0o700});}
    catch(error) {if(error.code==='EEXIST')throw new Error('Resource domain busy or abandoned; no audit started');throw error;}
    record={schemaVersion:1,owner:randomUUID(),domain,store,budget};
    try {
      await writeRecord(recordPath,record);
      await writeRecord(lease,record);
    } catch(cause) {
      throw Object.assign(new Error('Resource reservation persistence failed; preserve locks for operator investigation',{cause}),{code:'ACCESSPILOT_RESOURCE_UNVERIFIED'});
    }
  }
  async function inspect() {
    if(!record)return {state:'not-reserved',budget};
    const saved=await readRecord(lease);
    if(JSON.stringify(saved)!==JSON.stringify(record))throw new Error('Resource lease ownership changed');
    let actual;
    try {
      const stat=await lstat(lock);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Resource lock must be real');
      actual=await readRecord(recordPath);
    } catch(error) {
      // A cleanly removed gate can leave a lease if the process died before its unlink.
      // Only missing directory, not missing owner.json or a permission error, proves that state.
      try {await lstat(lock);}catch(missing){if(missing.code==='ENOENT')return {state:'gate-absent',budget};}
      throw error;
    }
    if(JSON.stringify(actual)!==JSON.stringify(record))throw new Error('Resource reservation owned by another supervisor');
    return {state:'owned',budget};
  }
  return {
    budget,
    inspect,
    async release() {
      const plan=await inspect();
      if(plan.state==='not-reserved')return;
      if(plan.state==='owned') {
        // Recheck immediately before mutation; no recursive delete or unrelated file removal.
        if(JSON.stringify(await readRecord(recordPath))!==JSON.stringify(record))throw new Error('Resource ownership changed');
        await unlink(recordPath);await rmdir(lock);
      }
      await unlink(lease);record=undefined;
    }
  };
}
