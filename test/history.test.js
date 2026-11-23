import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHistory, exportHistory, mergeHistory, historyInFile } from '../src/lib/history.js';
import { HTML_VERSIONS_KEPT, SHOT_VERSIONS_KEPT } from '../src/lib/storage.js';

const now = Date.UTC(2026, 10, 23);
const shot = 'data:image/webp;base64,UklGRg==';

test('exported versions can leave out page copies and screenshots', () => {
  const history = [{ t: 1, text: 'a', html: '<p>a</p>', shot, format: 'a', reader: 2 }];
  assert.deepEqual(exportHistory(history), history);
  assert.deepEqual(exportHistory(history, { pages: false }), [{ t: 1, text: 'a', format: 'a', reader: 2 }]);
  assert.equal(history[0].html, '<p>a</p>', 'the stored versions are not changed');
  assert.deepEqual(exportHistory(null), []);
});

test('imported versions keep only known, well-formed fields, oldest first', () => {
  const clean = cleanHistory([
    { t: now - 1000, text: 'second', html: '<b>x</b>', format: '**x**', shot, reader: 2, extra: 'dropped', __proto__: { polluted: true } },
    { t: now - 2000, text: 'first' },
    { t: 'yesterday', text: 'bad time' },
    { t: now, text: 42 },
    { t: -5, text: 'negative' },
    { t: now + 7 * 24 * 3600e3, text: 'from the future' },
    null,
    ['not', 'an', 'entry'],
  ], { now });
  assert.deepEqual(clean, [
    { t: now - 2000, text: 'first' },
    { t: now - 1000, text: 'second', html: '<b>x</b>', format: '**x**', shot, reader: 2 },
  ]);
  assert.equal(Object.hasOwn(clean[1], 'extra'), false);
  assert.deepEqual(cleanHistory({ not: 'a list' }), []);
  assert.deepEqual(cleanHistory('text'), []);
});

test('imported screenshots must be inline images', () => {
  const versions = (s) => cleanHistory([{ t: now, text: 'x', shot: s }], { now })[0];
  assert.equal(versions(shot).shot, shot);
  assert.equal(versions('data:image/png;base64,iVBORw0KGgo=').shot, 'data:image/png;base64,iVBORw0KGgo=');
  for (const bad of ['https://tracker.example/pixel.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+',
    'data:image/webp;base64,"onerror=alert(1)', 'javascript:alert(1)', 42]) {
    assert.equal(Object.hasOwn(versions(bad), 'shot'), false, String(bad));
  }
  assert.equal(Object.hasOwn(cleanHistory([{ t: now, text: 'x', shot }], { now, shots: false })[0], 'shot'), false);
});

test('oversized or unknown values are left out', () => {
  const [v] = cleanHistory([{ t: now, text: 'x', html: 'h'.repeat(300 * 1024 + 1), reader: 99, format: 7 }], { now });
  assert.deepEqual(v, { t: now, text: 'x' });
  assert.deepEqual(cleanHistory([{ t: now, text: 'x'.repeat(2_000_001) }], { now }), []);
});

test('merging keeps time order, skips duplicates and respects the limit', () => {
  const existing = [{ t: 50, text: 'checked after import' }];
  const imported = [{ t: 10, text: 'a' }, { t: 20, text: 'b' }, { t: 20, text: 'b' }];
  assert.deepEqual(mergeHistory(existing, imported, 20).map((h) => h.text), ['a', 'b', 'checked after import']);
  assert.deepEqual(mergeHistory(existing, imported, 2).map((h) => h.text), ['b', 'checked after import']);
  // Importing the same file twice adds nothing.
  const once = mergeHistory([], imported, 20);
  assert.equal(mergeHistory(once, imported, 20).length, once.length);
});

test('merged history keeps page copies and screenshots only for recent versions', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ t: i + 1, text: String(i), html: '<p></p>', shot }));
  const merged = mergeHistory([], many, 200);
  assert.equal(merged.filter((h) => h.html).length, HTML_VERSIONS_KEPT);
  assert.equal(merged.filter((h) => h.shot).length, SHOT_VERSIONS_KEPT);
  assert.ok(merged[merged.length - 1].html && merged[merged.length - 1].shot);
});

test('files without saved versions still import', () => {
  assert.equal(historyInFile({ format: 'open-page-watcher', version: 3, watches: [] }).size, 0);
  assert.equal(historyInFile({ history: [1, 2] }).size, 0);
  const file = JSON.parse('{"history":{"__proto__":[{"t":1,"text":"x"}],"w1":[{"t":1,"text":"y"}],"w2":[]}}');
  const map = historyInFile(file);
  assert.deepEqual([...map.keys()], ['__proto__', 'w1']);
  assert.equal({}.polluted, undefined);
});
