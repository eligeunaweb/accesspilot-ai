import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {workerArguments,verifyWorker,auditPageInDocker} from '../src/docker-audit.js';
import {validateJob} from '../src/worker-job.js';
import {immutableImage,validateIsolation} from '../src/isolation.js';
import {JsonLines} from '../src/worker-protocol.js';
import {parse} from '../src/args.js';
import {summarize} from '../src/report.js';
import {compareAudits,validateSnapshot} from '../src/comparison.js';

const imageId='sha256:'+'a'.repeat(64),id='b'.repeat(64),profile=JSON.parse(await readFile(new URL('../worker/seccomp-profile.json',import.meta.url)));
function container(owner) {
  return {Id:id,Config:{Image:imageId,User:'65534:65534',OpenStdin:true,Tty:false,Env:['NODE_OPTIONS=','NODE_PATH=','HTTP_PROXY=','HTTPS_PROXY=','ALL_PROXY=','NO_PROXY=','http_proxy=','https_proxy=','all_proxy=','no_proxy='],Entrypoint:['node'],Cmd:['/app/worker/entry.js'],Labels:{'org.accesspilot.worker':owner}},HostConfig:{
    NetworkMode:'none',ReadonlyRootfs:true,Privileged:false,Memory:1073741824,MemorySwap:1073741824,NanoCpus:1000000000,PidsLimit:256,IpcMode:'private',ShmSize:268435456,CgroupnsMode:'private',Init:true,
    LogConfig:{Type:'none'},CapDrop:['ALL'],SecurityOpt:['no-new-privileges','seccomp='+JSON.stringify(profile)],Tmpfs:{'/tmp':'rw,noexec,nosuid,nodev,size=536870912,mode=1777'}},State:{Running:false,ExitCode:0,OOMKilled:false}};
}
test('worker arguments contain strict profile and exclude mounts, ports, shell and disabled sandbox',()=>{
  const args=workerArguments(imageId,'accesspilot-worker-'+randomUUID(),randomUUID());
  assert.equal(args[0],'create');assert.ok(args.includes('none'));assert.ok(args.includes('65534:65534'));assert.ok(args.includes('no-new-privileges'));
  assert.ok(!args.some(value=>['--privileged','--publish','--mount','--volume','--no-sandbox','--ipc=host'].includes(value)));
  assert.deepEqual(args.slice(-2),[imageId,'/app/worker/entry.js']);
  for(const value of ['node:latest','sha256:bad','--privileged'])assert.throws(()=>immutableImage(value));
});
test('inspection fails closed for altered security, network, entrypoint, resources and logging',()=>{
  const owner=randomUUID();verifyWorker(container(owner),imageId,owner,profile);
  for(const change of [c=>c.HostConfig.NetworkMode='host',c=>c.HostConfig.ReadonlyRootfs=false,c=>c.HostConfig.LogConfig.Type='json-file',c=>c.HostConfig.SecurityOpt=['seccomp=unconfined'],c=>c.Config.User='0',c=>c.Config.Entrypoint=['sh'],c=>c.HostConfig.PidsLimit=0,c=>c.HostConfig.MemorySwap=-1,c=>c.Mounts=[{Source:'/host'}]]) {
    const c=container(owner);change(c);assert.throws(()=>verifyWorker(c,imageId,owner,profile));
  }
});
test('worker job rejects arbitrary code, secrets without authentication, unsupported budgets and invalid targets',()=>{
  assert.equal(validateJob({url:'https://example.org'}).network.allowPrivateOrigins.length,0);
  for(const options of [{launch:'code'},{crawl:null},{viewport:null},{journey:null},{authentication:null},{network:null},{scopeUrls:null},{sessionState:{}},{crawl:{maxBytesPerPage:32*1024*1024}},{timeoutMs:1},{scopeUrls:['https://other.org']}])assert.throws(()=>validateJob({url:'https://example.org',...options}));
});
test('Docker option is restricted to project audits and immutable local image IDs',()=>{
  assert.equal(parse(['--project','p.json','--isolation-image',imageId])['isolation-image'],imageId);
  for(const args of [['https://example.org'],['--project','p.json','--history','h','--serve-history'],['--project','p.json','--review-template','r.json']])assert.throws(()=>parse([...args,'--isolation-image',imageId]));
  assert.throws(()=>parse(['--project','p.json','--isolation-image','worker:latest']));
});
test('isolation provenance survives canonical validation and changed images never count as improvements',()=>{
  const isolation=validateIsolation({backend:'docker-stdio',profileVersion:1,imageId,chromiumSandbox:true});
  const report=summarize({violations:[],passes:[],incomplete:[],inapplicable:[],testEngine:{name:'axe-core',version:'4.14.0'}},'https://example.org/');
  report.network={policyVersion:3};report.isolation=isolation;
  const snapshot={schemaVersion:1,kind:'project-audit',project:{schemaVersion:1,name:'Fixture',urls:['https://example.org/'],network:{}},pages:[{url:'https://example.org/',status:'succeeded',report}]};
  assert.deepEqual(validateSnapshot(snapshot).pages[0].report.isolation,isolation);
  const next=structuredClone(snapshot);next.pages[0].report.isolation.imageId='sha256:'+'c'.repeat(64);
  assert.equal(compareAudits(snapshot,next).pages[0].reason,'isolation-changed');
  delete next.pages[0].report.isolation;assert.throws(()=>validateSnapshot(next));
});
test('pre-cancelled worker never invokes Docker',async()=>{
  const controller=new AbortController();controller.abort();await assert.rejects(auditPageInDocker('https://example.org',{imageId,signal:controller.signal},{execute:()=>assert.fail('must not execute')}));
});

async function supervisorFixture(mode,{lifecycle}={}) {
  let owner,removed=false,spawned=false;
  const execute=async(command,args)=>{
    if(args[0]==='info')return {stdout:JSON.stringify({ID:'fixture-engine',OSType:'linux',SecurityOptions:[]})};
    if(args[0]==='create'){owner=args[args.indexOf('--label')+1].split('=')[1];return {stdout:id};}
    if(args[0]==='inspect') {const c=container(owner);if(mode==='inspection')c.HostConfig.NetworkMode='host';if(mode==='oom')c.State.OOMKilled=true;if(mode==='cleanup'&&args[1].startsWith('accesspilot-worker-'))c.Config.Labels['org.accesspilot.worker']='someone-else';return {stdout:JSON.stringify([c])};}
    if(args[0]==='rm'){assert.equal(args.at(-1),id);removed=true;return {stdout:id};}
    throw new Error('Unexpected Docker command');
  };
  const spawnWorker=()=>{
    spawned=true;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
    const emit=value=>child.stdout.write(JSON.stringify(value)+'\n');
    const reader=new JsonLines(value=>{
      if(value.type==='start') {
        if(mode==='sequence')emit({type:'result',report:{}});
        else {
          emit({type:'sandbox',namespace:true,pidNamespace:true,networkNamespace:true,seccomp:true,tsync:true,directDenied:true});
          const report=summarize({violations:[],passes:[],incomplete:[],inapplicable:[],testEngine:{name:'axe-core',version:'4.14.0'}},value.job.url);report.network={policyVersion:3};
          emit({type:'result',report});setImmediate(()=>{child.stdout.end();child.emit('close',0);});
        }
      }
    });
    child.stdin=new Writable({write(chunk,encoding,callback){try{reader.push(chunk);callback();}catch(error){callback(error);}}});
    setImmediate(()=>emit({type:'ready',proof:{profileVersion:1,uid:65534,networkNone:true,seccomp:true,noNewPrivileges:true,kernelLimits:true,directTcpUdpDenied:true,readOnly:true,noExecTmp:true,parentChrootDenied:true}}));
    return child;
  };
  let result;
  if(mode==='success')result=await auditPageInDocker('https://example.org',{imageId},{execute,spawnWorker,lifecycle});
  else await assert.rejects(auditPageInDocker('https://example.org',{imageId},{execute,spawnWorker}),/Contained audit failed/);
  assert.equal(removed,mode!=='cleanup');assert.equal(spawned,mode!=='inspection');return result;
}
for(const mode of ['success','inspection','sequence','cleanup','oom'])test(`mocked supervisor ${mode} checks completion and owned cleanup (not Docker evidence)`,async()=>{
  const result=await supervisorFixture(mode);if(result)assert.equal(result.isolation.imageId,imageId);
});


test('worker inspection rejects injected proxy credentials or Node startup hooks without echoing secrets',()=>{
  const owner=randomUUID();for(const [name,value] of [['HTTP_PROXY','https://user:fixture-secret@proxy.invalid'],['NODE_OPTIONS','--import=/host/hook.js']]) {
    const c=container(owner);c.Config.Env=c.Config.Env.filter(item=>!item.startsWith(name+'=')).concat(name+'='+value);
    assert.throws(()=>verifyWorker(c,imageId,owner,profile),error=>!error.message.includes('fixture-secret')&&/environment/.test(error.message));
  }
});

test('trusted lifecycle reserves before start and releases after verified cleanup',async()=>{
  let reserved=false,released=false;
  await supervisorFixture('success',{lifecycle:{
    reserve:async claim=>{assert.equal(claim.engineId,'fixture-engine');assert.equal(claim.imageId,imageId);assert.match(claim.name,/^accesspilot-worker-/);reserved=true;},
    release:async()=>{assert.equal(reserved,true);released=true;}
  }});
  assert.equal(released,true);
});

test('failed durable reserve never creates a container and signals unsafe lifecycle',async()=>{
  const calls=[];
  await assert.rejects(auditPageInDocker('https://example.org',{imageId},{
    execute:async(_command,args)=>{calls.push(args[0]);assert.equal(args[0],'info');return {stdout:JSON.stringify({ID:'fixture-engine',OSType:'linux'})};},
    lifecycle:{reserve:async()=>{throw new Error('disk failure');},release:()=>assert.fail('failed intent released')}
  }),error=>error.code==='ACCESSPILOT_CLEANUP_UNVERIFIED');
  assert.deepEqual(calls,['info']);
});

test('unverified cleanup never releases the ownership intent',async()=>{
  let released=false;
  await supervisorFixture('cleanup',{lifecycle:{reserve:async()=>{},release:async()=>{released=true;}}});
  assert.equal(released,false);
});
