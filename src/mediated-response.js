import * as zlib from 'node:zlib';
import {fields} from './worker-protocol.js';

// CDP Fetch.fulfillRequest consumes decoded bodies. Decode inside the bounded
// worker, never with an unbounded host decompressor, then remove wire encoding.
export function responseForChromium(response,remainingBytes) {
  fields(response,['status','headers','body']);fields(response.headers,Object.keys(response.headers??{}));
  if(!Number.isInteger(remainingBytes)||remainingBytes<0||remainingBytes>16*1024*1024||typeof response.body!=='string'||response.body.length>24*1024*1024)throw new Error('Invalid mediated response budget');
  let body=Buffer.from(response.body,'base64');if(body.toString('base64')!==response.body)throw new Error('Invalid mediated response body');
  const entries=Object.entries(response.headers);if(entries.length>100||entries.some(([key,value])=>typeof value!=='string'||key.length>256||value.length>32768))throw new Error('Invalid mediated response headers');
  const encoding=entries.find(([key])=>key.toLowerCase()==='content-encoding')?.[1]??'';
  const encodings=encoding.split(',').map(value=>value.trim().toLowerCase()).filter(value=>value&&value!=='identity');
  if(encodings.length>3)throw new Error('Unsupported mediated response encoding');
  const methods={gzip:zlib.gunzipSync,'x-gzip':zlib.gunzipSync,deflate:zlib.inflateSync,br:zlib.brotliDecompressSync,zstd:zlib.zstdDecompressSync};
  try {
    if(!remainingBytes&&body.length)throw new Error('Decoded budget exhausted');
    for(const name of encodings.reverse()) {
      if(typeof methods[name]!=='function')throw new Error('Unsupported encoding');
      body=methods[name](body,{maxOutputLength:Math.max(1,remainingBytes)});
    }
    if(body.length>remainingBytes)throw new Error('Decoded budget exhausted');
  } catch {throw new Error('Mediated response decoding failed or decoded budget exhausted');}
  const responseHeaders=entries.filter(([name])=>!['content-encoding','content-length','transfer-encoding'].includes(name.toLowerCase()))
    .flatMap(([name,value])=>(name.toLowerCase()==='set-cookie'?value.split('\n'):[value]).map(value=>({name,value})));
  return {responseCode:response.status,responseHeaders,body:body.toString('base64'),decodedBytes:body.length};
}
