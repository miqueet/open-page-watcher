import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePolicy, checkSiteAllowed, applyPolicy, isManaged } from '../src/lib/policy.js';

test('no policy allows everything', () => {
  const p = normalizePolicy({});
  assert.equal(isManaged(p), false);
  checkSiteAllowed(p, 'https://anything.example.org/x');
});

test('allowed and blocked sites, including subdomains', () => {
  const p = normalizePolicy({ allowedSites: ['example.com', '*.intranet.corp', 'https://docs.vendor.io/path'], blockedSites: ['secret.example.com'] });
  checkSiteAllowed(p, 'https://example.com/a');
  checkSiteAllowed(p, 'https://www.example.com/a');
  checkSiteAllowed(p, 'https://wiki.intranet.corp/');
  checkSiteAllowed(p, 'https://docs.vendor.io/');
  assert.throws(() => checkSiteAllowed(p, 'https://notexample.com/'), /organization/);
  assert.throws(() => checkSiteAllowed(p, 'https://secret.example.com/'), /organization/);
  assert.throws(() => checkSiteAllowed(p, 'https://a.secret.example.com/'), /organization/);
});

test('limits are applied to watches', () => {
  const p = normalizePolicy({ disableCookies: true, disableRenderInTab: true, disableLiveMode: true, minIntervalMinutes: 30 });
  const w = applyPolicy(p, { sendCookies: true, mode: 'tab', live: true, intervalMinutes: 5, schedule: { type: 'random', randomMaxMinutes: 10 } });
  assert.deepEqual(
    [w.sendCookies, w.mode, w.live, w.intervalMinutes, w.schedule.randomMaxMinutes],
    [false, 'fetch', false, 30, 30],
  );
  assert.equal(isManaged(p), true);
});

test('bad policy values are ignored', () => {
  const p = normalizePolicy({ allowedSites: 'example.com', minIntervalMinutes: -3, maxWatches: 2.5, disableCookies: 'yes' });
  assert.equal(p.allowedSites, null);
  assert.equal(p.minIntervalMinutes, null);
  assert.equal(p.maxWatches, null);
  assert.equal(p.disableCookies, false);
});

test('site entries may include a scheme, wildcard and port', () => {
  const p = normalizePolicy({ allowedSites: ['https://*.corp.example:8443/app'] });
  assert.deepEqual(p.allowedSites, ['corp.example']);
  checkSiteAllowed(p, 'https://wiki.corp.example:8443/page');
});

test('blocked sites match trailing dots, Unicode names and odd entry forms', () => {
  const p = normalizePolicy({ blockedSites: ['bücher.de', '.corp.example', 'user@intranet.example', '*.evil.example.'] });
  assert.deepEqual(p.blockedSites, ['xn--bcher-kva.de', 'corp.example', 'intranet.example', 'evil.example']);
  for (const url of ['https://xn--bcher-kva.de/', 'https://bücher.de/', 'https://wiki.corp.example./',
    'https://intranet.example/', 'https://a.evil.example/']) {
    assert.throws(() => checkSiteAllowed(p, url), /doesn't allow/, url);
  }
  checkSiteAllowed(p, 'https://example.org/');
  assert.throws(() => checkSiteAllowed(normalizePolicy({ blockedSites: ['*'] }), 'https://example.org/'));
});

test('an allow-list of unreadable entries allows nothing', () => {
  const p = normalizePolicy({ allowedSites: ['not a host', 42, ''] });
  assert.deepEqual(p.allowedSites, []);
  assert.throws(() => checkSiteAllowed(p, 'https://example.org/'));
});

test('no-cookies policy also rules out render-in-tab', () => {
  const w = applyPolicy(normalizePolicy({ disableCookies: true }), { mode: 'tab', sendCookies: true, intervalMinutes: 5 });
  assert.equal(w.mode, 'fetch');
  assert.equal(w.sendCookies, false);
});
