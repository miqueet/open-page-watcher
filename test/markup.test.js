import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarkup, markupLines, markupKey, markupChanged, summarizeMarkup, cleanIgnoreAttributes,
} from '../src/lib/markup.js';

test('attributes are sorted and text is indented under its element', () => {
  const html = '<div id="p" class="price"><b>$10</b><img src="/a.png" alt="x"></div><p>after</p>';
  assert.equal(markupLines(html), '<div class="price" id="p">\n  <b>\n    $10\n  <img alt="x" src="/a.png">\n<p>\n  after');
  assert.equal(markupKey(html), '<div class="price" id="p">\n  <b>\n  <img alt="x" src="/a.png">\n<p>');
});

test('escaped text and values are read back', () => {
  const [item] = parseMarkup('<a title="a &quot;b&quot; &lt;c&gt; &amp; d">x</a>');
  assert.deepEqual(item.attrs, [['title', 'a "b" <c> & d']]);
  assert.equal(markupLines('<p>1 &lt; 2 &amp;&amp; 3</p>'), '<p>\n  1 < 2 && 3');
});

test('attribute order and text changes are not HTML changes', () => {
  assert.equal(markupChanged('<a href="/x" class="b">Buy</a>', '<a class="b" href="/x">Sold</a>'), false);
  assert.equal(markupChanged('<button>Buy</button>', '<button disabled="">Buy</button>'), true);
});

test('versions without a snapshot never count', () => {
  assert.equal(markupChanged(undefined, '<p></p>'), false);
  assert.equal(markupChanged('<p></p>', ''), false);
});

test('ignored attributes, by name or prefix, and nonce never count', () => {
  const a = '<div data-ts="1" style="color:red" nonce="abc"><span aria-busy="true">x</span></div>';
  const b = '<div data-ts="2" style="color:blue" nonce="def"><span aria-busy="false">x</span></div>';
  assert.equal(markupChanged(a, b), true);
  assert.equal(markupChanged(a, b, ['data-*', 'style', 'aria-*']), false);
  assert.equal(markupChanged('<p nonce="1"></p>', '<p nonce="2"></p>'), false);
  assert.equal(markupChanged(a, b, [], (k) => k.replace(/"[^"]*"/g, '""')), false);
});

test('ignore list is cleaned', () => {
  assert.deepEqual(cleanIgnoreAttributes('style, data-*\nARIA-*  bad name!, style'), ['style', 'data-*', 'aria-*', 'bad']);
  assert.deepEqual(cleanIgnoreAttributes(['class', 3, '<x>']), ['class']);
});

test('summary says which elements and attributes changed', () => {
  assert.equal(summarizeMarkup('<button>Buy</button>', '<button disabled="">Buy</button>'), 'HTML changed: <button> gained disabled');
  assert.equal(summarizeMarkup('<img src="/a.png">', '<img src="/b.png">'), 'HTML changed: <img> src changed');
  assert.equal(summarizeMarkup('<p class="sale">x</p>', '<p>x</p>'), 'HTML changed: <p> lost class');
  assert.equal(summarizeMarkup('<ul><li>a</li></ul>', '<ul><li>a</li><li>b</li><li>c</li></ul>'), 'HTML changed: 2 <li> added');
  assert.equal(summarizeMarkup('<div><span>x</span></div>', '<div></div>'), 'HTML changed: <span> removed');
});

test('void elements do not nest what follows', () => {
  assert.equal(markupKey('<p><br>a<img src="x"><span>b</span></p>'), '<p>\n  <br>\n  <img src="x">\n  <span>');
});
