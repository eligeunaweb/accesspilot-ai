import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../scripts/ci-apparmor.js';
const root='/home/runner/.cache/ms-playwright';
test('CI policy grants user namespaces only to exact Chromium paths',()=>{
 const path=root+'/chromium-123/chrome-linux64/chrome';
 const profile=buildProfile([path],root);
 assert.ok(profile.includes('"'+path+'"'));assert.ok(profile.includes('userns,'));
 assert.ok(!profile.includes('*'));assert.ok(!profile.includes('sysctl'));
});
test('CI policy rejects out-of-cache, wildcard and injected profile paths',()=>{
 for(const file of ['/usr/bin/chrome',root+'/../chrome',root+'/chromium-123/*/chrome',root+'/evil"\nuserns,/chrome',root+'/chromium-123/node']) assert.throws(()=>buildProfile([file],root));
 assert.throws(()=>buildProfile([],root));
});
