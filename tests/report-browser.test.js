import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { htmlReport, summarize } from '../src/report.js';

test('HTML report works with keyboard, contains escaped content and passes axe', {timeout:30000},async t=>{
  const result={testEngine:{name:'axe-core',version:'fixture'},violations:[{
    id:'image-alt',impact:'serious',help:'Image name',tags:['wcag111'],description:'Review alternative text',
    helpUrl:'javascript:window.compromised=true',nodes:[{target:['<script>window.compromised=true</script>'],html:'<img src=x onerror="window.compromised=true">',failureSummary:'Untrusted evidence'}]
  }],passes:[],incomplete:[],inapplicable:[]};
  const html=htmlReport(summarize(result,'https://example.org',{language:'es'}));
  const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  const summary=page.locator('summary').first();await summary.focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('details').first().getAttribute('open'),'');
  assert.equal(await page.evaluate(()=>window.compromised),undefined);
  assert.equal(await page.locator('script').count(),0);
  const analyzed=await new AxeBuilder({page}).analyze();
  assert.deepEqual(analyzed.violations.map(v=>v.id),[]);
});
