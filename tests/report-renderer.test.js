import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createReportRenderer} from '../src/report-renderer.js';
import {richFixture} from './fixtures/rich-history.js';
import {renderShareReport} from '../src/share-report.js';
import {exportHistory} from '../src/history-export.js';

const fault=fileURLToPath(new URL('./fixtures/render-fault.js',import.meta.url));
function faultFactory(children,started=()=>{}) {
  return (_file,args,options)=>{const child=fork(fault,args,{...options,stdio:['ignore','pipe','ignore','ipc']});children.push(child);child.stdout.on('data',()=>started());return child;};
}

test('real disposable processes preserve bilingual evidence and shared export bytes',async t=>{
  const renderer=createReportRenderer();t.after(()=>renderer.close());const snapshot=richFixture();
  for(const lang of ['es','en'])for(const format of ['json','html','csv'])for(const shared of [false,true]) {
    const expected=shared?renderShareReport(snapshot,format,lang):exportHistory(snapshot,format,lang);
    assert.equal(await renderer.render('export',{snapshot,format,lang,shared}),expected);
  }
});

test('child deadline terminates synchronous CPU work, retains admission and allows recovery',async t=>{
  const children=[];let started;const running=new Promise(resolve=>started=resolve);
  const renderer=createReportRenderer({maxWorkers:1,timeoutMs:3000},{forkChild:faultFactory(children,started)});t.after(()=>renderer.close());
  const pending=renderer.render('detail',{mode:'spin'});const rejected=assert.rejects(pending,/Report rendering unavailable/);
  await running;
  await assert.rejects(renderer.render('detail',{mode:'ready'}));
  let heartbeat=false;await new Promise(resolve=>setTimeout(()=>{heartbeat=true;resolve();},20));assert.equal(heartbeat,true);
  await rejected;assert.notEqual(children[0].exitCode??children[0].signalCode,null);
  const pid=await renderer.render('detail',{mode:'ready'});assert.notEqual(Number(pid),process.pid);assert.equal(children.length,2);
});

test('disconnect and shutdown kill actual child processes and reject subsequent admission',async t=>{
  const children=[];let started;const running=new Promise(resolve=>started=resolve);
  const renderer=createReportRenderer({}, {forkChild:faultFactory(children,started)});t.after(()=>renderer.close());
  const controller=new AbortController(),pending=renderer.render('detail',{mode:'spin'},{signal:controller.signal});const rejected=assert.rejects(pending);
  await running;controller.abort();await rejected;assert.notEqual(children[0].exitCode??children[0].signalCode,null);
  let startedAgain;const another=new Promise(resolve=>startedAgain=resolve);
  const second=createReportRenderer({}, {forkChild:faultFactory(children,startedAgain)});
  t.after(()=>second.close());
  const work=assert.rejects(second.render('detail',{mode:'spin'}));await another;await second.close();await work;
  await assert.rejects(second.render('detail',{}));assert.notEqual(children[1].exitCode??children[1].signalCode,null);
});

test('crash, malformed protocol, output/input budgets and pre-abort fail closed',async t=>{
  const children=[],renderer=createReportRenderer({maxOutputBytes:8},{forkChild:faultFactory(children)});t.after(()=>renderer.close());
  for(const mode of ['crash','oversize','malformed']) {
    await assert.rejects(renderer.render('detail',{mode}));
  }
  const small=createReportRenderer({maxInputBytes:1});t.after(()=>small.close());await assert.rejects(small.render('detail',{}));
  await assert.rejects(renderer.render('arbitrary',{}));
  await assert.rejects(renderer.render('detail',{}, {signal:AbortSignal.abort()}));
  assert.equal(children.length,3);
  for(const limits of [{maxWorkers:3},{timeoutMs:0},{maxOutputBytes:Infinity},{unknown:1}])assert.throws(()=>createReportRenderer(limits));
});

test('renderer clears inherited Node flags, secrets and output channels',async t=>{
  const children=[];let observed;
  const renderer=createReportRenderer({}, {forkChild:(file,args,options)=>{observed=options;return faultFactory(children)(file,args,options);}});t.after(()=>renderer.close());
  await renderer.render('detail',{mode:'ready'});
  assert.deepEqual(observed.execArgv,['--max-old-space-size=192','--stack-size=1024']);
  assert.deepEqual(observed.stdio,['ignore','ignore','ignore','ipc']);assert.equal(observed.windowsHide,true);
  assert.ok(Object.keys(observed.env).every(key=>['SystemRoot','TEMP','TMP'].includes(key)));
});
