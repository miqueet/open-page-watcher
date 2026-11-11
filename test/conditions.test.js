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

test('changedText keeps multi-word changes together and splits separate ones', async () => {
  const { changedText } = await import('../src/lib/conditions.js');
  assert.deepEqual(changedText('In stock', 'Only 3 left'), { added: 'Only 3 left', deleted: 'In stock' });
  assert.deepEqual(changedText('Price is 10 dollars today', 'Price is 12 dollars now'), { added: '12\nnow', deleted: '10\ntoday' });
});

test('change size rules', async () => {
  const { changeSize } = await import('../src/lib/conditions.js');
  const old = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
  const small = old.replace('c', 'C');
  const big = 'A\nB\nC\nD\ne\nf\ng\nh\ni\nj';
  assert.deepEqual(changeSize(old, small), { lines: 1, pct: 10 });
  const pct = { match: 'all', rules: [{ type: 'changedPctAbove', value: '20', on: 'text' }] };
  assert.equal(conditionMet(pct, old, small), false);
  assert.equal(conditionMet(pct, old, big), true);
  const lines = { match: 'all', rules: [{ type: 'changedLinesAbove', value: '1', on: 'text' }] };
  assert.equal(conditionMet(lines, old, small), false);
  assert.equal(conditionMet(lines, old, big), true);
});

test('number thresholds accept typed amounts and a which-number regex', () => {
  const one = (rule, a, b) => conditionMet({ rules: [{ on: 'text', ...rule }] }, a, b);
  assert.equal(one({ type: 'numberBelow', value: '1200 dollars' }, '$1,299', '$1,199'), true);
  assert.equal(one({ type: 'numberBelow', value: '$1,200' }, '$1,199', '$1,250'), false);
  assert.equal(one({ type: 'numberBelow', value: 'cheap' }, '$1,299', '$1,199'), false);
  const page = (price) => `4.5 stars, 812 reviews\nPrice: $${price}`;
  assert.equal(one({ type: 'numberBelow', value: '10' }, page('1,299'), page('1,199')), true); // reads 4.5
  assert.equal(one({ type: 'numberBelow', value: '10', find: 'Price:\\s*(\\S+)' }, page('1,299'), page('1,199')), false);
  assert.equal(one({ type: 'numberDecreased', value: '', find: 'Price:\\s*(\\S+)' }, page('1,299'), page('1,199')), true);
});

test('crossing rules alert once when the number goes past the limit', () => {
  const below = (a, b) => conditionMet({ rules: [{ type: 'numberCrossedBelow', value: '$1,200', on: 'text' }] }, a, b);
  assert.equal(below('$1,299', '$1,199'), true);
  assert.equal(below('$1,200', '$1,199'), true);
  assert.equal(below('$1,199', '$1,150'), false); // already below
  assert.equal(below('$1,150', '$1,250'), false);
  assert.equal(below('Sold out', '$1,100'), true); // a price that just appeared
  const above = (a, b) => conditionMet({ rules: [{ type: 'numberCrossedAbove', value: '100', on: 'text' }] }, a, b);
  assert.equal(above('98 in queue', '102 in queue'), true);
  assert.equal(above('102 in queue', '110 in queue'), false);
});

test('empty number values still mean 0', () => {
  const one = (type, a, b) => conditionMet({ rules: [{ type, value: '', on: 'text' }] }, a, b);
  assert.equal(one('changedLinesAbove', 'a', 'b'), true);
  assert.equal(one('numberIncreasedBy', '1', '2'), true);
});

test('numberFocus and the which-number field', async () => {
  const { numberFocus } = await import('../src/lib/conditions.js');
  const condition = { match: 'all', rules: [
    { type: 'contains', value: 'stock', on: 'text', find: 'ignored' },
    { type: 'numberCrossedBelow', value: ' $1,200 ', on: 'text', find: 'Price: (.*)' },
  ] };
  assert.equal(normalizeCondition(condition).rules[0].find, undefined);
  assert.equal(normalizeCondition(condition).rules[1].find, 'Price: (.*)');
  assert.deepEqual(numberFocus(condition), { find: 'Price: (.*)', limits: [{ below: true, n: 1200, label: '$1,200' }], numeric: true });
  assert.deepEqual(numberFocus(undefined), { find: '', limits: [], numeric: false });
});
