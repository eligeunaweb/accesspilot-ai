import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import net from 'node:net';
import dgram from 'node:dgram';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export async function guard() {
  const read=async path=>(await readFile(path,'utf8')).trim();
  assert.equal(process.platform,'linux');assert.equal(process.getuid(),65534);
  assert.deepEqual(Object.keys(networkInterfaces()).sort(),['lo']);
  const status=await read('/proc/self/status');assert.match(status,/^CapEff:\s+0+$/m);assert.match(status,/^CapBnd:\s+0+$/m);assert.match(status,/^NoNewPrivs:\s+1$/m);assert.match(status,/^Seccomp:\s+2$/m);
  assert.equal(await read('/sys/fs/cgroup/memory.max'),'1073741824');assert.equal(await read('/sys/fs/cgroup/memory.swap.max'),'0');
  assert.equal(await read('/sys/fs/cgroup/pids.max'),'256');
  const [quota,period]=(await read('/sys/fs/cgroup/cpu.max')).split(/\s+/).map(Number);assert.equal(quota/period,1);
  const denied=new Set(['ENETUNREACH','EHOSTUNREACH','EACCES','EPERM']);
  for(const host of ['169.254.169.254','10.0.0.1','1.1.1.1','2606:4700:4700::1111'])await new Promise((resolve,reject)=>{
    const socket=net.connect({host,port:9});socket.setTimeout(1000,()=>socket.destroy(new Error('Direct TCP denial timed out')));
    socket.once('connect',()=>{socket.destroy();reject(new Error('Direct egress connected'));});socket.once('error',error=>denied.has(error.code)?resolve():reject(error));
  });
  await new Promise((resolve,reject)=>{
    const socket=dgram.createSocket('udp4'),timer=setTimeout(()=>{socket.close();reject(new Error('UDP denial timed out'));},1000);
    socket.send(Buffer.from('isolation'),53,'1.1.1.1',error=>{clearTimeout(timer);socket.close();if(error&&denied.has(error.code))resolve();else reject(new Error('Direct UDP egress permitted'));});
  });
  await assert.rejects(writeFile('/accesspilot-write-probe','denied'),error=>['EROFS','EACCES'].includes(error.code));
  await assert.rejects(readFile('/var/run/docker.sock'),error=>error.code==='ENOENT');
  await writeFile('/tmp/accesspilot-noexec.sh','#!/bin/sh\nexit 0\n',{mode:0o700});
  await assert.rejects(promisify(execFile)('/tmp/accesspilot-noexec.sh'),error=>error.code==='EACCES');
  await assert.rejects(promisify(execFile)('chroot',['/tmp','/bin/true'],{env:{...process.env,LC_ALL:'C'}}),error=>[1,125].includes(error.code)&&/Operation not permitted/.test(error.stderr));
  return {parentChrootDenied:true,profileVersion:1,uid:65534,networkNone:true,seccomp:true,noNewPrivileges:true,kernelLimits:true,directTcpUdpDenied:true,readOnly:true,noExecTmp:true};
}
