import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, wcagCriteria, csvCell, csvReport, htmlReport } from '../src/report.js';
import { recommendation, languageCode } from '../src/i18n.js';
import { renderProject } from '../src/project-report.js';
const rule={id:'image-alt',impact:'critical',help:'Image needs an alternative',description:'Description',helpUrl:'javascript:alert(1)',tags:['wcag111','wcag2a','wcag111','wcag2411'],
  nodes:[{target:['img'],html:'<img onerror="alert(1)">',failureSummary:'=HYPERLINK("https://evil")'}]};
export const results={testEngine:{name:'axe-core',version:'fixture'},violations:[rule],incomplete:[{...rule,id:'unknown-rule',impact:null}],passes:[],inapplicable:[]};
test('WCAG criteria use only criterion tags, deduplicate and sort numerically',()=>{
  assert.deepEqual(wcagCriteria(['wcag2a','wcag22aa','best-practice','wcag111','wcag2411','wcag241','wcag111']),['1.1.1','2.4.1','2.4.11']);
});
test('preserve engine provenance and full incomplete evidence',()=>{
  const report=summarize(results,'https://example.org',{language:'es'});
  assert.deepEqual(report.engine,{name:'axe-core',version:'fixture'});
  assert.equal(report.incomplete,1);assert.equal(report.incompleteDetails[0].nodes[0].html,rule.nodes[0].html);
  assert.equal(report.violations[0].recommendation.language,'es');assert.equal(report.violations[0].recommendation.kind,'curated');
  assert.equal(report.incompleteDetails[0].recommendation.kind,'general');
  assert.match(report.disclaimer,/teclado/);
});
for (const payload of ['=1+1','+cmd','-1+2','@SUM(A1)','  =1','\t=1','\r1','\n1','\u0001=1']) {
  test(`CSV neutralizes formula prefix ${JSON.stringify(payload)}`,()=>assert.ok(csvCell(payload).startsWith('"\'')));
}
test('CSV doubles quotes, preserves line breaks and exports review evidence',()=>{
  assert.equal(csvCell('a,"b"\nc'),'"a,""b""\nc"');
  const csv=csvReport(summarize(results,'https://example.org'));
  assert.match(csv,/"review"/);assert.match(csv,/"violation"/);assert.ok(csv.includes('"\'=HYPERLINK'));
  assert.ok(csv.endsWith('\r\n'));
});
test('HTML is script-free, escapes evidence and blocks unsafe rule links',()=>{
  const html=htmlReport(summarize(results,'https://example.org',{language:'es'}));
  assert.ok(html.includes('lang="es"'));assert.ok(html.includes('<details>'));
  assert.ok(html.includes('Corrección recomendada'));assert.ok(html.includes('1.1.1, 2.4.11'));
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('<script'));assert.ok(html.includes('Content-Security-Policy'));
});
test('invalid languages rejected without coercion',()=>{
  for(const input of ['fr',null,[],['en'],{},'__proto__']) assert.throws(()=>languageCode(input));
  assert.equal(recommendation('constructor','es').kind,'general');
});
test('project CSV includes failed pages instead of hiding untested targets',()=>{
  const report=summarize(results,'https://example.org');
  const csv=renderProject({project:{name:'X'},pages:[{report},{status:'failed',url:'https://failed.org',error:'=bad'}]},'csv');
  assert.match(csv,/failed.org/);assert.ok(csv.includes('"\'=bad"'));assert.match(csv,/"review"/);
});
