import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeChange, inQuietHours, shouldHold, readyToFlush, queueAlert, digestMessage,
} from '../src/lib/alerts.js';

test('summarizeChange describes number changes with the original formatting', () => {
  assert.equal(summarizeChange('Price: $1,299.99', 'Price: $1,199.00'), 'Went down from $1,299.99 to $1,199.00 (−7.8%)');
  assert.equal(summarizeChange('3 left', '10 left'), 'Went up from 3 to 10 (+233.3%)');
  assert.equal(summarizeChange('0 items', '4 items'), 'Went up from 0 to 4');
});

test('summarizeChange ignores an unrelated first number on long pages', () => {
  const page = (n, extra) => `Copyright ${n} ${'filler '.repeat(60)}${extra}`;
  assert.equal(summarizeChange(page(2025, 'Old headline'), page(2026, 'New headline')).startsWith('Now:'), true);
  // Long text where only the number changed still gets the number story.
  assert.equal(summarizeChange(page(5, 'x'), page(7, 'x')), 'Went up from 5 to 7 (+40.0%)');
});

test('summarizeChange falls back to added and removed text', () => {
  assert.equal(summarizeChange('a\nb', 'a\nb\nIn stock'), 'Added: In stock');
  assert.equal(summarizeChange('a\nSale ends today', 'a'), 'Removed: Sale ends today');
  assert.equal(summarizeChange('Status: open', 'Status: closed'), 'Now: closed · Was: open');
  assert.ok(summarizeChange('x', 'y'.repeat(1000)).length <= 300);
});

const quiet = { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '07:00' };
const at = (h, m = 0) => new Date(2026, 9, 13, h, m).getTime(); // a Tuesday, local time

test('quiet hours run overnight', () => {
  const settings = { quietHours: quiet, delivery: { mode: 'instant', digestEveryMinutes: 180 } };
  assert.equal(inQuietHours(settings, new Date(at(23))), true);
  assert.equal(inQuietHours(settings, new Date(at(6, 59))), true);
  assert.equal(inQuietHours(settings, new Date(at(7))), false);
  assert.equal(inQuietHours({ quietHours: { ...quiet, enabled: false } }, new Date(at(23))), false);
  assert.equal(shouldHold(settings, at(23)), true);
  assert.equal(shouldHold(settings, at(12)), false);
});

test('held alerts go out after quiet hours, or on the digest schedule', () => {
  const instant = { quietHours: quiet, delivery: { mode: 'instant', digestEveryMinutes: 180 } };
  const pending = [{ id: 'a', name: 'A', summary: 's', t: at(23), count: 1 }];
  assert.equal(readyToFlush(instant, pending, 0, at(3)), false);
  assert.equal(readyToFlush(instant, pending, 0, at(7, 1)), true);
  assert.equal(readyToFlush(instant, [], 0, at(12)), false);

  const digest = { quietHours: { ...quiet, enabled: false }, delivery: { mode: 'digest', digestEveryMinutes: 180 } };
  assert.equal(shouldHold(digest, at(12)), true);
  assert.equal(readyToFlush(digest, pending, at(10), at(12)), false);
  assert.equal(readyToFlush(digest, pending, at(9), at(12)), true);
  assert.equal(readyToFlush(digest, pending, 0, at(12)), true);
});

test('queueAlert keeps one entry per watch and counts changes', () => {
  let q = queueAlert([], { id: 'a', name: 'A', summary: 'one', t: 1 });
  q = queueAlert(q, { id: 'b', name: 'B', summary: 'two', t: 2 });
  q = queueAlert(q, { id: 'a', name: 'A', summary: 'three', t: 3 });
  assert.deepEqual(q.map((p) => [p.id, p.summary, p.count, p.since]), [['b', 'two', 1, 2], ['a', 'three', 2, 1]]);
  assert.equal(queueAlert(q, { id: 'c', t: 4 }, 2).length, 2);
});

test('digestMessage lists the newest changes first', () => {
  const one = digestMessage([{ id: 'a', name: 'Shop', summary: 'Went down from 5 to 4', t: 1, count: 3 }]);
  assert.deepEqual(one, { title: 'Changed: Shop (3 changes)', message: 'Went down from 5 to 4' });
  const many = digestMessage([
    { id: 'a', name: 'Shop', summary: 'Went down', t: 1, count: 1 },
    { id: 'b', name: 'News', summary: 'Added: Hello', t: 2, count: 1 },
  ]);
  assert.equal(many.title, '2 watches changed');
  assert.equal(many.message, 'News: Added: Hello\nShop: Went down');
});
