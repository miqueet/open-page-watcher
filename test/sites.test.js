import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  siteRows, siteUrl, siteLabel, isSitePattern, cleanKeptSites,
} from '../src/lib/sites.js';

test('siteUrl accepts a bare host or a full address', () => {
  assert.equal(siteUrl('example.com'), 'https://example.com/');
  assert.equal(siteUrl('  https://Example.com/news?x=1 '), 'https://example.com/');
  assert.equal(siteUrl('http://intranet.local:8080/a'), 'http://intranet.local/');
  assert.throws(() => siteUrl(''), /Enter a site/);
  assert.throws(() => siteUrl('ftp://example.com'), /Only http/);
  assert.throws(() => siteUrl('javascript:alert(1)'), /Only http/);
  assert.throws(() => siteUrl('*.example.com'), /one site|Only http/);
});

test('isSitePattern only takes single-site patterns', () => {
  assert.ok(isSitePattern('https://example.com/*'));
  assert.ok(isSitePattern('http://localhost/*'));
  for (const bad of ['<all_urls>', 'https://*/*', 'https://*.example.com/*', 'https://example.com/a/*', 'file:///*', 42, null]) {
    assert.equal(isSitePattern(bad), false, String(bad));
  }
});

test('siteLabel hides https and the path', () => {
  assert.equal(siteLabel('https://example.com/*'), 'example.com');
  assert.equal(siteLabel('http://example.com/*'), 'http://example.com');
  assert.equal(siteLabel('<all_urls>'), 'All sites');
});

test('cleanKeptSites drops junk and duplicates', () => {
  assert.deepEqual(cleanKeptSites(['https://a.com/*', 'https://a.com/*', '<all_urls>', 'x']), ['https://a.com/*']);
  assert.deepEqual(cleanKeptSites(undefined), []);
});

test('siteRows lists granted, kept and needed sites with their watches', () => {
  const watches = [
    { id: '1', name: 'Prices', url: 'https://shop.example.com/p' },
    { id: '2', name: 'News', url: 'https://news.example.org/', paused: true },
    { id: '3', name: 'Another price', url: 'https://shop.example.com/q' },
    { id: '4', name: 'Bad', url: 'not a url' },
  ];
  const { broad, rows } = siteRows({
    origins: ['https://shop.example.com/*', 'https://stray.example.net/*'],
    watches,
    kept: ['https://later.example.com/*'],
  });
  assert.deepEqual(broad, []);
  const by = Object.fromEntries(rows.map((r) => [r.pattern, r]));
  assert.deepEqual(rows.map((r) => r.label), ['later.example.com', 'news.example.org', 'shop.example.com', 'stray.example.net']);
  assert.equal(by['https://shop.example.com/*'].granted, true);
  assert.deepEqual(by['https://shop.example.com/*'].watches.map((w) => w.name), ['Another price', 'Prices']);
  assert.equal(by['https://news.example.org/*'].granted, false);
  assert.equal(by['https://news.example.org/*'].watches[0].paused, true);
  assert.equal(by['https://later.example.com/*'].kept, true);
  assert.equal(by['https://later.example.com/*'].granted, false); // kept but Chrome no longer grants it
  assert.equal(by['https://stray.example.net/*'].watches.length, 0);
});

test('with access to all sites, sites with watches or kept count as granted', () => {
  const { broad, rows } = siteRows({
    origins: ['<all_urls>'],
    watches: [{ id: '1', name: 'Shot', url: 'https://a.com/', watchScreenshot: true }],
    kept: ['https://b.com/*'],
  });
  assert.deepEqual(broad, ['<all_urls>']);
  assert.ok(rows.every((r) => r.granted));
  assert.equal(rows[0].watches[0].screenshot, true);
});
