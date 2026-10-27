import test from 'node:test';
import assert from 'node:assert/strict';
import {requireChromiumSandbox} from '../src/chromium-proof.js';
const status='Sandbox Status\nLayer 1 Sandbox\tNamespace\nPID namespaces\tYes\nNetwork namespaces\tYes\nSeccomp-BPF sandbox\tYes\nSeccomp-BPF sandbox supports TSYNC\tYes\nPtrace Protection with Yama LSM (Non-broker)\tNo\nYou are adequately sandboxed.';
test('current Chromium sandbox table requires namespace, PID/network, seccomp and TSYNC',()=>{
  assert.deepEqual(requireChromiumSandbox(status),{namespace:true,pidNamespace:true,networkNamespace:true,seccomp:true,tsync:true});
});
for(const field of ['Layer 1 Sandbox','PID namespaces','Network namespaces','Seccomp-BPF sandbox','Seccomp-BPF sandbox supports TSYNC'])test(`reject disabled or missing ${field}`,()=>{
  const lines=status.split('\n');assert.throws(()=>requireChromiumSandbox(lines.filter(line=>!line.startsWith(field+'\t')).join('\n')));
  assert.throws(()=>requireChromiumSandbox(lines.map(line=>line.startsWith(field+'\t')?field+'\tNo':line).join('\n')));
});
test('duplicate, oversized or obsolete status cannot assert a sandbox',()=>{
  for(const text of [status+'\nPID namespaces\tYes',status+'x'.repeat(8000),'Namespace sandbox\tYes\nSeccomp-BPF sandbox\tYes',null])assert.throws(()=>requireChromiumSandbox(text));
});
