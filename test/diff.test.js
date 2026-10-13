import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffArrays, diffText, addedText } from '../src/lib/diff.js';

const apply = (ops) => ({
  a: ops.filter((o) => o.op !== 'add').map((o) => o.value),
  b: ops.filter((o) => o.op !== 'del').map((o) => o.value),
});

test('diffArrays reconstructs both inputs', () => {
  const cases = [
    [[], []],
    [['a'], []],
    [[], ['a']],
    ['abcabba'.split(''), 'cbabac'.split('')],
    ['the quick brown fox'.split(' '), 'the slow brown dog jumps'.split(' ')],
  ];
  for (const [a, b] of cases) {
    const ops = diffArrays(a, b);
    assert.deepEqual(apply(ops), { a, b });
  }
});

test('diffArrays finds a minimal edit for a simple change', () => {
  const ops = diffArrays(['a', 'b', 'c'], ['a', 'x', 'c']);
  assert.deepEqual(ops.filter((o) => o.op !== 'eq'), [{ op: 'del', value: 'b' }, { op: 'add', value: 'x' }]);
});

test('diffArrays falls back to block replace for huge edits and stays correct', () => {
  const a = Array.from({ length: 5000 }, (_, i) => `a${i}`);
  const b = Array.from({ length: 5000 }, (_, i) => `b${i}`);
  const ops = diffArrays(a, b);
  assert.deepEqual(apply(ops), { a, b });
});

test('diffText refines replaced lines into word changes', () => {
  const lines = diffText('Price: $10\nIn stock', 'Price: $12\nIn stock');
  assert.equal(lines[0].type, 'mod');
  assert.deepEqual(lines[0].parts.filter((p) => p.op !== 'eq').map((p) => [p.op, p.value]), [['del', '$10'], ['add', '$12']]);
  assert.deepEqual(lines[1], { type: 'eq', text: 'In stock' });
});

test('addedText returns only new content', () => {
  assert.equal(addedText('one\ntwo', 'one\ntwo\nthree'), 'three');
  assert.equal(addedText('Price: $10', 'Price: $12'), '$12');
  assert.equal(addedText('a\nb', 'a'), '');
});
