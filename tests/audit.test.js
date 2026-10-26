import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPage } from '../src/audit.js';

for (const stage of ['newContext', 'newPage', 'goto', 'analyze', 'contextClose', 'browserClose']) {
  test(`cleanup after ${stage} failure`, async () => {
    const closed = [];
    const fail = () => { throw new Error(stage); };
    const page = { goto: stage === 'goto' ? fail : async () => ({ok:()=>true}), url:()=> 'https://example.org/' };
    const context = {newPage: stage === 'newPage' ? fail : async () => page,
      close: async () => {closed.push('context'); if(stage === 'contextClose') fail();}};
    const browser = {newContext: stage === 'newContext' ? fail : async () => context,
      close: async () => {closed.push('browser'); if(stage === 'browserClose') fail();}};
    await assert.rejects(auditPage('https://example.org', {launch:async()=>browser,
      analyze:stage === 'analyze' ? fail : async()=>({violations:[],passes:[],incomplete:[],inapplicable:[]})}), new RegExp(stage));
    assert.deepEqual(closed, stage === 'newContext' ? ['browser'] : ['context','browser']);
  });
}


test('pre-aborted audit never launches a browser',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(auditPage('https://example.org',{signal:controller.signal,launch:()=>assert.fail('must not launch')}),/cancelled/);
});
test('timeout closes a late browser and never creates a context',async()=>{
  let closed=false;
  await assert.rejects(auditPage('https://example.org',{timeoutMs:5,launch:async()=>{
    await new Promise(resolve=>setTimeout(resolve,20));
    return {newContext:()=>assert.fail('must not create context'),close:async()=>{closed=true;}};
  }}),/timed out/);
  assert.equal(closed,true);
});
test('analysis timeout closes context and browser',async()=>{
  const closed=[];
  const page={goto:async()=>({ok:()=>true}),url:()=> 'https://example.org/'};
  const context={newPage:async()=>page,close:async()=>closed.push('context')};
  await assert.rejects(auditPage('https://example.org',{timeoutMs:10,
    launch:async()=>({newContext:async()=>context,close:async()=>closed.push('browser')}),
    analyze:()=>new Promise(()=>{})}),/timed out/);
  assert.deepEqual(closed,['context','browser']);
});
