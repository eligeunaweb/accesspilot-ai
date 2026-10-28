import {open,lstat,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {jobIdPattern,jobRequestError} from './web-job-request.js';
const digest=/^[a-f0-9]{64}$/;
const terminal=new Set(['succeeded','failed','cancelled','interrupted']);
const states=new Set(['admitted','running','cancelling',...terminal]);
function validate(row) {
  if(!row||Object.keys(row).sort().join()!=='fingerprint,id,owner,projectId,request,state'||!jobIdPattern.test(row.id)||!['owner','request','projectId','fingerprint'].every(key=>typeof row[key]==='string'&&digest.test(row[key]))||!states.has(row.state))throw new Error('Invalid web admission journal');
}
// Caller must own this directory's exclusive queue lock. Never stores runnable payloads.
export async function createWebAdmissionStore(directory) {
  const path=join(directory,'web-admissions.json');let records=[];
  try {
    const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024)throw new Error('Invalid web admission journal');
    const file=await open(path,'r');let data;
    try {
      const actual=await file.stat();if(!actual.isFile()||actual.size>128*1024)throw new Error('Invalid web admission journal');
      const buffer=Buffer.alloc(128*1024+1);let size=0;
      while(size<buffer.length){const {bytesRead}=await file.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
      if(size>128*1024)throw new Error('Invalid web admission journal');data=JSON.parse(buffer.subarray(0,size).toString('utf8'));
    } finally {await file.close();}
    if(!data||Object.keys(data).sort().join()!=='records,schemaVersion'||data.schemaVersion!==1||!Array.isArray(data.records)||data.records.length>128)throw new Error('Invalid web admission journal');
    const ids=new Set(),keys=new Set();
    for(const row of data.records){validate(row);const key=row.owner+row.request;if(ids.has(row.id)||keys.has(key))throw new Error('Duplicate web admission');ids.add(row.id);keys.add(key);}
    records=data.records.map(row=>({...row,state:terminal.has(row.state)?row.state:'interrupted'}));
  } catch(error){if(error.code!=='ENOENT')throw error;}
  async function write(next) {
    const pending=join(directory,'.web-admissions-'+randomUUID()+'.tmp');let file;
    try{file=await open(pending,'wx',0o600);await file.writeFile(JSON.stringify({schemaVersion:1,records:next}));await file.sync();await file.close();file=null;await rename(pending,path);records=next;}
    finally{if(file)await file.close();await unlink(pending).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  await write(records);let serial=Promise.resolve(),failed=false;
  function change(operation) {
    const task=serial.then(async()=>{if(failed)throw jobRequestError(503);const result=operation(structuredClone(records));if(result.next)await write(result.next);return structuredClone(result.row);});
    serial=task.catch(error=>{if(![409,429].includes(error.status))failed=true;});return task;
  }
  return {
    snapshot:()=>structuredClone(records),
    get:id=>structuredClone(records.find(row=>row.id===id)),
    admit(row) {
      validate(row);if(row.state!=='admitted')throw jobRequestError(409);
      return change(next=>{
        const found=next.find(item=>item.owner===row.owner&&item.request===row.request);
        if(found){if(found.projectId!==row.projectId||found.fingerprint!==row.fingerprint)throw jobRequestError(409);return {row:found};}
        if(next.some(item=>item.id===row.id))throw jobRequestError(409);
        if(next.length>=128)throw jobRequestError(429);
        next.push({...row});return {next,row};
      });
    },
    update(id,state) {
      return change(next=>{
        const row=next.find(item=>item.id===id);if(!row||!states.has(state)||terminal.has(row.state)&&row.state!==state)throw jobRequestError(409);
        if(row.state==='admitted'&&!['admitted','running','cancelled','failed','interrupted'].includes(state))throw jobRequestError(409);
        if(row.state==='running'&&!['running','cancelling','succeeded','failed','cancelled','interrupted'].includes(state))throw jobRequestError(409);
        if(row.state==='cancelling'&&!['cancelling','cancelled','interrupted'].includes(state))throw jobRequestError(409);
        row.state=state;return {next,row};
      });
    },
    flush:()=>serial
  };
}
