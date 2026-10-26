import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import './helpers/outer-sandbox.js';
import { saveHistory, readHistory, listHistory, projectKey } from '../src/history.js';
import { startHistoryViewer } from '../src/viewer.js';

function snapshot(selectors=['#image']) {
  return {schemaVersion:1,kind:'project-audit',project:{schemaVersion:1,name:'AccessPilot · <img src=x onerror="window.compromised=true">',urls:['https://example.org'],language:'es'},
    pages:[{url:'https://example.org',status:'succeeded',report:{schemaVersion:1,kind:'page-audit',url:'https://example.org',
      engine:{name:'axe-core',version:'4.14.0'},violations:[{id:'image-alt',nodes:selectors.map(s=>({target:[s]}))}]}}]};
}
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'accesspilot-viewer-')),run=snapshot();
  t.after(()=>rm(root,{recursive:true,force:true}));
  const first=await saveHistory(root,run),next=await saveHistory(root,snapshot(['#new','<script>window.compromised=true</script>']));
  return {root,project:run.project,first,next};
}
function http(url,{method='GET',headers={}}={}) {
  return new Promise((resolve,reject)=>{
    const req=request(url,{method,headers},res=>{
      let body='';res.setEncoding('utf8');res.on('data',data=>body+=data);
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });req.on('error',reject);req.end();
  });
}
test('record lookup refuses paths, foreign records and missing IDs',async t=>{
  const {root,project,first}=await fixture(t);
  for(const id of ['../secret.json','/etc/passwd','missing.json']) await assert.rejects(readHistory(root,project,[id]),{code:'HISTORY_NOT_FOUND'});
  await assert.rejects(readHistory(root,project,[]));
  assert.equal((await readHistory(root,project,[first]))[0].pages.length,1);
  const foreign=snapshot();foreign.project.name='Different';
  await writeFile(join(root,projectKey(project),first),JSON.stringify(foreign));
  await assert.rejects(readHistory(root,project,[first]),/another project/);
});

test('local viewer enforces secret path, origin, Host, method and strict parameters',async t=>{
  const f=await fixture(t),viewer=await startHistoryViewer(f);t.after(()=>viewer.close());
  const origin=new URL(viewer.url).origin;
  assert.equal(new URL(viewer.url).hostname,'127.0.0.1');
  const ok=await http(viewer.url);assert.equal(ok.status,200);
  assert.match(ok.headers['content-security-policy'],/default-src 'none'/);
  assert.equal(ok.headers['cache-control'],'no-store');assert.equal(ok.headers['referrer-policy'],'no-referrer');
  for(const headers of [{Host:'evil.example'},{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}]) assert.equal((await http(viewer.url,{headers})).status,403);
  assert.equal((await http(viewer.url,{headers:{Origin:origin,'Sec-Fetch-Site':'same-origin'}})).status,200);
  assert.equal((await http(origin+'/')).status,404);
  for(const method of ['POST','PUT','DELETE','OPTIONS','HEAD']) assert.equal((await http(viewer.url,{method})).status,405);
  for(const query of ['lang=constructor','lang=__proto__','lang=fr','lang=en&lang=es','unknown=x','page=0','page=-1','page=1e2','before=x','run=','download=json','run=x&before=y&after=z']) assert.equal((await http(viewer.url+'?'+query)).status,400,query);
  assert.equal((await http(viewer.url+'?run=..%2Fsecret.json')).status,404);
  assert.equal((await http(viewer.url+'?page=999')).status,404);
  assert.equal((await http(viewer.url+'unexpected')).status,404);
});

test('viewer exports validated evidence and hides filesystem errors',async t=>{
  const f=await fixture(t),viewer=await startHistoryViewer(f);t.after(()=>viewer.close());
  const result=await http(viewer.url+'?'+new URLSearchParams({run:f.first,download:'json'}));
  assert.equal(result.status,200);assert.match(result.headers['content-disposition'],/attachment/);
  assert.equal(JSON.parse(result.body).kind,'project-audit');
  await writeFile(join(f.root,projectKey(f.project),f.first),'broken');
  const failed=await http(viewer.url+'?'+new URLSearchParams({run:f.first}));
  assert.equal(failed.status,503);assert.ok(!failed.body.includes(f.root));assert.ok(!failed.body.includes('SyntaxError'));
});

test('viewer bounds displayed evidence while JSON keeps complete selectors',async t=>{
  const f=await fixture(t),input=snapshot(Array.from({length:70},(_,i)=>`#${i}-${'x'.repeat(600)}`));
  const id=await saveHistory(f.root,input),viewer=await startHistoryViewer(f);t.after(()=>viewer.close());
  const query=new URLSearchParams({run:id});
  const html=await http(viewer.url+'?'+query);assert.equal(html.status,200);
  assert.equal((html.body.match(/<li>/g)??[]).length,50);assert.match(html.body,/50 incidencias/);
  const json=await http(viewer.url+'?'+query+'&download=json');
  const nodes=JSON.parse(json.body).pages[0].report.violations[0].nodes;
  assert.equal(nodes.length,70);assert.equal(nodes[0].target[0].length,603);
});

test('viewer shutdown closes incomplete local HTTP connections',async t=>{
  const f=await fixture(t),viewer=await startHistoryViewer(f),url=new URL(viewer.url);
  const socket=createConnection({host:'127.0.0.1',port:Number(url.port)});
  t.after(()=>socket.destroy());await once(socket,'connect');
  socket.write('GET / HTTP/1.1\r\n');
  socket.on('error',error=>assert.equal(error.code,'ECONNRESET'));
  const closed=new Promise(resolve=>socket.once('close',resolve));await viewer.close();await closed;
  await assert.rejects(http(viewer.url),/ECONNREFUSED/);
});

test('viewer handles empty history, pagination and independent session tokens',async t=>{
  const f=await fixture(t),other={...f,project:{...f.project,name:'Empty'}};
  const empty=await startHistoryViewer(other);t.after(()=>empty.close());
  assert.match((await http(empty.url)).body,/Todavía no hay/);
  const sample=JSON.stringify(snapshot());
  for(let i=0;i<51;i++) await writeFile(join(f.root,projectKey(f.project),`2025-01-01T00-00-00-000Z_00000000-0000-4000-8000-${String(i).padStart(12,'0')}.json`),sample);
  const viewer=await startHistoryViewer(f);t.after(()=>viewer.close());
  const first=await http(viewer.url),second=await http(viewer.url+'?page=2');
  assert.equal((first.body.match(/class="run-id"/g)??[]).length,50);
  assert.equal((second.body.match(/class="run-id"/g)??[]).length,3);
  assert.notEqual(new URL(viewer.url).pathname,new URL(empty.url).pathname);
  assert.equal((await http(new URL(empty.url).origin+new URL(viewer.url).pathname)).status,404);
});

test('history UI works with keyboard, mobile viewport and axe in both languages', {timeout:60000},async t=>{
  const f=await fixture(t),viewer=await startHistoryViewer(f);t.after(()=>viewer.close());
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const context=await browser.newContext();
  const page=await context.newPage();
  for(const lang of ['es','en']) {
    await page.goto(viewer.url+'?lang='+lang);
    assert.equal(await page.locator('html').getAttribute('lang'),lang);
    assert.equal(await page.locator('script,img').count(),0);
    assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(v=>v.id),[]);
  }
  await page.goto(viewer.url+'?lang=es');
  if(process.env.ACCESSPILOT_VIEWER_SCREENSHOT) await page.screenshot({path:process.env.ACCESSPILOT_VIEWER_SCREENSHOT,fullPage:true});
  await page.getByRole('link',{name:'Ver ejecución'}).first().focus();await page.keyboard.press('Enter');
  await page.waitForURL(url=>url.searchParams.has('run'));
  await page.locator('summary').first().focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('details').first().getAttribute('open'),'');
  assert.equal(await page.evaluate(()=>window.compromised),undefined);
  assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(v=>v.id),[]);
  await page.goto(viewer.url+'?'+new URLSearchParams({lang:'es',before:f.first,after:f.next}));
  await page.locator('summary').first().click();
  assert.match(await page.locator('main').innerText(),/No observadas de nuevo/);
  assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(v=>v.id),[]);
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.goto(viewer.url+'?lang=en');
  await page.getByLabel('Before',{exact:true}).selectOption(f.first);
  await page.getByLabel('After',{exact:true}).selectOption(f.next);
  await page.getByRole('button',{name:'Compare',exact:true}).click();
  await page.waitForURL(url=>url.searchParams.get('before')===f.first);
  assert.equal(await page.getByRole('heading',{name:'Run comparison'}).count(),1);
});

test('CLI starts the read-only viewer without auditing configured URLs', {timeout:20000},async t=>{
  const f=await fixture(t),config=join(f.root,'project.json');
  await writeFile(config,JSON.stringify({...f.project,urls:['https://unreachable.invalid/']}));
  const child=spawn(process.execPath,[fileURLToPath(new URL('../src/cli.js',import.meta.url)),'--project',config,'--history',f.root,'--serve-history'],{windowsHide:true});
  let errorOutput='';child.stderr.on('data',chunk=>errorOutput+=chunk);
  t.after(()=>{child.kill();});
  const url=await new Promise((resolve,reject)=>{
    let output='';child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{64}\//);if(match) resolve(match[0]);});
    child.on('error',reject);child.on('exit',code=>reject(new Error(`Viewer exited ${code}: ${errorOutput}`)));
  });
  assert.equal((await http(url)).status,200);
  assert.equal((await listHistory(f.root,f.project)).length,2);
});
