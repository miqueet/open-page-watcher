import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptsNeeded, isPlaceholder, scriptsError, excerpt } from '../src/lib/scriptpage.js';

test('recognizes unsupported-browser and enable-JavaScript placeholders', () => {
  for (const text of [
    'Internet Explorer is not supported. Please use another browser such as Edge, Chrome, Firefox, Safari, or Opera.',
    'Your browser is not supported.',
    'This browser is no longer supported. Please switch to a supported browser.',
    'You need to enable JavaScript to run this app.',
    'JavaScript is required to use this site.',
    'This application requires JavaScript.',
    'Please upgrade your browser to continue.',
    'Unsupported browser\nPlease use a modern browser.',
  ]) assert.equal(isPlaceholder(text), true, text);
  for (const text of [
    'Widget\n$10\nIn stock',
    'Release notes: we support all major browsers.',
    'Learn JavaScript in 10 days',
    '',
  ]) assert.equal(isPlaceholder(text), false, text);
});

test('a long page that mentions a placeholder phrase is still usable', () => {
  const article = `${'Lots of real content here. '.repeat(100)} Internet Explorer is not supported.`;
  assert.equal(scriptsNeeded({ text: article, scripts: 3 }), '');
});

test('the Pure1 page downloaded without scripts needs them', () => {
  const text = 'Internet Explorer is not supported. Please use another browser such as Edge, Chrome, Firefox, Safari, or\nOpera.';
  assert.equal(scriptsNeeded({ text, scripts: 12 }), 'placeholder');
  // Even without scripts in the HTML (they may load from a module or iframe).
  assert.equal(scriptsNeeded({ text, scripts: 0 }), 'placeholder');
});

test('an empty shell needs scripts only if the page has some', () => {
  assert.equal(scriptsNeeded({ text: '', scripts: 2 }), 'empty');
  assert.equal(scriptsNeeded({ text: 'Loading…', scripts: 1 }), 'empty');
  assert.equal(scriptsNeeded({ text: '', scripts: 0 }), '');
  assert.equal(scriptsNeeded({ text: 'A short but real page with words.', scripts: 1 }), '');
  // A header and footer around an app that hasn't drawn yet.
  assert.equal(scriptsNeeded({ text: 'Acme Portal\nHelp · Privacy · Terms', scripts: 1, emptyRoot: true }), 'empty');
  assert.equal(scriptsNeeded({ text: 'x'.repeat(400), scripts: 1, emptyRoot: true }), '');
});

test('missing selected parts count only on a short page with scripts', () => {
  const selected = true;
  assert.equal(scriptsNeeded({ selected, found: false, pageText: 'Loading', scripts: 4 }), 'missing');
  assert.equal(scriptsNeeded({ selected, found: false, pageText: 'Enable JavaScript to continue', scripts: 4 }), 'placeholder');
  assert.equal(scriptsNeeded({ selected, found: false, pageText: 'x'.repeat(1000), scripts: 4 }), '');
  // A small ordinary page that just doesn't have the part any more.
  assert.equal(scriptsNeeded({ selected, found: false, pageText: 'Widget\n$10\nIn stock\nphoto', scripts: 1 }), '');
  assert.equal(scriptsNeeded({ selected, found: false, pageText: 'Widget\n$10\nIn stock', scripts: 1, emptyRoot: true }), 'missing');
  assert.equal(scriptsNeeded({ selected, found: false, pageText: 'Loading', scripts: 0 }), '');
  // Found parts are judged by their own text, not by how short they are.
  assert.equal(scriptsNeeded({ selected, found: true, text: '$10', scripts: 4 }), '');
});

test('errors say what the page gave and why', () => {
  const e = scriptsError('placeholder', 'Internet Explorer is not supported.');
  assert.equal(e.scriptsNeeded, 'placeholder');
  assert.match(e.message, /needs its scripts to run.*“Internet Explorer is not supported\.”/);
  assert.match(scriptsError('empty', '').message, /empty page/);
  assert.match(scriptsError('missing', 'Loading').message, /selected parts only appear/);
  assert.equal(excerpt('a  b\n c'), 'a b c');
  assert.equal(excerpt('x'.repeat(200)).length, 100);
});
