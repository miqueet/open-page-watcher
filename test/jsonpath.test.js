import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonPath, selectJson, jsonValuesText } from '../src/lib/jsonpath.js';

const data = {
  store: { name: 'Shop', 'odd key': [1, 2, 3] },
  items: [{ name: 'A', price: 10 }, { name: 'B', price: 12.5 }, { name: 'C' }],
};

test('selects keys, indexes and wildcards', () => {
  assert.deepEqual(selectJson(data, '$.store.name'), ['Shop']);
  assert.deepEqual(selectJson(data, 'store.name'), ['Shop']);
  assert.deepEqual(selectJson(data, '$.items[*].price'), [10, 12.5]);
  assert.deepEqual(selectJson(data, '$.items[-1].name'), ['C']);
  assert.deepEqual(selectJson(data, "$.store['odd key'][1]"), [2]);
  assert.deepEqual(selectJson(data, '$["store"].name'), ['Shop']);
  assert.equal(selectJson(data, '$.store.*').length, 2);
  assert.deepEqual(selectJson(data, '$.missing.x'), []);
  assert.deepEqual(selectJson(data, '$'), [data]);
});

test('does not walk into prototypes', () => {
  assert.deepEqual(selectJson({}, '$.constructor'), []);
  assert.deepEqual(selectJson({}, '$.__proto__'), []);
});

test('rejects filters, scripts and recursive descent', () => {
  for (const p of ['$..price', '$.items[?(@.price>1)]', '$.items[(@.length-1)]', '$.a b', '$.items[0:2]']) {
    assert.throws(() => parseJsonPath(p), /JSON path/, p);
  }
});

test('formats values one per line', () => {
  assert.equal(jsonValuesText(['a', 1, null, true]), 'a\n1\nnull\ntrue');
  assert.equal(jsonValuesText([{ a: 1 }]), '{\n  "a": 1\n}');
});
