import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, createNetworkPolicy, resolveTarget, validateNetwork } from '../src/network-policy.js';
for(const address of ['0.0.0.0','10.0.0.1','127.0.0.1','169.254.169.254','100.100.100.200','172.16.1.1','192.168.1.1','192.0.0.9','198.18.0.1','203.0.113.1','224.0.0.1','255.255.255.255',
 '::','::1','::ffff:127.0.0.1','::ffff:8.8.8.8','fc00::1','fe80::1','64:ff9b::a00:1','2001:db8::1','2002:0808:0808::1','3fff::1','invalid'])
 test(`deny private/special address ${address}`,()=>assert.equal(isPublicAddress(address),false));
for(const address of ['8.8.8.8','1.1.1.1','93.184.216.34','2606:4700:4700::1111','2001:4860:4860::8888'])
 test(`accept global address ${address}`,()=>assert.equal(isPublicAddress(address),true));
test('origins, schemes, credentials and ports are strictly scoped',()=>{
 const p=createNetworkPolicy(['https://example.org'],{resourceOrigins:['https://cdn.example.org']});
 assert.equal(p.check('https://cdn.example.org/a.css').origin,'https://cdn.example.org');
 for(const url of ['http://example.org','https://example.org.evil','https://example.org:22','file:///etc/passwd','https://u:p@example.org']) assert.throws(()=>p.check(url));
 assert.throws(()=>p.check('https://cdn.example.org',true));
 assert.throws(()=>validateNetwork({resourceOrigins:['https://example.org/path']}));
 assert.throws(()=>validateNetwork({allowedPorts:[0]}));assert.throws(()=>validateNetwork({unknown:true}));
 assert.throws(()=>createNetworkPolicy(['https://example.org'],{allowPrivateOrigins:['http://localhost']}));
});
test('reject every DNS answer if any address is private',async()=>{
 const p=createNetworkPolicy(['https://example.org']);
 await assert.rejects(resolveTarget('https://example.org',p,{lookup:async()=>[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}]}),/blocked/);
});
test('resolution returns a numeric address and rejects a later rebind',async()=>{
 const p=createNetworkPolicy(['https://example.org']);let count=0;
 const lookup=async()=>[{address:count++===0?'1.1.1.1':'127.0.0.1',family:4}];
 assert.deepEqual((await resolveTarget('https://example.org',p,{lookup})).address,'1.1.1.1');
 await assert.rejects(resolveTarget('https://example.org',p,{lookup}),/blocked/);assert.equal(count,2);
});
test('nonstandard loopback encodings normalize before address checks',async()=>{
 const p=createNetworkPolicy(['http://127.0.0.1']);
 for(const u of ['http://2130706433','http://0x7f000001','http://127.1']) await assert.rejects(resolveTarget(u,p),/blocked/);
});
