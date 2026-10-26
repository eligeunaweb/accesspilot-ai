import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHtml,htmlReport,summarize} from '../src/report.js';
import {parse} from '../src/args.js';
test('HTML escapes untrusted content',()=>assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;'));
test('report escapes URL and selectors',()=>{
 const report={url:'https://example.org/?x=<bad>',violations:[{id:'rule',impact:'serious',help:'test',nodes:[{target:['<script>'],failureSummary:'<img>'}]}],passes:0,incomplete:0,disclaimer:'review'};
 const html=htmlReport(report);
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('<caption>'));
});
test('summarize preserves review counts',()=>{
 const r=summarize({violations:[],passes:[{}],incomplete:[{}],inapplicable:[]},'https://example.org');
 assert.equal(r.incomplete,1);assert.equal(r.passes,1);
});
test('rejects unsafe URL protocols',()=>assert.throws(()=>parse(['file:///etc/passwd']),/http/));
test('rejects unknown options',()=>assert.throws(()=>parse(['https://example.org','--wrong']),/Unknown/));
test('parses HTML report',()=>assert.equal(parse(['https://example.org','--format','html']).format,'html'));
