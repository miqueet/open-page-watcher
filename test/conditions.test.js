import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionMet, firstNumber } from '../src/lib/conditions.js';

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
