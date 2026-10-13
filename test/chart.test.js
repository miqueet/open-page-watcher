import test from 'node:test';
import assert from 'node:assert/strict';
import { numberSeries, niceTicks, formatNumber } from '../src/ui/chart.js';

test('numberSeries reads the first number of each version', () => {
  const history = [
    { t: 1, text: 'Price: $1,299.99' },
    { t: 2, text: 'Sold out' },
    { t: 3, text: 'Price: $1,199.00' },
  ];
  assert.deepEqual(numberSeries(history), [{ t: 1, value: 1299.99 }, { t: 3, value: 1199 }]);
});

test('numberSeries needs two numbers, and short text or a number rule', () => {
  assert.equal(numberSeries([{ t: 1, text: '5' }, { t: 2, text: 'none' }]), null);
  const long = [{ t: 1, text: `1 ${'x'.repeat(400)}` }, { t: 2, text: `2 ${'x'.repeat(400)}` }];
  assert.equal(numberSeries(long), null);
  assert.equal(numberSeries(long, { numericRule: true }).length, 2);
});

test('niceTicks covers the range with round steps', () => {
  assert.deepEqual(niceTicks(1199, 1299.99), [1150, 1200, 1250, 1300]);
  assert.deepEqual(niceTicks(0, 10), [0, 2.5, 5, 7.5, 10]);
  const flat = niceTicks(50, 50);
  assert.ok(flat[0] < 50 && flat[flat.length - 1] > 50);
  assert.deepEqual(niceTicks(NaN, 1), []);
});

test('formatNumber compacts large values', () => {
  assert.equal(formatNumber(1234.5), '1,234.5');
  assert.equal(formatNumber(25000), '25K');
});
