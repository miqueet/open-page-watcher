import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, historyCsv } from '../src/lib/csv.js';

test('quotes cells and defuses spreadsheet formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('-5'), '-5');
  assert.equal(csvCell('-5+cmd'), "'-5+cmd");
});

test('history CSV has a header, times, first numbers and text', () => {
  const csv = historyCsv([{ t: Date.UTC(2026, 9, 23), text: 'Price $1,299.99' }, { t: Date.UTC(2026, 9, 24), text: 'Sold out' }]);
  assert.ok(csv.startsWith('﻿'));
  assert.deepEqual(csv.slice(1).trimEnd().split('\r\n'), [
    'Saved at,First number,Text',
    '2026-10-23T00:00:00.000Z,1299.99,"Price $1,299.99"',
    '2026-10-24T00:00:00.000Z,,Sold out',
  ]);
});
