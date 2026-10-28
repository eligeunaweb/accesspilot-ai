import {timingSafeEqual} from 'node:crypto';

export const MAX_COMMAND_BYTES=4096;
export const jobIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function jobRequestError(status=400) {const error=new Error('Job request rejected');error.status=status;return error;}
export function equalSecret(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||!/^([a-f0-9]{64})$/.test(a)||!/^([a-f0-9]{64})$/.test(b))return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
export function validateJobOrigin(origin) {
  const url=new URL(origin);
  if(url.origin!==origin||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||Number(url.port||80)<1)throw jobRequestError();
  return url.host;
}
export function checkJobEnvelope(req,origin,action) {
  if(!['create','cancel','status'].includes(action))throw jobRequestError();
  const h=req.headers??{},seen=new Set();
  const single=new Set(['host','origin','authorization','x-accesspilot-csrf','sec-fetch-site','content-type','content-encoding','content-length','transfer-encoding','expect','upgrade']);
  if(!Array.isArray(req.rawHeaders)||req.rawHeaders.length%2)throw jobRequestError();
  for(let i=0;i<req.rawHeaders.length;i+=2) {
    if(typeof req.rawHeaders[i]!=='string'||typeof req.rawHeaders[i+1]!=='string')throw jobRequestError();
    const name=req.rawHeaders[i].toLowerCase();if(single.has(name)&&seen.has(name))throw jobRequestError();seen.add(name);
  }
  if(h.host!==validateJobOrigin(origin)||(action==='status'?h.origin!==undefined&&h.origin!==origin:h.origin!==origin)||(h['sec-fetch-site']!==undefined&&!['same-origin','none'].includes(h['sec-fetch-site'])))throw jobRequestError(403);
  if(req.method!==(action==='status'?'GET':'POST'))throw jobRequestError(405);
  if(h['transfer-encoding']!==undefined||h.expect!==undefined||h.upgrade!==undefined)throw jobRequestError();
  if(h['content-encoding']!==undefined)throw jobRequestError(415);
  if(action==='status') {
    if(h['content-length']!==undefined&&h['content-length']!=='0')throw jobRequestError();
    return 0;
  }
  if(typeof h['content-type']!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(h['content-type']))throw jobRequestError(415);
  if(typeof h['content-length']!=='string'||!/^[1-9][0-9]{0,3}$/.test(h['content-length'])||String(Number(h['content-length']))!==h['content-length'])throw jobRequestError();
  const bytes=Number(h['content-length']);if(bytes>MAX_COMMAND_BYTES)throw jobRequestError(413);
  return bytes;
}
export function parseWebJobCommand(body,action,expectedBytes) {
  if(!Buffer.isBuffer(body)||body.length>MAX_COMMAND_BYTES||body.length!==expectedBytes)throw jobRequestError();
  let input,source;
  try {source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);input=JSON.parse(source);}catch {throw jobRequestError();}
  const keys=action==='create'?['schemaVersion','projectId','requestId']:action==='cancel'?['schemaVersion','jobId']:[];
  if(!keys.length||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||Object.keys(input).some(key=>!keys.includes(key))||input.schemaVersion!==1)throw jobRequestError();
  // Commands are flat scalars. Count every syntactic key, including overwritten duplicates.
  const encodedKeys=[...source.matchAll(/"(?:[^"\\]|\\.)*"\s*:/g)];
  if(encodedKeys.length!==keys.length)throw jobRequestError();
  if(action==='create') {
    if(typeof input.projectId!=='string'||!(/^[a-f0-9]{64}$/).test(input.projectId)||typeof input.requestId!=='string'||!jobIdPattern.test(input.requestId))throw jobRequestError();
    return {schemaVersion:1,projectId:input.projectId,requestId:input.requestId};
  }
  if(typeof input.jobId!=='string'||!jobIdPattern.test(input.jobId))throw jobRequestError();
  return {schemaVersion:1,jobId:input.jobId};
}
