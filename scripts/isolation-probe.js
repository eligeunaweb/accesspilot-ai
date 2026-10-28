import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const run=promisify(execFile);
export const probeSource=String.raw`
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import net from 'node:net';
import dgram from 'node:dgram';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const read=async path=>(await readFile(path,'utf8')).trim();
assert.equal(process.platform,'linux');assert.equal(process.getuid(),65534);
const interfaces=Object.keys(networkInterfaces()).sort();assert.deepEqual(interfaces,['lo']);
const status=await read('/proc/self/status');
assert.match(status,/^CapEff:\s+0+$/m);assert.match(status,/^NoNewPrivs:\s+1$/m);assert.match(status,/^Seccomp:\s+2$/m);
const memory=await read('/sys/fs/cgroup/memory.max'),pids=await read('/sys/fs/cgroup/pids.max'),cpu=await read('/sys/fs/cgroup/cpu.max'),swap=await read('/sys/fs/cgroup/memory.swap.max');
assert.equal(memory,'134217728');assert.equal(pids,'64');assert.equal(swap,'0');
const [quota,period]=cpu.split(/\s+/).map(Number);assert.equal(quota/period,0.5);
const denied=new Set(['ENETUNREACH','EHOSTUNREACH','EACCES','EPERM']);
const tcp=host=>new Promise((resolve,reject)=>{
 const socket=net.connect({host,port:9});socket.setTimeout(1000,()=>socket.destroy(new Error('Network denial was not immediate')));
 socket.once('connect',()=>{socket.destroy();reject(new Error('Direct egress unexpectedly connected'));});
 socket.once('error',error=>denied.has(error.code)?resolve({host,code:error.code}):reject(error));
});
const tcpResults=[];for(const host of ['169.254.169.254','10.0.0.1','1.1.1.1','2606:4700:4700::1111']) tcpResults.push(await tcp(host));
const udp=await new Promise((resolve,reject)=>{
 const socket=dgram.createSocket('udp4');const timer=setTimeout(()=>{socket.close();reject(new Error('UDP denial timed out'));},1000);
 socket.send(Buffer.from('accesspilot-isolation-probe'),9,'1.1.1.1',error=>{clearTimeout(timer);socket.close();if(error&&denied.has(error.code)) resolve(error.code);else reject(new Error('UDP egress not denied'));});
});
const loopback=net.createServer(socket=>socket.end('isolated-loopback'));
await new Promise(resolve=>loopback.listen(0,'127.0.0.1',resolve));
const own=await new Promise((resolve,reject)=>{const socket=net.connect(loopback.address().port,'127.0.0.1');let data='';socket.on('data',chunk=>data+=chunk);socket.on('end',()=>resolve(data));socket.on('error',reject);});
await new Promise(resolve=>loopback.close(resolve));assert.equal(own,'isolated-loopback');
await assert.rejects(writeFile('/accesspilot-write-probe','blocked'),error=>['EROFS','EACCES'].includes(error.code));
await assert.rejects(readFile('/var/run/docker.sock'),error=>error.code==='ENOENT');
await writeFile('/tmp/accesspilot-probe.sh','#!/bin/sh\nexit 0\n',{mode:0o700});
await assert.rejects(promisify(execFile)('/tmp/accesspilot-probe.sh'),error=>error.code==='EACCES');
console.log(JSON.stringify({schemaVersion:1,kind:'isolated-process-probe',passed:true,uid:process.getuid(),interfaces,memory,pids,cpu,swap,tcp:tcpResults,udp,loopback:true,readOnly:true,noExecTmp:true,noNewPrivileges:true,seccomp:true}));
`;

function immutableImage(value) {
  if(typeof value!=='string'||value.length!==71||!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('Use an already-pulled immutable Docker image ID (sha256:...)');
}
export function containerArguments(imageId,name,owner) {
  immutableImage(imageId);
  if(!/^accesspilot-isolation-[a-f0-9-]{36}$/.test(name)||!/^[a-f0-9-]{36}$/.test(owner)) throw new Error('Invalid probe ownership');
  return ['create','--pull','never','--name',name,'--label',`org.accesspilot.probe=${owner}`,'--network','none','--read-only','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--user','65534:65534','--pids-limit','64','--memory','128m','--memory-swap','128m','--cpus','0.5','--ipc','none',
    '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16777216,mode=1777','--env','NODE_OPTIONS=','--env','NODE_PATH=','--entrypoint','node',imageId,'--input-type=module','-e',probeSource];
}
export function verifyContainer(container,imageId,owner) {
  const h=container.HostConfig,c=container.Config;
  if(!h||!c||c.Image!==imageId||c.Labels?.['org.accesspilot.probe']!==owner||c.User!=='65534:65534'||
    h.NetworkMode!=='none'||h.ReadonlyRootfs!==true||h.Privileged!==false||h.Memory!==134217728||h.MemorySwap!==134217728||h.NanoCpus!==500000000||h.PidsLimit!==64||h.IpcMode!=='none'||
    h.CapDrop?.length!==1||h.CapDrop[0]!=='ALL'||h.SecurityOpt?.length!==1||!['no-new-privileges','no-new-privileges=true'].includes(h.SecurityOpt[0])||
    h.Binds?.length||container.Mounts?.length||h.CapAdd?.length||h.Devices?.length||h.DeviceRequests?.length||h.PortBindings&&Object.keys(h.PortBindings).length||h.PidMode||h.UTSMode) throw new Error('Docker inspection did not match the required containment profile');
  if(h.Tmpfs?.['/tmp']!=='rw,noexec,nosuid,nodev,size=16777216,mode=1777'||Object.keys(h.Tmpfs).length!==1) throw new Error('Unexpected probe temporary filesystem');
}
export async function runIsolationProbe({imageId,execute=run}={}) {
  immutableImage(imageId);
  const owner=randomUUID(),name=`accesspilot-isolation-${randomUUID()}`;
  let stage='docker-info',created=false,containerId,verification,cleanup='not-created',failure;
  const docker=async args=>(await execute('docker',args,{timeout:30000,maxBuffer:128*1024,windowsHide:true,shell:false})).stdout.trim();
  try {
    if(await docker(['info','--format','{{.OSType}}'])!=='linux') throw new Error('A Linux Docker engine is required');
    stage='create';created=true;containerId=await docker(containerArguments(imageId,name,owner));
    if(!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Invalid container ID');
    stage='inspect';const inspected=JSON.parse(await docker(['inspect',containerId]));
    if(!Array.isArray(inspected)||inspected.length!==1) throw new Error('Invalid inspection response');verifyContainer(inspected[0],imageId,owner);
    stage='execute';verification=JSON.parse(await docker(['start','--attach',containerId]));
    if(verification.kind!=='isolated-process-probe'||verification.schemaVersion!==1||verification.passed!==true) throw new Error('Isolation assertions did not pass');
    stage='exit-state';const finished=JSON.parse(await docker(['inspect',containerId]))[0];
    if(finished.State?.Running!==false||finished.State.ExitCode!==0||finished.State.OOMKilled!==false) throw new Error('Probe did not exit successfully');
    stage='complete';
  } catch(error) {failure=error;}
  finally {
    if(created) {
      try {
        // Recover ownership even if create timed out before returning an ID.
        const inspected=JSON.parse(await docker(['inspect',name]));
        if(inspected.length!==1||inspected[0].Config?.Labels?.['org.accesspilot.probe']!==owner||!/^[a-f0-9]{64}$/.test(inspected[0].Id)) throw new Error('Cannot verify cleanup ownership');
        await docker(['rm','--force','--volumes',inspected[0].Id]);cleanup='removed';
      } catch {cleanup='failed';failure??=new Error('Probe cleanup failed');}
    }
  }
  return {schemaVersion:1,kind:'docker-isolation-acceptance',passed:!failure,stage,imageId,containerName:name,cleanup,verification:verification??null,
    note:'Process/network/resource prerequisite probe only. Not an isolated browser audit backend or independent security review.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--image'||args[2]!=='--output') throw new Error('Usage: node scripts/isolation-probe.js --image sha256:... --output result.json');
    const result=await runIsolationProbe({imageId:args[1]});await writeFile(args[3],JSON.stringify(result,null,2),{encoding:'utf8',flag:'wx',mode:0o600});
    console.log(JSON.stringify(result));process.exitCode=result.passed?0:2;
  } catch(error) {console.error(error.message);process.exitCode=2;}
}
