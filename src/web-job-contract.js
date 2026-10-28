import {randomBytes,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {validateWorkspace} from './workspace.js';
import {projectKey} from './history.js';
import {checkJobEnvelope,equalSecret,jobIdPattern,jobRequestError,parseWebJobCommand,validateJobOrigin} from './web-job-request.js';

// Internal admission model only. No HTTP listener, audit runner, Docker or filesystem writes.
export function createWebJobContract({workspace:input,origin,maxOutstanding=8,maxRecords=128,maxSessions=16,sessionMs=3600000}, {now=()=>performance.now()}={}) {
  validateJobOrigin(origin);
  for(const [value,max] of [[maxOutstanding,8],[maxRecords,128],[maxSessions,16],[sessionMs,3600000]])if(!Number.isSafeInteger(value)||value<1||value>max)throw jobRequestError();
  if(maxRecords<maxOutstanding)throw jobRequestError();
  const workspace=validateWorkspace(structuredClone(input));
  const projects=new Map(workspace.projects.map(p=>[projectKey(p),p]));
  const sessions=new Set(),permits=new WeakMap(),jobs=new Map();let closed=false,failed=false;
  const live=()=>[...jobs.values()].filter(j=>!['succeeded','failed','cancelled'].includes(j.state)).length;
  const view=j=>({id:j.id,projectId:j.projectId,state:j.state});
  function revoke(session) {
    sessions.delete(session);
    for(const job of jobs.values())if(job.owner===session&&!['succeeded','failed','cancelled'].includes(job.state)) {
      job.controller.abort();if(job.state==='requested')job.state='cancelled';else if(job.state==='running')job.state='cancelling';
    }
  }
  function sweep(){for(const s of sessions)if(now()>=s.expires)revoke(s);}
  function consume(permit,action) {
    sweep();const p=permits.get(permit);permits.delete(permit);
    if(closed||!p||p.action!==action||!sessions.has(p.session))throw jobRequestError(403);
    return p;
  }
  function owned(session,id) {
    if(typeof id!=='string'||!jobIdPattern.test(id))throw jobRequestError(404);
    const job=jobs.get(id);if(!job||job.owner!==session)throw jobRequestError(404);return job;
  }
  return {
    projects(){return workspace.projects.map(p=>({id:projectKey(p),name:p.name}));},
    openSession() {
      sweep();if(closed||failed||sessions.size>=maxSessions)throw jobRequestError(503);
      const session={token:randomBytes(32).toString('hex'),csrf:randomBytes(32).toString('hex'),expires:now()+sessionMs};sessions.add(session);
      return {token:session.token,csrf:session.csrf};
    },
    authorize(req,action) {
      sweep();if(closed)throw jobRequestError(403);
      const bytes=checkJobEnvelope(req,origin,action),authorization=req.headers.authorization;
      if(typeof authorization!=='string'||!/^Bearer [a-f0-9]{64}$/.test(authorization))throw jobRequestError(403);
      let session;for(const s of sessions)if(equalSecret(authorization.slice(7),s.token))session=s;
      if(!session||action!=='status'&&!equalSecret(req.headers['x-accesspilot-csrf'],session.csrf))throw jobRequestError(403);
      const permit=Object.freeze({});permits.set(permit,{session,action,bytes});return permit;
    },
    submit(permit,body) {
      const p=consume(permit,'create'),command=parseWebJobCommand(body,'create',p.bytes);
      if(failed)throw jobRequestError(503);
      if(!projects.has(command.projectId))throw jobRequestError(404);
      const existing=[...jobs.values()].find(j=>j.owner===p.session&&j.requestId===command.requestId);
      if(existing){if(existing.projectId!==command.projectId)throw jobRequestError(409);return view(existing);}
      if(live()>=maxOutstanding||jobs.size>=maxRecords)throw jobRequestError(429);
      const job={id:randomUUID(),projectId:command.projectId,requestId:command.requestId,owner:p.session,state:'requested',controller:new AbortController()};jobs.set(job.id,job);return view(job);
    },
    status(permit,id){const p=consume(permit,'status');return view(owned(p.session,id));},
    cancel(permit,body) {
      const p=consume(permit,'cancel'),command=parseWebJobCommand(body,'cancel',p.bytes),job=owned(p.session,command.jobId);
      if(job.state==='requested'){job.state='cancelled';job.controller.abort();}
      else if(job.state==='running'){job.state='cancelling';job.controller.abort();}
      return view(job);
    },
    // Trusted future adapter methods. Never expose through request bodies or RPC dispatch.
    take(id) {
      sweep();const job=jobs.get(id);if(closed||failed||!job||job.state!=='requested')throw jobRequestError(409);
      job.state='running';return {project:structuredClone(projects.get(job.projectId)),signal:job.controller.signal};
    },
    settle(id,{outcome,cleanupVerified}={}) {
      const job=jobs.get(id);
      if(!job||!['running','cancelling'].includes(job.state)||!['succeeded','failed'].includes(outcome)||typeof cleanupVerified!=='boolean')throw jobRequestError(409);
      if(!cleanupVerified){job.state='interrupted';failed=true;for(const s of [...sessions])revoke(s);return view(job);}
      job.state=job.controller.signal.aborted?'cancelled':outcome;return view(job);
    },
    revokeSession(credentials){for(const s of sessions)if(equalSecret(credentials?.token,s.token))revoke(s);},
    close(){closed=true;for(const s of [...sessions])revoke(s);},
    snapshot(){sweep();return {closed,failed,outstanding:live(),records:jobs.size,sessions:sessions.size};}
  };
}
