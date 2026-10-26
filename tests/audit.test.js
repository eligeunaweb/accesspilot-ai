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
