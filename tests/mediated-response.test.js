import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,deflateSync,brotliCompressSync} from 'node:zlib';
import {responseForChromium} from '../src/mediated-response.js';
const response=(body,encoding='identity')=>({status:200,headers:{'content-type':'text/html','content-encoding':encoding,'content-length':'999','set-cookie':'a=1; HttpOnly\nb=2'},body:Buffer.from(body).toString('base64')});
for(const [name,encode] of [['identity',Buffer.from],['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]])test(`CDP response decodes ${name} within budget and removes wire encoding`,()=>{
  const result=responseForChromium(response(encode('fixture'),name),100);
  assert.equal(Buffer.from(result.body,'base64').toString(),'fixture');assert.equal(result.decodedBytes,7);
  assert.equal(result.responseHeaders.some(header=>['content-encoding','content-length'].includes(header.name)),false);assert.equal(result.responseHeaders.filter(header=>header.name==='set-cookie').length,2);
});
test('stacked content encodings decode in reverse application order',()=>{
  assert.equal(Buffer.from(responseForChromium(response(brotliCompressSync(gzipSync('fixture')),'gzip, br'),100).body,'base64').toString(),'fixture');
});
test('compressed expansion, oversized plain bodies and invalid encodings fail closed',()=>{
  for(const value of [response(gzipSync('x'.repeat(1000000)),'gzip'),response('x'.repeat(101)),response('bad','gzip'),response('x','unknown'),response('x','gzip,br,gzip,br')])assert.throws(()=>responseForChromium(value,100));
  assert.throws(()=>responseForChromium({...response('x'),body:'not base64'},100));assert.throws(()=>responseForChromium(response('x'),-1));
  assert.equal(responseForChromium(response(''),0).decodedBytes,0);assert.throws(()=>responseForChromium(response('x'),0));
});
