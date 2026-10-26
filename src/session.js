import { open } from 'node:fs/promises';

function object(value,keys) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))) throw new Error('Invalid authentication configuration or session state');
}
function string(value,max) {return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);}
export function validateAuthentication(input,urls,network) {
  object(input,['profile','readySelector']);
  if(!string(input.profile,32)||!/^[a-z][a-z0-9-]{0,31}$/.test(input.profile)||!string(input.readySelector,500)) throw new Error('Authentication requires a public profile name and readySelector');
  const origins=new Set(urls.map(url=>new URL(url).origin));
  if(origins.size!==1||!network||network.resourceOrigins.some(origin=>!origins.has(origin))) throw new Error('Authenticated audits require restricted networking with one exact origin');
  const url=new URL(urls[0]);
  if(url.protocol!=='https:'&&(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!network.allowPrivateOrigins.includes(url.origin))) throw new Error('Authentication requires HTTPS or an explicitly trusted loopback fixture');
  return {profile:input.profile,readySelector:input.readySelector};
}

// Accept a bounded, deliberately narrow subset of Playwright storageState.
// Never include offending values or filenames in diagnostics.
export function validateSessionState(input,project) {
  if(!project.authentication) throw new Error('Session state requires project authentication');
  validateAuthentication(project.authentication,project.urls,project.network);
  object(input,['cookies','origins']);
  if(Buffer.byteLength(JSON.stringify(input))>1024*1024) throw new Error('Session state exceeds 1 MiB');
  if(!Array.isArray(input.cookies)||input.cookies.length>100||!Array.isArray(input.origins)||input.origins.length>1) throw new Error('Invalid session state limits');
  const url=new URL(project.urls[0]),seen=new Set();
  const cookies=input.cookies.map(cookie=>{
    object(cookie,['name','value','domain','path','expires','httpOnly','secure','sameSite']);
    if(!string(cookie.name,256)||!string(cookie.value,8192)||cookie.domain!==url.hostname||!string(cookie.path,2048)||!cookie.path.startsWith('/')||
      !Number.isFinite(cookie.expires)||(cookie.expires!==-1&&cookie.expires<=Date.now()/1000)||typeof cookie.httpOnly!=='boolean'||typeof cookie.secure!=='boolean'||
      !['Strict','Lax','None'].includes(cookie.sameSite)||(url.protocol==='https:'&&!cookie.secure)) throw new Error('Invalid, expired or out-of-scope session cookie');
    const key=JSON.stringify([cookie.name,cookie.path]);if(seen.has(key)) throw new Error('Duplicate session cookie');seen.add(key);
    return {...cookie};
  });
  const origins=input.origins.map(entry=>{
    object(entry,['origin','localStorage']);
    if(entry.origin!==url.origin||!Array.isArray(entry.localStorage)||entry.localStorage.length>100) throw new Error('Invalid session origin');
    const names=new Set();
    const localStorage=entry.localStorage.map(item=>{
      object(item,['name','value']);
      if(!string(item.name,512)||typeof item.value!=='string'||item.value.length>32768||names.has(item.name)) throw new Error('Invalid session local storage');
      names.add(item.name);return {...item};
    });return {origin:entry.origin,localStorage};
  });
  if(!cookies.length&&!origins.some(entry=>entry.localStorage.length)) throw new Error('Session state is empty');
  return {cookies,origins};
}
export async function loadSessionState(path,project) {
  let file;
  try {
    file=await open(path,'r');if(!(await file.stat()).isFile()) throw new Error();
    const buffer=Buffer.alloc(1024*1024+1);let size=0;
    while(size<buffer.length) {const {bytesRead}=await file.read(buffer,size,buffer.length-size,null);if(!bytesRead) break;size+=bytesRead;}
    if(size>1024*1024) throw new Error();
    return validateSessionState(JSON.parse(buffer.subarray(0,size).toString('utf8').replace(/^\uFEFF/,'')),project);
  } catch {throw new Error('Session state could not be loaded or validated');}
  finally {await file?.close();}
}
