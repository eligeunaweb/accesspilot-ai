import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, copyFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPage } from '../src/audit.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
function run(args, script = cli) {
  return new Promise((resolve,reject) => {
    const child=spawn(process.execPath,[script,...args], {windowsHide:true});
    let out='', err='';
    child.stdout.on('data',d=>out+=d); child.stderr.on('data',d=>err+=d);
    child.on('error',reject); child.on('close',code=>resolve({code,out,err}));
  });
}
test('real browser integration and CLI E2E', {timeout:120000}, async t => {
  const server=createServer((req,res)=>{
    if(req.url==='/slow'){const timer=setTimeout(()=>res.end('slow'),5000);timer.unref();return;}
    if(req.url==='/missing'){res.writeHead(404);res.end('missing');return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><button></button></main></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const dir=await mkdtemp(join(tmpdir(),'accesspilot-'));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${server.address().port}`;
  await t.test('axe detects real missing alternative text and button names',async()=>{
    const r=await auditPage(url);
    assert.ok(r.violations.some(v=>v.id==='image-alt'));
    assert.ok(r.violations.some(v=>v.id==='button-name'));
  });
  await t.test('JSON and fail-on-violations exit 1',async()=>{
    const r=await run([url,'--format','json','--fail-on-violations']);
    assert.equal(r.code,1,r.err);assert.ok(JSON.parse(r.out).violations.length>0);
  });
  await t.test('HTML file output and success exit 0',async()=>{
    const output=join(dir,'report.html'); const r=await run([url,'--format','html','--output',output]);
    assert.equal(r.code,0,r.err);assert.ok((await readFile(output,'utf8')).includes('<caption>'));
  });
  await t.test('text output remains compatible',async()=>{
    const r=await run([url]);assert.equal(r.code,0,r.err);assert.match(r.out,/IMAGE|image-alt/);
  });
  await t.test('HTTP errors return 2',async()=>{
    const r=await run([url+'/missing']);assert.equal(r.code,2);assert.match(r.err,/404/);
  });
  await t.test('output errors return 2',async()=>{
    const r=await run([url,'--output',join(dir,'absent','report.json')]);assert.equal(r.code,2);assert.match(r.err,/ENOENT/);
  });
  await t.test('invalid URL returns 2 without browser',async()=>{
    assert.equal((await run(['file:///secret'])).code,2);
  });
  await t.test('project CLI audits two sites and preserves a failed target',async()=>{
    const second=createServer(server.listeners('request')[0]);
    await new Promise(resolve=>second.listen(0,'127.0.0.1',resolve));
    try {
      const config=join(dir,'project.json');
      await writeFile(config,JSON.stringify({schemaVersion:1,name:'Multi-site',concurrency:2,
        urls:[url,`http://127.0.0.1:${second.address().port}`,url+'/missing']}));
      const r=await run(['--project',config,'--format','json','--fail-on-violations']);
      assert.equal(r.code,2,r.err);const data=JSON.parse(r.out);
      assert.equal(data.totals.succeeded,2);assert.equal(data.totals.failed,1);
      assert.match(data.pages[2].error,/404/);assert.ok(data.totals.affectedElements>=4);
    } finally {await new Promise(resolve=>second.close(resolve));}
  });
  await t.test('real navigation timeout returns a failed audit',async()=>{
    await assert.rejects(auditPage(url+'/slow',{timeoutMs:1000}),/timed out|Timeout/);
  });
  await t.test('real cancellation interrupts navigation',async()=>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),1000);
    try {await assert.rejects(auditPage(url+'/slow',{signal:controller.signal}),/cancelled/);}
    finally {clearTimeout(timer);}
  });
  await t.test('Spanish CSV CLI contains curated fixes',async()=>{
    const r=await run([url,'--format','csv','--lang','es']);
    assert.equal(r.code,0,r.err);assert.match(r.out,/"image-alt"/);assert.match(r.out,/texto alternativo/);
  });
  await t.test('entrypoint supports spaces, percent and hash',async()=>{
    const script=fileURLToPath(new URL('../src/entry # % test.js',import.meta.url));
    try {await copyFile(cli,script);const r=await run(['--help'],script);assert.equal(r.code,0,r.err);assert.match(r.out,/Usage:/);}
    finally {await rm(script,{force:true});}
  });
});

