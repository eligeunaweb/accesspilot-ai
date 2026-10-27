import test from 'node:test';
import assert from 'node:assert/strict';
import { containerArguments, verifyContainer, runIsolationProbe } from '../scripts/isolation-probe.js';

const imageId='sha256:'+'a'.repeat(64),owner='11111111-1111-1111-1111-111111111111',name='accesspilot-isolation-'+owner;
function inspected(token=owner) {return {Id:'b'.repeat(64),Config:{Image:imageId,User:'65534:65534',Labels:{'org.accesspilot.probe':token}},Mounts:[],State:{Running:false,ExitCode:0,OOMKilled:false},HostConfig:{NetworkMode:'none',ReadonlyRootfs:true,Privileged:false,Memory:134217728,MemorySwap:134217728,NanoCpus:500000000,PidsLimit:64,IpcMode:'none',CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],Tmpfs:{'/tmp':'rw,noexec,nosuid,nodev,size=16777216,mode=1777'}}};}
test('containment probe requires immutable images and rejects escape-prone profiles',()=>{
  assert.throws(()=>containerArguments('node:22-alpine',name,owner),/immutable/);assert.throws(()=>containerArguments(imageId+'\n',name,owner),/immutable/);assert.throws(()=>containerArguments(imageId,'unrelated-container',owner),/ownership/);
  verifyContainer(inspected(),imageId,owner);
  for(const mutate of [c=>c.HostConfig.NetworkMode='host',c=>c.HostConfig.Privileged=true,c=>c.Config.User='0',c=>c.HostConfig.Memory=0,c=>c.HostConfig.PidsLimit=0,c=>c.HostConfig.CapAdd=['NET_ADMIN'],c=>c.Mounts=[{Source:'/var/run/docker.sock'}],c=>c.HostConfig.ReadonlyRootfs=false,c=>c.HostConfig.SecurityOpt=['seccomp=unconfined'],c=>c.HostConfig.Tmpfs['/tmp']='rw,exec',c=>c.HostConfig.PortBindings={'80/tcp':[{}]},c=>c.HostConfig.PidMode='host']) {const c=inspected();mutate(c);assert.throws(()=>verifyContainer(c,imageId,owner));}
});
function fake({badProfile=false,cleanupFailure=false,executeFailure=false}={}) {
  const calls=[];let token;
  return {calls,execute:async(command,args,options)=>{
    assert.equal(command,'docker');assert.equal(options.shell,false);assert.equal(options.maxBuffer,128*1024);calls.push(args);
    if(args[0]==='info') return {stdout:'linux'};
    if(args[0]==='create'){token=args[args.indexOf('--label')+1].split('=')[1];return {stdout:'b'.repeat(64)};}
    if(args[0]==='inspect'){const value=inspected(token);if(badProfile)value.HostConfig.NetworkMode='bridge';return {stdout:JSON.stringify([value])};}
    if(args[0]==='start'){if(executeFailure)throw new Error('timeout');return {stdout:JSON.stringify({schemaVersion:1,kind:'isolated-process-probe',passed:true})};}
    if(args[0]==='rm'){if(cleanupFailure)throw new Error('cleanup denied');return {stdout:'removed'};}
    throw new Error('Unexpected command');
  }};
}
test('probe checks daemon profile and exit state, then removes its owned container',async()=>{
  const f=fake(),result=await runIsolationProbe({imageId,execute:f.execute});assert.equal(result.passed,true);assert.equal(result.cleanup,'removed');assert.equal(result.stage,'complete');assert.equal(f.calls.filter(args=>args[0]==='inspect').length,3);assert.equal(f.calls.at(-1)[0],'rm');
});
test('profile mismatch, execution failure and cleanup failure cannot pass acceptance',async()=>{
  for(const options of [{badProfile:true},{executeFailure:true},{cleanupFailure:true}]) {const f=fake(options),result=await runIsolationProbe({imageId,execute:f.execute});assert.equal(result.passed,false);assert.ok(f.calls.some(args=>args[0]==='rm'));}
  const result=await runIsolationProbe({imageId,execute:async()=>{throw new Error('Daemon not available');}});assert.equal(result.passed,false);assert.equal(result.stage,'docker-info');assert.equal(result.cleanup,'not-created');
});
