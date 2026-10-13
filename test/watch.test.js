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
  assert.equal(w.notify, true);
  assert.match(w.id, /^[0-9a-f-]{36}$/);
});

test('ignores runtime state from untrusted input', () => {
  const w = sanitizeWatch({ url: 'https://example.com', unread: true, lastError: 'x', lastCheckedAt: 5 });
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
