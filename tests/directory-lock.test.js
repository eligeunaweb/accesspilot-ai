import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireDirectoryLock} from '../src/directory-lock.js';

test('Windows transient permission contention retries exclusive mkdir without stealing a lock',async()=>{
  let calls=0,elapsed=0;
  await acquireDirectoryLock('fixture',{platform:'win32',now:()=>elapsed,wait:async ms=>{elapsed+=ms;},create:async(path,options)=>{
    assert.equal(path,'fixture');assert.equal(options.mode,0o700);
    if(++calls<3)throw Object.assign(new Error('pending directory deletion'),{code:'EPERM'});
  }});
  assert.equal(calls,3);assert.equal(elapsed,50);
});

test('persistent Windows permission denial is bounded and preserves its cause',async()=>{
  let elapsed=0,calls=0;
  await assert.rejects(acquireDirectoryLock('fixture',{platform:'win32',timeoutMs:50,now:()=>elapsed,wait:async ms=>{elapsed+=ms;},create:async()=>{calls++;throw Object.assign(new Error('denied'),{code:'EPERM'});}}),error=>/inaccessible/.test(error.message)&&error.cause.code==='EPERM');
  assert.equal(elapsed,50);assert.equal(calls,3);
});

test('existing owners are never bypassed even after the wait deadline',async()=>{
  let elapsed=0;
  await assert.rejects(acquireDirectoryLock('fixture',{platform:'linux',timeoutMs:50,now:()=>elapsed,wait:async ms=>{elapsed+=ms;},create:async()=>{throw Object.assign(new Error('owned'),{code:'EEXIST'});}}),/abandoned/);
  assert.equal(elapsed,50);
});

test('non-Windows EPERM and ordinary access errors fail immediately',async()=>{
  for(const [platform,code] of [['linux','EPERM'],['win32','EACCES']]) {
    await assert.rejects(acquireDirectoryLock('fixture',{platform,wait:()=>assert.fail('must not retry'),create:async()=>{throw Object.assign(new Error('denied'),{code});}}),error=>error.code===code);
  }
});
