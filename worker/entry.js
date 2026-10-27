import {chromium} from 'playwright';
import {auditPage} from '../src/audit.js';
import {JsonLines,fields,send} from '../src/worker-protocol.js';
import {validateJob} from '../src/worker-job.js';
import {guard} from './guard.js';

let started=false,finished=false,nextId=0,stage='guard',startupDiagnostic;
const pending=new Map(),controller=new AbortController();
const output=value=>send(process.stdout,value);
function fatal() {
  if(finished)return;finished=true;controller.abort();
  for(const item of pending.values())item.reject(new Error('Worker channel failed'));pending.clear();
  output({type:'error',code:stage+'-failed',message:'Contained audit failed',...(stage==='sandbox'&&startupDiagnostic?{startupDiagnostic}:{})}).finally(()=>process.exit(2));
}
async function launch(options) {
  let browser;
  try {browser=await chromium.launch({...options,channel:'chromium'});}
  catch(error) {startupDiagnostic='launch: '+String(error.message).slice(0,4000);throw error;}
  try {
    const context=await browser.newContext(),page=await context.newPage();
    await page.goto('chrome://sandbox');const text=await page.locator('body').innerText();
    if(!/Namespace sandbox\s+Yes/.test(text)||!/Seccomp-BPF sandbox\s+Yes/.test(text))throw new Error('Chromium sandbox proof failed: '+text.slice(0,2000));
    for(const target of ['http://169.254.169.254/','http://10.0.0.1/','http://1.1.1.1/','http://[2606:4700:4700::1111]/']) {
      let directDenied=false;
      try {await page.goto(target,{timeout:3000});}
      catch(error) {directDenied=/net::ERR_(INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE|NETWORK_ACCESS_DENIED|FAILED)/.test(error.message);}
      if(!directDenied)throw new Error('Chromium direct egress was not denied');
    }
    await context.close();stage='audit';await output({type:'sandbox',namespace:true,seccomp:true,directDenied:true});return browser;
  } catch(error) {startupDiagnostic='proof: '+String(error.message).slice(0,4000);await browser.close();throw error;}
}
function mediate(request) {
  if(finished||pending.size>=68)return Promise.reject(new Error('Worker request capacity exceeded'));
  const id=++nextId;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});output({type:'request',id,request}).catch(fatal);
  });
}
async function start(job) {
  try {
    const report=await auditPage(job.url,{...job,launch,signal:controller.signal,mediate});
    if(pending.size)throw new Error('Unfinished mediated requests');
    finished=true;await output({type:'result',report});process.exit(0);
  } catch {fatal();}
}
function message(value) {
  if(finished)throw new Error('Worker finished');
  if(value?.type==='start') {
    fields(value,['type','job']);if(started)throw new Error('Duplicate worker start');
    const job=validateJob(value.job);started=true;stage='sandbox';void start(job);return;
  }
  fields(value,['type','id','response']);
  if(!started||value.type!=='response'||!Number.isSafeInteger(value.id)||!pending.has(value.id))throw new Error('Unexpected response');
  const response=value.response;fields(response,['status','headers','body']);fields(response.headers,Object.keys(response.headers??{}));
  if(!Number.isInteger(response.status)||response.status<200||response.status>599||typeof response.body!=='string'||response.body.length>24*1024*1024)throw new Error('Invalid response');
  if(Object.keys(response.headers).length>100||Object.entries(response.headers).some(([key,item])=>typeof item!=='string'||key.length>256||item.length>32768))throw new Error('Invalid response headers');
  if(Buffer.from(response.body,'base64').toString('base64')!==response.body)throw new Error('Invalid response body');
  const item=pending.get(value.id);pending.delete(value.id);item.resolve(response);
}
try {
  const proof=await guard();const reader=new JsonLines(message);
  process.stdin.on('data',chunk=>{try{reader.push(chunk);}catch{fatal();}});
  process.stdin.on('end',()=>{try{reader.end();if(!finished)fatal();}catch{fatal();}});
  process.stdin.on('error',fatal);process.stdout.on('error',()=>process.exit(2));
  await output({type:'ready',proof});
} catch {fatal();}
