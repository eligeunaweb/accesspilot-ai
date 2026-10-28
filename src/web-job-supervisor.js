import {resolve} from 'node:path';
import {validateWorkspace} from './workspace.js';
import {validateSessionState} from './session.js';
import {immutableImage} from './isolation.js';
import {projectKey,saveHistory} from './history.js';
import {auditProject} from './runner.js';
import {auditPageInDocker} from './docker-audit.js';
import {createAuditQueue} from './audit-queue.js';
import {createWebJobContract} from './web-job-contract.js';
import {createWebAdmissionStore} from './web-admission-store.js';
import {jobRequestError} from './web-job-request.js';

// Trusted local supervisor, not a listener. Only the fixed contained page backend is used by default.
export async function createWebJobSupervisor({workspace:input,origin,directory,resourceDirectory,historyRoot,imageId:requestedImage,sessionStates={},maxProjects=2}, {auditPage=auditPageInDocker}={}) {
  if(![directory,resourceDirectory,historyRoot].every(value=>typeof value==='string'&&value.trim())||new Set([directory,resourceDirectory,historyRoot].map(value=>resolve(value))).size!==3||!Number.isSafeInteger(maxProjects)||maxProjects<1||maxProjects>2)throw jobRequestError();
  const imageId=immutableImage(requestedImage),workspace=validateWorkspace(structuredClone(input));
  const contract=createWebJobContract({workspace,origin}),sessions=new Map(),projects=new Map(workspace.projects.map(p=>[projectKey(p),p]));
  if(!sessionStates||typeof sessionStates!=='object'||Array.isArray(sessionStates))throw jobRequestError();
  for(const [id,state] of Object.entries(sessionStates)){if(!projects.has(id)||!projects.get(id).authentication)throw jobRequestError();sessions.set(id,validateSessionState(structuredClone(state),projects.get(id)));}
  for(const [id,project] of projects)if(project.authentication&&!sessions.has(id))throw jobRequestError();
  const queue=await createAuditQueue({directory,resourceDirectory,maxQueued:100});let store;
  try{store=await createWebAdmissionStore(resolve(directory));}catch{await queue.close();throw jobRequestError(503);}
  const tickets=new Map(),waiting=[];let active=0,closed=false,fatal=false,closing;
  const current=id=>contract.describe(id).receipt;
  const visible=id=>{const row=store.get(id);return row?{id:row.id,projectId:row.projectId,state:row.state==='admitted'?'requested':row.state}:current(id);};
  function finish(ticket){if(!ticket.finished){ticket.finished=true;ticket.resolve(visible(ticket.id));}}
  function stop(){fatal=true;contract.close();}
  async function retire(ticket) {
    try{await store.update(ticket.id,'cancelled');}catch{stop();}finally{finish(ticket);}
  }
  function pump() {
    if(closed||fatal){for(const ticket of waiting.splice(0))void retire(ticket);return;}
    while(active<maxProjects&&waiting.length) {
      const ticket=waiting.shift();
      if(ticket.descriptor.signal.aborted){void retire(ticket);continue;}
      active++;void execute(ticket);
    }
  }
  async function execute(ticket) {
    try {
      const execution=contract.take(ticket.id);await store.update(ticket.id,'running');
      const run=await auditProject(execution.project,{signal:execution.signal,sessionState:sessions.get(ticket.projectId),
        audit:(url,options)=>queue.submit((signal,{workerLifecycle})=>auditPage(url,{...options,signal,imageId},{lifecycle:workerLifecycle}),{signal:options.signal})});
      const clean=!queue.snapshot().failed;
      if(clean)await saveHistory(historyRoot,run);
      const outcome=run.totals.failed||run.totals.cancelled?'failed':'succeeded';
      const final=contract.settle(ticket.id,{outcome,cleanupVerified:clean});
      await store.update(ticket.id,final.state);if(!clean)stop();
    } catch {
      try {
        const state=current(ticket.id).state;let final;
        if(['running','cancelling'].includes(state))final=contract.settle(ticket.id,{outcome:'failed',cleanupVerified:!queue.snapshot().failed});
        else if(state==='requested')final=contract.failAdmission(ticket.id);
        else final=current(ticket.id);
        await store.update(ticket.id,final.state);
        if(queue.snapshot().failed)stop();
      } catch {stop();}
    } finally {active--;finish(ticket);pump();}
  }
  return {
    projects:()=>contract.projects(),openSession:()=>contract.openSession(),authorize:(req,action)=>contract.authorize(req,action),
    async submit(permit,body) {
      const receipt=contract.submit(permit,body);let ticket=tickets.get(receipt.id);
      if(!ticket) {
        const descriptor=contract.describe(receipt.id);let done;
        ticket={id:receipt.id,projectId:receipt.projectId,descriptor,done:new Promise(resolve=>done=resolve),resolve:value=>done(value),finished:false};tickets.set(receipt.id,ticket);
        ticket.admission=(async()=>{
          try {
            const saved=await store.admit({id:receipt.id,projectId:receipt.projectId,owner:descriptor.owner,request:descriptor.request,fingerprint:descriptor.fingerprint,state:'admitted'});
            if(saved.id!==receipt.id)throw jobRequestError(409);
            if(closed||fatal||descriptor.signal.aborted)await retire(ticket);else {waiting.push(ticket);pump();}
          } catch(error) {
            try{if(current(ticket.id).state==='requested')contract.failAdmission(ticket.id);}catch{}
            if(![409,429].includes(error.status))stop();finish(ticket);throw jobRequestError(error.status??503);
          }
        })();
        ticket.admission.catch(()=>{});
      }
      await ticket.admission;return visible(ticket.id);
    },
    status(permit,id){contract.status(permit,id);return visible(id);},
    async cancel(permit,body) {
      const receipt=contract.cancel(permit,body),ticket=tickets.get(receipt.id);
      await ticket.admission;
      try{await store.update(receipt.id,current(receipt.id).state);}catch(error){
        if(error.status!==409||!['succeeded','failed','cancelled','interrupted'].includes(store.get(receipt.id)?.state)){stop();throw jobRequestError(503);}
      }
      if(current(receipt.id).state==='cancelled') {const index=waiting.indexOf(ticket);if(index>=0)waiting.splice(index,1);finish(ticket);}
      pump();return visible(receipt.id);
    },
    revokeSession(credentials){contract.revokeSession(credentials);pump();},
    endSession(permit,body){const result=contract.endSession(permit,body);pump();return result;},
    inspect(){return {closed,failed:fatal,activeProjects:active,admissions:store.snapshot(),queue:queue.snapshot()};},
    wait(id){const ticket=tickets.get(id);if(!ticket)throw jobRequestError(404);return ticket.done;},
    close() {
      if(closing)return closing;
      closed=true;contract.close();
      closing=(async()=>{
        await Promise.allSettled([...tickets.values()].map(ticket=>ticket.admission));pump();
        await Promise.all([...tickets.values()].map(ticket=>ticket.done));await store.flush();
        await queue.close();if(fatal)throw jobRequestError(503);
      })();return closing;
    }
  };
}
