import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/args.js';
for (const args of [[], ['https://u:p@example.org'], ['https://example.org','https://other.org'], ['https://example.org','--format'], ['https://example.org','--format','invalid']]) {
  test(`reject invalid arguments: ${args.join(' ') || '(empty)'}`,()=>assert.throws(()=>parse(args)));
}
test('preserve output paths with spaces',()=>assert.equal(parse(['https://example.org','--output','my report.html']).output,'my report.html'));

test('baseline requires an explicit project',()=>assert.throws(()=>parse(['https://example.org','--baseline','before.json']),/requires --project/));
