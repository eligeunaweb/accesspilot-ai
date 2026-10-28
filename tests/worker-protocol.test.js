import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { JsonLines, fields, send } from '../src/worker-protocol.js';

test('JSON channel preserves fragmented Unicode and several frames in one chunk',()=>{
  const received=[],channel=new JsonLines(value=>received.push(value));const bytes=Buffer.from(JSON.stringify({text:'Español 日本語'})+'\n{}\n');
  for(const byte of bytes)channel.push(Buffer.from([byte]));channel.end();assert.deepEqual(received,[{text:'Español 日本語'},{}]);
});
for(const [label,bytes,limits] of [
  ['invalid JSON',Buffer.from('bad\n'),{}],['empty frame',Buffer.from('\n'),{}],['invalid UTF-8',Buffer.from([34,255,34,10]),{}],
  ['line limit',Buffer.from('"123"\n'),{maxLine:4}],['aggregate limit',Buffer.from('{}\n{}\n'),{maxTotal:5}],['frame count',Buffer.from('{}\n{}\n'),{maxFrames:1}]
])test(`JSON channel fails permanently after ${label}`,()=>{
  const channel=new JsonLines(()=>{},limits);assert.throws(()=>channel.push(bytes));assert.throws(()=>channel.push('{}\n'),/closed/);assert.throws(()=>channel.end(),/closed/);
});
test('truncated frames and excessive fragments cannot accumulate indefinitely',()=>{
  const truncated=new JsonLines(()=>{});truncated.push('{');assert.throws(()=>truncated.end(),/Incomplete/);assert.throws(()=>truncated.push('{}\n'),/closed/);
  const fragmented=new JsonLines(()=>{});assert.throws(()=>{for(let i=0;i<8193;i++)fragmented.push(' ');},/budget/);
});
test('invalid configuration and unexpected object fields are rejected',()=>{
  for(const limits of [{maxLine:0},{maxTotal:Infinity},{maxFrames:1.1}])assert.throws(()=>new JsonLines(()=>{},limits));
  for(const value of [null,[],1,{unexpected:true}])assert.throws(()=>fields(value,['allowed']));fields({allowed:true},['allowed']);
});
test('outgoing channel waits for write completion and propagates write errors',async()=>{
  const received=[];const stream=new Writable({write(chunk,encoding,done){received.push(chunk.toString());setImmediate(done);}});
  await send(stream,{value:'fixture'});assert.deepEqual(received,['{"value":"fixture"}\n']);
  const broken=new Writable({write(chunk,encoding,done){done(new Error('closed fixture'));}});broken.on('error',()=>{});await assert.rejects(send(broken,{}),/closed fixture/);
  await assert.rejects(send(stream,{body:'x'.repeat(24*1024*1024)}),/too large/);
});
