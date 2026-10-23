import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatChanged, summarizeFormat, formatMarks } from '../src/lib/formatting.js';

test('formatting only counts when both versions have it', () => {
  assert.equal(formatChanged(undefined, '**a**'), false);
  assert.equal(formatChanged('a', undefined), false);
  assert.equal(formatChanged('a', 'a'), false);
  assert.equal(formatChanged('a', '**a**'), true);
  assert.equal(formatChanged('A', 'a', (s) => s.toLowerCase()), false);
});

test('summary names the kinds of formatting that changed', () => {
  assert.equal(summarizeFormat('Ends Friday', 'Ends **Friday**'), 'Formatting changed: bold');
  assert.equal(summarizeFormat('[More](https://a.example/1)', '[More](https://a.example/2)'), 'Formatting changed: link');
  assert.equal(summarizeFormat('Sale', '## Sale'), 'Formatting changed: heading');
  assert.equal(summarizeFormat('## Sale', '### Sale'), 'Formatting changed: heading');
  assert.equal(summarizeFormat('In stock', '{color: red}In stock{/color}'), 'Formatting changed: color');
  assert.equal(summarizeFormat('{color: red}x{/color}', '{color: green}x{/color}'), 'Formatting changed: color');
  assert.equal(summarizeFormat('Sold out', '{hidden}Sold out{/hidden}'), 'Formatting changed: hidden text');
  assert.equal(summarizeFormat('- a\n- b', '1. a\n1. b'), 'Formatting changed: list');
  assert.equal(summarizeFormat('_a_ b', 'a **b**'), 'Formatting changed: bold, italic');
});

test('snake_case words are not taken for italics', () => {
  assert.equal(summarizeFormat('my_var x', 'my_var **x**'), 'Formatting changed: bold');
});

test('formatMarks leaves out the words', () => {
  assert.equal(formatMarks('## Sale\nEnds **Friday** at [noon](https://a.example/)'), '## \n****[](https://a.example/)');
  assert.equal(formatMarks('Ends **Friday**'), formatMarks('Ends **Saturday**'));
  assert.notEqual(formatMarks('Ends **Friday**'), formatMarks('Ends _Friday_'));
  assert.equal(formatMarks('my_var'), '');
});
