import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionMet, firstNumber, normalizeCondition } from '../src/lib/conditions.js';

test('firstNumber handles currency and separators', () => {
  assert.equal(firstNumber('Now $1,299.99!'), 1299.99);
  assert.equal(firstNumber('-5 degrees'), -5);
  assert.equal(firstNumber('none'), null);
});

test('conditions', () => {
  const c = (type, value, a, b) => conditionMet({ type, value }, a, b);
  assert.equal(c('any', '', 'a', 'b'), true);
  assert.equal(c('contains', 'IN STOCK', 'Sold out', 'In stock now'), true);
  assert.equal(c('notContains', 'sold out', 'Sold out', 'In stock'), true);
  assert.equal(c('addedContains', 'job', 'Jobs:\nA', 'Jobs:\nA\nNew job B'), true);
  assert.equal(c('addedContains', 'jobs', 'Jobs:\nA', 'Jobs:\nA\nB'), false);
  assert.equal(c('regex', 'v\\d+\\.\\d+', '', 'Release v2.1'), true);
  assert.equal(c('regex', '(', '', 'x'), false);
  assert.equal(c('numberBelow', '100', '$120', '$99'), true);
  assert.equal(c('numberAbove', '100', '$99', '$120'), true);
  assert.equal(c('numberDecreased', '', '$120', '$99'), true);
  assert.equal(c('numberIncreased', '', '$120', '$99'), false);
});

test('rule lists combine with all / any', () => {
  const all = { match: 'all', rules: [{ type: 'contains', value: 'stock', on: 'text' }, { type: 'numberBelow', value: '100', on: 'text' }] };
  assert.equal(conditionMet(all, 'Sold out $120', 'In stock $99'), true);
  assert.equal(conditionMet(all, 'Sold out $120', 'In stock $120'), false);
  assert.equal(conditionMet({ ...all, match: 'any' }, 'Sold out $120', 'In stock $120'), true);
  assert.equal(conditionMet({ match: 'all', rules: [] }, 'a', 'b'), true);
});

test('text rule types and sources', () => {
  const one = (type, value, a, b, on = 'text', earlier) => conditionMet({ rules: [{ type, value, on }] }, a, b, earlier);
  assert.equal(one('startsWith', 'open', '', '  Open now'), true);
  assert.equal(one('endsWith', 'now', '', 'Open now '), true);
  assert.equal(one('empty', '', 'x', '   '), true);
  assert.equal(one('notEmpty', '', '', 'x'), true);
  assert.equal(one('lengthBelow', '5', '', 'abc'), true);
  assert.equal(one('lengthAbove', '5', '', 'abc'), false);
  assert.equal(one('notRegex', 'error', '', 'all good'), true);
  assert.equal(one('contains', 'gone', 'a\nitem gone', 'a', 'deleted'), true);
  assert.equal(one('contains', 'gone', 'a', 'a\nitem gone', 'deleted'), false);
  assert.equal(one('contains', 'was', 'it was', 'it is', 'previous'), true);
  assert.equal(one('neverSeen', '', 'b', 'a', 'text', ['a', 'b']), false);
  assert.equal(one('neverSeen', '', 'b', 'c', 'text', ['a', 'b']), true);
});

test('numeric change rules', () => {
  const one = (type, value, a, b) => conditionMet({ rules: [{ type, value, on: 'text' }] }, a, b);
  assert.equal(one('numberIncreasedBy', '10', '$100', '$111'), true);
  assert.equal(one('numberIncreasedBy', '10', '$100', '$105'), false);
  assert.equal(one('numberDecreasedBy', '10', '$100', '$80'), true);
  assert.equal(one('numberIncreasedPct', '20', '$100', '$125'), true);
  assert.equal(one('numberDecreasedPct', '20', '$100', '$85'), false);
  assert.equal(one('numberDecreasedPct', '20', '$100', '$75'), true);
});

test('v0.1 conditions are migrated', () => {
  assert.deepEqual(normalizeCondition({ type: 'addedContains', value: 'job' }),
    { match: 'all', rules: [{ type: 'contains', value: 'job', on: 'added' }] });
  assert.deepEqual(normalizeCondition({ type: 'any', value: '' }), { match: 'all', rules: [] });
  assert.deepEqual(normalizeCondition({ type: 'numberDecreased' }),
    { match: 'all', rules: [{ type: 'numberDecreased', value: '', on: 'text' }] });
  assert.deepEqual(normalizeCondition({ match: 'any', rules: [{ type: 'bogus' }, { type: 'empty', on: 'nope' }] }),
    { match: 'any', rules: [{ type: 'empty', value: '', on: 'text' }] });
});
