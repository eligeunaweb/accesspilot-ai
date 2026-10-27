import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {JsonLines,fields,send} from './worker-protocol.js';
import {validateJob} from './worker-job.js';
import {immutableImage,validateIsolation} from './isolation.js';
import {validateSnapshot} from './comparison.js';
import {createRequestMediator} from './request-mediator.js';
import {messages} from './i18n.js';

const run=promisify(execFile),seccompPath=fileURLToPath(new URL('../worker/seccomp-profile.json',import.meta.url));
const seccompHash='6608d052c6b359c09b33be7b8f611dc3be09893d5e6f6a20248f83acb330883e';
export function workerArguments(imageId,name,owner,{apparmor=false}={}) {
  immutableImage(imageId);
  if(!/^accesspilot-worker-[a-f0-9-]{36}$/.test(name)||!/^[a-f0-9-]{36}$/.test(owner))throw new Error('Invalid worker ownership');
  return ['create','--pull','never','--name',name,'--label',`org.accesspilot.worker=${owner}`,'--interactive','--init','--network','none',
    '--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--security-opt',`seccomp=${seccompPath}`,
    ...(apparmor?['--security-opt','apparmor=accesspilot-worker']:[]),'--user','65534:65534','--pids-limit','256','--memory','1g','--memory-swap','1g',
    '--cpus','1','--ipc','private','--shm-size','256m','--cgroupns','private','--log-driver','none',
    '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=536870912,mode=1777','--env','HOME=/tmp','--env','NODE_OPTIONS=','--env','NODE_PATH=',
    '--entrypoint','node',imageId,'/app/worker/entry.js'];
}
export function verifyWorker(container,imageId,owner,profile,{apparmor=false}={}) {
  const h=container.HostConfig,c=container.Config;
  const security=h?.SecurityOpt??[],seccomp=security.find(value=>value.startsWith('seccomp='));
  if(!c||!h||c.Image!==imageId||c.Labels?.['org.accesspilot.worker']!==owner||c.User!=='65534:65534'||c.Tty!==false||c.OpenStdin!==true||JSON.stringify(c.Entrypoint)!=='["node"]'||JSON.stringify(c.Cmd)!=='["/app/worker/entry.js"]'||
    h.NetworkMode!=='none'||h.ReadonlyRootfs!==true||h.Privileged!==false||h.Memory!==1073741824||h.MemorySwap!==1073741824||h.NanoCpus!==1000000000||h.PidsLimit!==256||
    h.IpcMode!=='private'||h.ShmSize!==268435456||h.CgroupnsMode!=='private'||h.Init!==true||h.LogConfig?.Type!=='none'||
    h.CapDrop?.length!==1||h.CapDrop[0]!=='ALL'||security.length!==(apparmor?3:2)||!security.some(value=>['no-new-privileges','no-new-privileges=true'].includes(value))||
    !seccomp||JSON.stringify(JSON.parse(seccomp.slice(8)))!==JSON.stringify(profile)||apparmor&&(!security.includes('apparmor=accesspilot-worker')||container.AppArmorProfile!=='accesspilot-worker')||
    h.Binds?.length||container.Mounts?.length||h.CapAdd?.length||h.Devices?.length||h.DeviceRequests?.length||h.PortBindings&&Object.keys(h.PortBindings).length||h.PidMode||h.UTSMode)throw new Error('Worker inspection did not match required profile');
  if(h.Tmpfs?.['/tmp']!=='rw,noexec,nosuid,nodev,size=536870912,mode=1777'||Object.keys(h.Tmpfs).length!==1)throw new Error('Unexpected worker filesystem');
}
function reportFromWorker(report,job,imageId,mediator) {
  if(report?.network?.policyVersion!==3)throw new Error('Missing mediated network evidence');
  const isolation=validateIsolation({backend:'docker-stdio',profileVersion:1,imageId,chromiumSandbox:true});
  const profile={...(job.viewport?{viewport:job.viewport}:{}),...(job.journey?{journey:job.journey}:{})};
  const project={schemaVersion:1,name:'Isolated worker',urls:[job.url],network:job.network,language:job.language,
    ...(job.viewport?{viewports:[job.viewport]}:{}),...(job.journey?{journeys:[job.journey]}:{}),...(job.authentication?{authentication:job.authentication}:{})};
  const snapshot=validateSnapshot({schemaVersion:1,kind:'project-audit',historyVersion:2,generatedAt:report.generatedAt,tool:report.tool,version:report.version,project,
    pages:[{url:job.url,status:'succeeded',...profile,report:{...report,isolation}}]});
  const result={...snapshot.pages[0].report,generatedAt:snapshot.generatedAt,tool:snapshot.tool,version:snapshot.version,disclaimer:messages[job.language].disclaimer,
    network:{policyVersion:3,requests:mediator.requests,transferBytes:mediator.bytes}};
  if(job.crawl) {
    const discovery=report.discovery;fields(discovery,['links','truncated']);
    if(!Array.isArray(discovery.links)||discovery.links.length>job.crawl.maxLinksPerPage||discovery.links.some(link=>typeof link!=='string'||link.length>8192)||typeof discovery.truncated!=='boolean')throw new Error('Invalid worker discovery');
    result.discovery=discovery;
  }
  return result;
}

// Internal opt-in API. Docker is never auto-installed or pulled, and the existing CLI is unchanged.
export async function auditPageInDocker(url,{imageId,signal,...options}={}, {execute=run,spawnWorker=spawn}={}) {
  immutableImage(imageId);const job=validateJob({url,...options});signal?.throwIfAborted();
  const profileSource=await readFile(seccompPath);if(createHash('sha256').update(profileSource).digest('hex')!==seccompHash)throw new Error('Worker seccomp profile changed');
  const profile=JSON.parse(profileSource),owner=randomUUID(),name=`accesspilot-worker-${randomUUID()}`,controller=new AbortController();
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(cancel,job.timeoutMs+30000);
  let created=false,cleanupFailed=false,containerId,child,mediator,result,failure;
  const docker=async args=>(await execute('docker',args,{timeout:30000,maxBuffer:256*1024,windowsHide:true,shell:false})).stdout.trim();
  try {
    const info=JSON.parse(await docker(['info','--format','{{json .}}']));controller.signal.throwIfAborted();
    if(info.OSType!=='linux')throw new Error('Linux Docker engine required');
    const apparmor=info.SecurityOptions?.some(value=>value==='name=apparmor')??false;
    created=true;containerId=await docker(workerArguments(imageId,name,owner,{apparmor}));
    if(!/^[a-f0-9]{64}$/.test(containerId))throw new Error('Invalid worker container ID');
    controller.signal.throwIfAborted();
    const inspection=JSON.parse(await docker(['inspect',containerId]));if(inspection.length!==1)throw new Error('Invalid worker inspection');
    verifyWorker(inspection[0],imageId,owner,profile,{apparmor});controller.signal.throwIfAborted();
    mediator=createRequestMediator(job.scopeUrls,job.network,{signal:controller.signal,maxDurationMs:job.timeoutMs+Math.min(30000,120000-job.timeoutMs),
      timeoutMs:Math.min(job.timeoutMs,10000),maxRequests:job.crawl?.maxRequestsPerPage,maxBytes:job.crawl?.maxBytesPerPage,maxRedirects:job.crawl?.maxRedirects});
    await new Promise((resolve,reject)=>{
      let phase='ready',lastId=0,inFlight=0,stderrBytes=0,accepted,settled=false;
      const stop=error=>{if(settled)return;settled=true;reject(error);};
      const aborted=()=>stop(new Error('Contained audit cancelled or timed out'));
      child=spawnWorker('docker',['start','--attach','--interactive',containerId],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
      const reader=new JsonLines(value=>{
        if(settled)throw new Error('Worker channel finished');
        if(value?.type==='ready') {
          fields(value,['type','proof']);if(phase!=='ready')throw new Error('Duplicate worker readiness');
          fields(value.proof,['profileVersion','uid','networkNone','seccomp','noNewPrivileges','kernelLimits','directTcpUdpDenied','readOnly','noExecTmp','parentChrootDenied']);
          if(value.proof.profileVersion!==1||value.proof.uid!==65534||Object.entries(value.proof).some(([key,item])=>!['profileVersion','uid'].includes(key)&&item!==true))throw new Error('Invalid worker proof');
          if(Object.keys(value.proof).length!==10)throw new Error('Incomplete worker proof');
          phase='sandbox';send(child.stdin,{type:'start',job}).catch(stop);return;
        }
        if(value?.type==='sandbox') {
          fields(value,['type','namespace','seccomp','directDenied']);if(phase!=='sandbox'||value.namespace!==true||value.seccomp!==true||value.directDenied!==true)throw new Error('Invalid browser sandbox proof');phase='audit';return;
        }
        if(value?.type==='request') {
          fields(value,['type','id','request']);if(phase!=='audit'||value.id!==lastId+1||++lastId>1000||inFlight>=68)throw new Error('Invalid worker request sequence');
          inFlight++;mediator.fetch(value.request).then(response=>send(child.stdin,{type:'response',id:value.id,response})).then(()=>inFlight--).catch(stop);return;
        }
        if(value?.type==='result') {
          fields(value,['type','report']);if(phase!=='audit'||inFlight||mediator.failed)throw new Error('Worker result before transport completed');
          accepted=reportFromWorker(value.report,job,imageId,mediator);phase='finished';child.stdin.end();return;
        }
        if(value?.type==='error') {
          fields(value,['type','code','message','startupDiagnostic','guardDiagnostic']);
          if(!['guard-failed','sandbox-failed','audit-failed'].includes(value.code))throw new Error('Invalid worker failure');
          if(value.startupDiagnostic!==undefined&&(phase!=='sandbox'||value.code!=='sandbox-failed'||typeof value.startupDiagnostic!=='string'||value.startupDiagnostic.length>4100))throw new Error('Invalid startup diagnostic');
          if(value.guardDiagnostic!==undefined&&(phase!=='ready'||value.code!=='guard-failed'||typeof value.guardDiagnostic!=='string'||value.guardDiagnostic.length>2000))throw new Error('Invalid guard diagnostic');
          throw new Error('Worker rejected execution: '+value.code+(value.guardDiagnostic?' / '+value.guardDiagnostic:'')+(value.startupDiagnostic?' / '+value.startupDiagnostic:''));
        }
        throw new Error('Contained worker sent an unknown message');
      });
      child.stdin.on('error',stop);child.on('error',stop);
      child.stdout.on('data',chunk=>{try{reader.push(chunk);}catch(error){stop(error);}});
      // Diagnostics may contain page/session data. Count and discard, never include them in errors or Docker logs.
      child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;if(stderrBytes>65536)stop(new Error('Worker diagnostic budget exceeded'));});
      controller.signal.addEventListener('abort',aborted,{once:true});if(controller.signal.aborted)aborted();
      child.once('close',code=>{
        controller.signal.removeEventListener('abort',aborted);if(settled)return;
        try {reader.end();if(code!==0||phase!=='finished'||!accepted||mediator.failed)throw new Error('Worker did not complete');settled=true;result=accepted;resolve();}
        catch(error){stop(error);}
      });
    });
    const finished=JSON.parse(await docker(['inspect',containerId]))[0];
    if(finished.State?.Running!==false||finished.State.ExitCode!==0||finished.State.OOMKilled!==false)throw new Error('Worker exit/OOM state failed');
  } catch(error) {failure=error;}
  finally {
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();mediator?.close();child?.kill();
    if(created) {
      try {
        const owned=JSON.parse(await docker(['inspect',name]));
        if(owned.length!==1||owned[0].Config?.Labels?.['org.accesspilot.worker']!==owner||!/^[a-f0-9]{64}$/.test(owned[0].Id))throw new Error('Worker cleanup ownership unverified');
        await docker(['rm','--force','--volumes',owned[0].Id]);
      } catch {cleanupFailed=true;failure=new Error('Contained audit failed: owned container cleanup could not be verified');}
    }
  }
  if(failure)throw new Error('Contained audit failed; verify Docker profile, browser sandbox, scope, deadline and owned cleanup'+(cleanupFailed?'; inspect '+name:''),{cause:failure});
  return result;
}
