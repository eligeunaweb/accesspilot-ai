import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import './helpers/outer-sandbox.js';
import {startWebJobTransport} from '../src/web-job-transport.js';
import {createWebJobSupervisor} from '../src/web-job-supervisor.js';

const name='<img src=x onerror="window.compromised=true">';
for(const language of ['es','en'])test(`browser pairing, keyboard/mobile controls, cancellation and private memory in ${language}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'accesspilot-connect-'));let service,browser,release,started,supervisor;
  const ready=new Promise(resolve=>started=resolve);
  try {
    service=await startWebJobTransport({workspace:{schemaVersion:1,name:'Browser',projects:[{schemaVersion:1,name,urls:['https://fixture.example']}]},directory:join(root,'jobs'),resourceDirectory:join(root,'resources'),historyRoot:join(root,'history'),imageId:'sha256:'+'a'.repeat(64)},
      {createSupervisor:async options=>supervisor=await createWebJobSupervisor(options,{auditPage:async(url,{signal})=>{started(signal);await new Promise(resolve=>release=resolve);return {schemaVersion:1,kind:'page-audit',url,engine:{name:'axe-core',version:'fixture'},violations:[]};}})});
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),urls=[],errors=[];
    page.on('request',request=>urls.push(request.url()));page.on('pageerror',error=>errors.push(error.message));
    await page.goto(service.connectionUrl+(language==='en'?'/en':''));assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(v=>v.id),[]);
    const {code}=service.createPairingCode();await page.locator('#pairing-code').fill(code);await page.locator('#pairing-code').press('Enter');
    await page.locator('#project').waitFor({state:'visible'});assert.equal(await page.locator('#project option').textContent(),name);assert.equal(await page.locator('#pairing-code').inputValue(),'');
    assert.equal(await page.evaluate(()=>window.compromised),undefined);assert.equal(await page.evaluate(()=>Boolean(document.querySelector('#project img'))),false);
    assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});assert.deepEqual(await page.context().cookies(),[]);
    await page.locator('#start').focus();await page.keyboard.press('Enter');const signal=await ready;
    await page.locator('#jobs li').waitFor();assert.equal(supervisor.inspect().admissions.length,1);
    await page.locator('#jobs button').first().click();assert.equal(signal.aborted,true);assert.equal(supervisor.inspect().queue.active,1);
    await page.getByText(language==='es'?'Cancelando: limpieza pendiente':'Cancelling: cleanup pending',{exact:true}).waitFor();release();
    await page.locator('#jobs button.secondary').click();await page.getByText(language==='es'?'Cancelada':'Cancelled',{exact:true}).waitFor();
    assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.map(v=>v.id),[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(urls.every(url=>!url.includes(code)&&!url.includes('?')));
    assert.ok(!(await page.content()).includes(code));await page.locator('#disconnect').click();await page.locator('#connect-form').waitFor({state:'visible'});
    assert.equal(await page.locator('#jobs li').count(),0);assert.deepEqual(errors,[]);
  } finally {release?.();await browser?.close();await service?.close();await rm(root,{recursive:true,force:true});}
});

test('browser retries a lost admission reply with the same key; disconnect aborts the single running job',async()=>{
  const root=await mkdtemp(join(tmpdir(),'accesspilot-retry-'));let service,browser,release,started,supervisor,calls=0;
  const ready=new Promise(resolve=>started=resolve);
  try {
    service=await startWebJobTransport({workspace:{schemaVersion:1,name:'Retry',projects:[{schemaVersion:1,name:'Retry fixture',urls:['https://fixture.example']}]},directory:join(root,'jobs'),resourceDirectory:join(root,'resources'),historyRoot:join(root,'history'),imageId:'sha256:'+'a'.repeat(64)},
      {createSupervisor:async options=>supervisor=await createWebJobSupervisor(options,{auditPage:async(url,{signal})=>{calls++;started(signal);await new Promise(resolve=>release=resolve);return {schemaVersion:1,kind:'page-audit',url,engine:{name:'axe-core',version:'fixture'},violations:[]};}})});
    browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage(),keys=[];
    await page.route('**/api/v1/jobs',async route=>{
      keys.push(route.request().postDataJSON().requestId);
      if(keys.length===1){const admitted=await route.fetch();assert.equal(admitted.status(),202);await route.abort('failed');}else await route.continue();
    });
    await page.goto(service.connectionUrl+'/en');const {code}=service.createPairingCode();await page.locator('#pairing-code').fill(code);await page.locator('#pairing-code').press('Enter');
    await page.locator('#start').click();const signal=await ready;await page.getByRole('button',{name:'Retry creation',exact:true}).waitFor();
    assert.equal(await page.locator('#project').isDisabled(),true);await page.getByRole('button',{name:'Retry creation',exact:true}).click();await page.locator('#jobs li').waitFor();
    assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(calls,1);assert.equal(supervisor.inspect().admissions.length,1);
    await page.locator('#disconnect').click();await page.locator('#connect-form').waitFor({state:'visible'});assert.equal(signal.aborted,true);assert.equal(supervisor.inspect().queue.active,1);
    release();const job=supervisor.inspect().admissions[0];assert.equal((await supervisor.wait(job.id)).state,'cancelled');
    await page.reload();assert.equal(await page.locator('#jobs li').count(),0);assert.equal(await page.locator('#pairing-code').inputValue(),'');
  } finally {release?.();await browser?.close();await service?.close();await rm(root,{recursive:true,force:true});}
});

test('without JavaScript the connection form cannot place a capability in a navigation URL',async()=>{
  let service,browser,model;
  try {
    const {createWebJobContract}=await import('../src/web-job-contract.js');
    service=await startWebJobTransport({workspace:{schemaVersion:1,name:'No script',projects:[{schemaVersion:1,name:'Fixture',urls:['https://fixture.example']}]}},{createSupervisor:async options=>model=createWebJobContract(options)});
    browser=await chromium.launch({headless:true});const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage(),urls=[];
    page.on('request',request=>urls.push(request.url()));await page.goto(service.connectionUrl);
    const {code}=service.createPairingCode();await page.locator('#pairing-code').fill(code);
    const blocked=page.waitForEvent('console',{predicate:entry=>entry.text().includes('form-action')});
    await page.locator('button[type=submit]').first().click({noWaitAfter:true});await blocked;
    assert.equal(page.url(),service.connectionUrl);assert.ok(urls.every(url=>!url.includes(code)&&!url.includes('?')));assert.equal(model.snapshot().sessions,0);
  } finally {await browser?.close();await service?.close();}
});
