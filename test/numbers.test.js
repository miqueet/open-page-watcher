import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNumber, numberIn, parseThreshold } from '../src/lib/numbers.js';

test('readNumber reads prices in common formats', () => {
  assert.deepEqual(readNumber('Now $1,299.99!'), { value: 1299.99, raw: '$1,299.99' });
  assert.deepEqual(readNumber('Prix : 1.299,00 €'), { value: 1299, raw: '1.299,00' });
  assert.deepEqual(readNumber('€ 12,50'), { value: 12.5, raw: '€ 12,50' });
  assert.equal(numberIn('1,299 left'), 1299);
  assert.equal(numberIn('1.299.000 views'), 1299000);
  assert.equal(numberIn('1.2K followers'), 1200);
  assert.equal(numberIn('Market cap $3.4B'), 3.4e9);
  assert.equal(numberIn('2bn users'), 2e9);
  assert.equal(numberIn('Version 1.2.3'), 1.2);
  assert.equal(numberIn('none'), null);
});

test('signs and units', () => {
  assert.equal(numberIn('-5 degrees'), -5);
  assert.equal(numberIn('−7 °C'), -7);
  assert.equal(numberIn('$-3'), -3);
  assert.equal(numberIn('A-5'), 5);
  assert.equal(numberIn('pages 3-5'), 3);
  assert.equal(numberIn('2026-11-11'), 2026);
  assert.equal(numberIn('5kg'), 5); // a unit, not "thousand"
  assert.equal(numberIn('5 kg'), 5);
});

test('a regex can say which number to read', () => {
  const text = 'Rating 4.5 (1,024 reviews)\nPrice: $1,199.00\nWas: $1,299.00';
  assert.equal(numberIn(text), 4.5);
  assert.equal(numberIn(text, 'Price:\\s*(\\S+)'), 1199);
  assert.equal(numberIn(text, 'was:.*'), 1299); // no group: the whole match, any case
  assert.equal(numberIn(text, '\\(([\\d,]+) reviews'), 1024);
  assert.equal(numberIn(text, 'Shipping: (\\S+)'), null);
  assert.equal(numberIn(text, '('), null); // invalid regex
  // A currency sign just outside the group still shows in alerts.
  assert.deepEqual(readNumber('Price $1,199', '\\$(\\S+)'), { value: 1199, raw: '$1,199' });
});

test('thresholds can be typed the way people write them', () => {
  assert.equal(parseThreshold('1200'), 1200);
  assert.equal(parseThreshold('$1,200'), 1200);
  assert.equal(parseThreshold('1200 dollars'), 1200);
  assert.equal(parseThreshold('1.2k'), 1200);
  assert.ok(Number.isNaN(parseThreshold('cheap')));
});
