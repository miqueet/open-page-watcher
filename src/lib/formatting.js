import { diffText } from './diff.js';

// The marks below are the ones extractText writes with captureFormat.
// The mark at the start of a line: # heading, - or 1. list item, > quote, | table cell.
const LINE_KINDS = [['heading', /^#{1,6} /], ['list', /^(- |1\. )/], ['quote', /^> /], ['table', /^\| /]];
const lineMark = (line) => {
  for (const [name, re] of LINE_KINDS) {
    const m = re.exec(line);
    if (m) return { name, mark: m[0] };
  }
  return { name: '', mark: '' };
};
// Kinds of formatting, and how to spot their marks in a changed piece of a line.
const KINDS = [
  ['bold', (s) => s.includes('**')],
  ['italic', (s) => /(^|[^\w])_|_($|[^\w])/.test(s)],
  ['strikethrough', (s) => s.includes('~~')],
  ['code', (s) => s.includes('`')],
  ['link', (s) => /\[|\]\(/.test(s)],
];
const NAMED = {
  underline: 'underline', highlight: 'highlight', sup: 'superscript', sub: 'subscript',
  small: 'size', big: 'size', size: 'size', color: 'color', background: 'background color', hidden: 'hidden text',
};

// Whether two versions differ in formatting. Versions saved without
// formatting (before it was turned on, or for PDFs, JSON and feeds) never do.
export function formatChanged(before, after, key = (s) => s) {
  return typeof before === 'string' && typeof after === 'string' && key(before) !== key(after);
}

// A short description of what formatting changed, e.g.
// "Formatting changed: bold, link".
export function summarizeFormat(before, after, max = 300) {
  const kinds = new Set();
  const look = (piece) => {
    for (const [name, test] of KINDS) if (test(piece)) kinds.add(name);
    for (const m of piece.matchAll(/\{\/?([a-z]+)[:}]/g)) if (NAMED[m[1]]) kinds.add(NAMED[m[1]]);
  };
  for (const line of diffText(before, after)) {
    if (line.type === 'add' || line.type === 'del') {
      const { name, mark } = lineMark(line.text);
      if (name) kinds.add(name);
      look(line.text.slice(mark.length));
    } else if (line.type === 'mod') {
      const a = lineMark(line.parts.filter((p) => p.op !== 'add').map((p) => p.value).join(''));
      const b = lineMark(line.parts.filter((p) => p.op !== 'del').map((p) => p.value).join(''));
      if (a.mark !== b.mark) for (const k of [a.name, b.name]) if (k) kinds.add(k);
      look(line.parts.filter((p) => p.op !== 'eq').map((p) => p.value).join(' '));
    }
  }
  const text = kinds.size ? `Formatting changed: ${[...kinds].join(', ')}` : 'The formatting changed.';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// Just the marks of each line, without the words, so that new words inside
// unchanged formatting don't count as a formatting change.
const MARK = /^(?:#{1,6} |- |1\. |> |\| )|\*\*|~~|`|\{\/?[a-z]+(?:: [^}]*)?\}|\]\([^)\n]*\)|\[|(?<!\w)_|_(?!\w)/gm;
export function formatMarks(format) {
  return String(format).split('\n').map((line) => (line.match(MARK) || []).join('')).filter(Boolean).join('\n');
}
