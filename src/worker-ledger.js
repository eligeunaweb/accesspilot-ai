import {mkdir, lstat, readdir, readFile, open, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {immutableImage} from './isolation.js';

const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const containerId=/^[a-f0-9]{64}$/;
const run=promisify(execFile);
function validate(record) {
  if (!record || Object.keys(record).sort().join()!=='engineId,imageId,jobId,name,owner,schemaVersion' || record.schemaVersion!==1 || !uuid.test(record.jobId) || !uuid.test(record.owner) || !/^accesspilot-worker-[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(record.name) || typeof record.engineId!=='string' || !/^[a-zA-Z0-9:-]{1,128}$/.test(record.engineId)) throw new Error('Invalid worker ownership record');
  immutableImage(record.imageId);
  return record;
}
export function verifyOwnedWorker(worker, record, expectedId) {
  if (!worker || !containerId.test(worker.Id) || expectedId && worker.Id!==expectedId || worker.Name!=='/'+record.name || worker.Config?.Image!==record.imageId || worker.Config?.Labels?.['org.accesspilot.worker']!==record.owner || typeof worker.State?.Running!=='boolean' || typeof worker.State?.OOMKilled!=='boolean') throw new Error('Worker ownership could not be verified');
  return worker.Id;
}

// Trusted internal API: the caller must hold the job-store .queue-lock throughout.
// Immutable intent is synced before Docker create. No URL, session or page data.
export async function createWorkerLedger(root) {
  const directory=join(root,'workers');
  await mkdir(directory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const stat=await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Worker ledger must be a real directory');
  async function entries() {
    const names=await readdir(directory);
    if (names.length>1000 || names.some(name=>!name.endsWith('.json') || !uuid.test(name.slice(0,-5)))) throw new Error('Invalid worker ledger entries');
    const records=[];
    for (const name of names.sort()) {
      const path=join(directory,name),stat=await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size>4096) throw new Error('Invalid worker ownership file');
      const record=validate(JSON.parse(await readFile(path,'utf8')));
      if (record.jobId!==name.slice(0,-5)) throw new Error('Worker ownership filename mismatch');
      records.push(record);
    }
    return records;
  }
  const pending=new Set((await entries()).map(row=>row.jobId));
  return {
    get size() {return pending.size;},
    lifecycle(jobId) {
      if (!uuid.test(jobId)) throw new Error('Invalid worker job ID');
      let reserved=false;
      return {
        async reserve(claim) {
          const record=validate({...claim,schemaVersion:1,jobId});
          if (pending.size>=1000) throw new Error('Worker ledger is full');
          const file=await open(join(directory,jobId+'.json'),'wx',0o600);
          // Keep partial files on failure: fail closed, never silently lose an intent.
          pending.add(jobId);
          try {await file.writeFile(JSON.stringify(record));await file.sync();reserved=true;}
          finally {await file.close();}
        },
        async release() {
          if (!reserved) throw new Error('Worker intent was not durably reserved');
          await unlink(join(directory,jobId+'.json'));pending.delete(jobId);reserved=false;
        }
      };
    },
    async recover({apply=false,signal,execute=run}={}) {
      if (typeof apply!=='boolean') throw new Error('Invalid recovery mode');
      signal=signal ? AbortSignal.any([signal,AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
      const docker=async args=>{signal?.throwIfAborted();return (await execute('docker',args,{timeout:30000,maxBuffer:256*1024,windowsHide:true,shell:false,signal})).stdout.trim();};
      const records=await entries();
      if (!records.length) return {schemaVersion:1,kind:'worker-recovery',applied:apply,workers:[]};
      const engine=JSON.parse(await docker(['info','--format','{{json .}}']));
      if (engine.OSType!=='linux' || records.some(record=>record.engineId!==engine.ID)) throw new Error('Recovery Docker engine identity mismatch');
      const lookup=async record=>{
        const listed=await docker(['ps','--all','--no-trunc','--filter',`name=^/${record.name}$`,'--format','{{.ID}}']);
        if (!listed) return null;
        if (!containerId.test(listed)) throw new Error('Ambiguous worker lookup');
        const items=JSON.parse(await docker(['inspect',listed]));
        if (!Array.isArray(items)||items.length!==1) throw new Error('Invalid recovery inspection');
        verifyOwnedWorker(items[0],record,listed);return items[0];
      };
      // Validate the entire plan before making any destructive change.
      const plans=[];
      for (const record of records) plans.push({record,worker:await lookup(record)});
      const workers=[];
      for (const {record,worker} of plans) {
        const summary={jobId:record.jobId,name:record.name,status:worker?'owned':'absent',...(worker?{containerId:worker.Id,running:worker.State.Running,oomKilled:worker.State.OOMKilled}:{})};
        if (apply) {
          const current=await lookup(record);
          if (worker && current && current.Id!==worker.Id || !worker && current) throw new Error('Worker changed after recovery plan');
          if (current) {
            await docker(['rm','--force',current.Id]);
            const remains=await docker(['ps','--all','--no-trunc','--filter',`id=${current.Id}`,'--format','{{.ID}}']);
            if (remains) throw new Error('Worker removal could not be confirmed');
          }
          await unlink(join(directory,record.jobId+'.json'));pending.delete(record.jobId);
          summary.status=worker?'removed':'cleared';
        }
        workers.push(summary);
      }
      return {schemaVersion:1,kind:'worker-recovery',applied:apply,workers};
    }
  };
}
