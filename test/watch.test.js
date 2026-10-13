import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeWatch, postProcess, originPattern, isDue, exportableWatch } from '../src/lib/watch.js';

test('rejects non-http URLs', () => {
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'chrome://settings', 'data:text/html,hi', '']) {
    assert.throws(() => sanitizeWatch({ url }), /http/);
  }
});

test('fills defaults and clamps values', () => {
  const w = sanitizeWatch({ url: 'https://example.com/a', intervalMinutes: 0, historyLimit: 99999, mode: 'evil' });
  assert.equal(w.name, 'example.com');
  assert.equal(w.intervalMinutes, 1);
  assert.equal(w.historyLimit, 200);
  assert.equal(w.mode, 'fetch');
  assert.equal(w.sendCookies, false);
  assert.equal(w.autoCookies, true);
  assert.equal(w.onSignIn, 'notify');
  assert.equal(w.notify, true);
  assert.match(w.id, /^[0-9a-f-]{36}$/);
});

test('sign-in options are cleaned', () => {
  const w = sanitizeWatch({ url: 'https://example.com', autoCookies: false, onSignIn: 'tab' });
  assert.equal(w.autoCookies, false);
  assert.equal(w.onSignIn, 'tab');
  assert.equal(sanitizeWatch({ url: 'https://example.com', onSignIn: 'explode' }).onSignIn, 'notify');
});

test('ignores runtime state from untrusted input', () => {
  const w = sanitizeWatch({ url: 'https://example.com', unread: true, lastError: 'x', lastCheckedAt: 5, signInNeeded: true, signInHandled: true });
  assert.equal(w.signInNeeded, false);
  assert.equal(w.signInHandled, false);
  assert.equal(w.unread, false);
  assert.equal(w.lastError, '');
  assert.equal(w.lastCheckedAt, 0);
});

test('rejects invalid regex', () => {
  assert.throws(() => sanitizeWatch({ url: 'https://example.com', regexFilter: '(' }));
});

test('selectors are cleaned', () => {
  const w = sanitizeWatch({ url: 'https://example.com', selectors: [{ expr: ' #a ' }, { type: 'xpath', expr: '//p' }, { expr: '' }, null] });
  assert.deepEqual(w.selectors, [{ type: 'css', expr: '#a' }, { type: 'xpath', expr: '//p' }]);
});

test('postProcess keeps regex matches or first group', () => {
  assert.equal(postProcess('a $10 b $20', { regexFilter: '\\$\\d+' }), '$10\n$20');
  assert.equal(postProcess('id=7; id=9', { regexFilter: 'id=(\\d)' }), '7\n9');
  assert.equal(postProcess('x', { regexFilter: '' }), 'x');
});

test('originPattern and isDue', () => {
  assert.equal(originPattern('https://a.example.com:8443/x?y'), 'https://a.example.com/*');
  const w = { paused: false, intervalMinutes: 10, lastCheckedAt: 0 };
  assert.equal(isDue(w, Date.now()), true);
  assert.equal(isDue({ ...w, lastCheckedAt: Date.now() }, Date.now()), false);
  assert.equal(isDue({ ...w, paused: true }, Date.now()), false);
});

test('export strips runtime state', () => {
  const w = sanitizeWatch({ url: 'https://example.com' });
  const e = exportableWatch(w);
  assert.equal('unread' in e, false);
  assert.equal('lastError' in e, false);
});

test('schedule: time windows', async () => {
  const { inWindow } = await import('../src/lib/watch.js');
  const sched = (start, end, days = [1, 2, 3, 4, 5]) => ({ window: { enabled: true, days, start, end } });
  const at = (day, h, m = 0) => new Date(2026, 9, 11 + day, h, m); // 2026-10-11 is a Sunday
  assert.equal(inWindow(sched('09:00', '17:00'), at(1, 10)), true);
  assert.equal(inWindow(sched('09:00', '17:00'), at(1, 17)), false);
  assert.equal(inWindow(sched('09:00', '17:00'), at(0, 10)), false); // Sunday
  // Overnight window on Monday night covers early Tuesday.
  assert.equal(inWindow(sched('22:00', '06:00', [1]), at(1, 23)), true);
  assert.equal(inWindow(sched('22:00', '06:00', [1]), at(2, 3)), true);
  assert.equal(inWindow(sched('22:00', '06:00', [1]), at(2, 23)), false);
  assert.equal(inWindow({ window: { enabled: false } }, at(0, 3)), true);
});

test('schedule: random intervals and due checks', async () => {
  const { nextCheckTime, isDue } = await import('../src/lib/watch.js');
  const w = sanitizeWatch({ url: 'https://example.com', intervalMinutes: 10, schedule: { type: 'random', randomMaxMinutes: 30 } });
  assert.equal(nextCheckTime(w, 0, () => 0), 10 * 60_000);
  assert.equal(nextCheckTime(w, 0, () => 1), 30 * 60_000);
  const plain = sanitizeWatch({ url: 'https://example.com', intervalMinutes: 10 });
  assert.equal(nextCheckTime(plain, 0), 10 * 60_000);
  const now = Date.now();
  assert.equal(isDue({ ...plain, nextCheckAt: now + 60_000 }, now), false);
  assert.equal(isDue({ ...plain, nextCheckAt: now - 1 }, now), true);
});

test('random max is never below the interval, labels are cleaned', () => {
  const w = sanitizeWatch({
    url: 'https://example.com', intervalMinutes: 60, schedule: { type: 'random', randomMaxMinutes: 5 },
    labels: [' Work ', 'work', 'prices', 7, ''],
  });
  assert.equal(w.schedule.randomMaxMinutes, 60);
  assert.deepEqual(w.labels, ['Work', 'prices']);
});

test('selector attributes and excludes are validated', () => {
  const w = sanitizeWatch({
    url: 'https://example.com',
    selectors: [{ expr: 'a', attr: 'href' }, { expr: 'b', attr: 'on"click' }],
    excludes: [{ expr: '.ad', attr: 'href' }],
  });
  assert.deepEqual(w.selectors, [{ type: 'css', expr: 'a', attr: 'href' }, { type: 'css', expr: 'b' }]);
  assert.deepEqual(w.excludes, [{ type: 'css', expr: '.ad' }]);
});

test('sameDocument ignores fragments only', async () => {
  const { sameDocument } = await import('../src/lib/watch.js');
  assert.equal(sameDocument('https://a.com/x#1', 'https://a.com/x#2'), true);
  assert.equal(sameDocument('https://a.com/x?a=1', 'https://a.com/x?a=2'), false);
});

test('ignore options normalize what counts as a change', async () => {
  const { comparisonKey } = await import('../src/lib/watch.js');
  const a = 'Updated Oct 12, 2026 at 9:15 am. Price $10. 3 minutes ago';
  const b = 'Updated Oct 13, 2026 at 10:02 am. Price $10. 1 hour ago';
  assert.notEqual(comparisonKey(a), comparisonKey(b));
  assert.equal(comparisonKey(a, { dates: true }), comparisonKey(b, { dates: true }));
  assert.notEqual(comparisonKey('Price $10', { dates: true }), comparisonKey('Price $12', { dates: true }));
  assert.equal(comparisonKey('Price $10', { numbers: true }), comparisonKey('Price $12', { numbers: true }));
  assert.equal(comparisonKey('In  Stock\n', { whitespace: true, case: true }), comparisonKey('in stock', { whitespace: true, case: true }));
  assert.deepEqual(sanitizeWatch({ url: 'https://e.com', ignore: { dates: 1, numbers: true } }).ignore,
    { case: false, whitespace: false, numbers: true, dates: false });
});
