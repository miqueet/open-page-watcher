import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnostics, hideAddresses, textStats } from '../src/lib/diagnostics.js';

const watch = {
  id: 'w1',
  name: 'Load balancer config',
  url: 'https://lb.intranet.example:8443/advanced/configuration?tab=1',
  labels: ['infra'],
  mode: 'tab',
  includeFrames: false,
  selectors: [{ type: 'css', expr: '.cm-editor' }],
  lastCheckedAt: Date.UTC(2026, 0, 2),
  lastError: 'The page redirected to sso.intranet.example, which this watch doesn\'t have access to',
};
const config = 'global\n  daemon\n\nbackend be-1\n  server s1 192.0.2.1:443 check';
const run = {
  ok: true,
  error: '',
  render: { finalUrl: 'https://lb.intranet.example:8443/advanced/configuration' },
  frames: [
    { frameId: 0, url: 'https://lb.intranet.example:8443/advanced/configuration', childFrames: ['https://cdn.vendor.example/widget'], editors: [{ kind: 'monaco', source: 'model', lines: 5, chars: config.length }] },
  ],
  text: config,
};

test('text stats describe the text without showing it', async () => {
  const s = await textStats(config);
  assert.deepEqual({ ...s, sha256: undefined }, {
    chars: config.length, lines: 5, blankLines: 1, indentedLines: 2, longestLine: 31, sha256: undefined,
  });
  assert.match(s.sha256, /^[0-9a-f]{64}$/);
  assert.equal((await textStats('')).lines, 0);
});

test('by default the file has no captured text, addresses or names', async () => {
  const report = await buildDiagnostics({
    version: '0.4.0', watch, history: [{ t: 1, text: config, reader: 2 }], log: [{ t: 1, ok: true, ms: 10, via: 'schedule' }], run,
  });
  const json = JSON.stringify(report);
  assert.doesNotMatch(json, /intranet|vendor|daemon|192\.0\.2|Load balancer|infra|advanced/);
  assert.equal(report.watch.url, 'https://site-1:8443/(path hidden)');
  assert.equal(report.testCheck.frames[0].childFrames[0], 'https://site-2/(path hidden)');
  // Host names in messages get the same placeholder as in addresses.
  assert.match(report.watch.state.lastError, /redirected to site-3,/);
  assert.equal(report.watch.name, '(hidden)');
  assert.deepEqual(report.watch.labels, ['(hidden)']);
  assert.equal(report.testCheck.captured.lines, 5);
  assert.equal(report.testCheck.captured.sameAsLatestVersion, true);
  assert.equal(report.testCheck.captured.text, undefined);
  assert.equal(report.savedVersions.latest[0].text, undefined);
  assert.equal(report.savedVersions.latest[0].reader, 2);
  assert.deepEqual(report.watch.settings.selectors, watch.selectors);
  assert.equal(report.watch.state.lastCheckedAt, '2026-01-02T00:00:00.000Z');
});

test('captured text and addresses are included only when asked for', async () => {
  const withText = await buildDiagnostics({ watch, run, includeContent: true });
  assert.equal(withText.testCheck.captured.text, config);
  assert.equal(withText.watch.url, 'https://site-1:8443/(path hidden)');
  const all = await buildDiagnostics({ watch, run, includeContent: true, includeAddresses: true });
  assert.equal(all.watch.url, watch.url);
  assert.equal(all.watch.name, watch.name);
});

test('hiding addresses leaves the original report alone', () => {
  const report = { contentIncluded: false, watch: { name: 'x', labels: [], url: 'http://a.example/' } };
  const hidden = hideAddresses(report);
  assert.equal(hidden.watch.url, 'http://site-1/');
  assert.equal(report.watch.url, 'http://a.example/');
});
