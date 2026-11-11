import { diffArrays } from './diff.js';

// HTML watching: compares the elements and attributes of the watched parts,
// not just their text. It works on the snapshot extractText already saves
// for the visual view (scripts, styles, event handlers and private form
// fields left out), so nothing more is read from the page.
//
// The snapshot is written by our own serializer, so every attribute value is
// quoted and every <, >, & and " inside text or values is escaped. That lets
// a small tokenizer read it back without a DOM (the service worker has none).

const TOKEN = /<(\/?)([a-zA-Z][^\s/>]*)([^>]*)>|([^<]+)/g;
const ATTR = /([^\s=]+)(?:="([^"]*)")?/g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Attributes that change on every load and never mean the page changed.
const ALWAYS_IGNORED = ['nonce'];

const MAX_ATTRIBUTE_RULES = 50;

// Cleans the "ignore these attributes" list: names like `style`, or a prefix
// ending in * like `data-*` or `aria-*`. Separated by commas, spaces or lines.
export function cleanIgnoreAttributes(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim().toLowerCase();
    if (!/^[a-z_:][\w:.-]{0,63}\*?$|^\*$/.test(name) || out.includes(name)) continue;
    out.push(name);
    if (out.length >= MAX_ATTRIBUTE_RULES) break;
  }
  return out;
}

function attributeFilter(ignore) {
  const rules = [...ALWAYS_IGNORED, ...cleanIgnoreAttributes(ignore)];
  return (name) => !rules.some((r) => (r.endsWith('*') ? name.startsWith(r.slice(0, -1)) : name === r));
}

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// Parses a snapshot into a flat list of { depth, tag, attrs: [[name, value]] }
// and { depth, text } items. Attributes are sorted so that their order in the
// source never counts as a change.
export function parseMarkup(html, { ignoreAttributes = [] } = {}) {
  const keep = attributeFilter(ignoreAttributes);
  const items = [];
  const open = [];
  for (const m of String(html || '').matchAll(TOKEN)) {
    if (m[4] !== undefined) {
      const text = unescape(m[4]).replace(/\s+/g, ' ').trim();
      if (text) items.push({ depth: open.length, text });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const at = open.lastIndexOf(tag);
      if (at >= 0) open.length = at;
      continue;
    }
    const attrs = [];
    for (const a of m[3].matchAll(ATTR)) {
      const name = a[1].toLowerCase();
      if (keep(name)) attrs.push([name, unescape(a[2] ?? '').replace(/\s+/g, ' ').trim()]);
    }
    attrs.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    items.push({ depth: open.length, tag, attrs });
    if (!VOID.has(tag)) open.push(tag);
  }
  return items;
}

const tagLine = ({ tag, attrs }) => `<${tag}${attrs.map(([n, v]) => (v === '' ? ` ${n}` : ` ${n}="${v}"`)).join('')}>`;

// The snapshot as indented lines, one per element (and, with text: true, one
// per piece of text), for the HTML view and for comparing.
export function markupLines(html, { ignoreAttributes = [], text = true } = {}) {
  return parseMarkup(html, { ignoreAttributes })
    .filter((item) => text || item.tag)
    .map((item) => '  '.repeat(Math.min(item.depth, 40)) + (item.tag ? tagLine(item) : item.text))
    .join('\n');
}

// What HTML watching compares: elements and attributes only. Text changes are
// the text comparison's job, so its "ignore numbers / dates" options still
// hold when HTML watching is on. Versions saved without a snapshot (pages
// that aren't HTML, or over the snapshot size limit) never count.
export function markupKey(html, ignoreAttributes = []) {
  return markupLines(html, { ignoreAttributes, text: false });
}

export function markupChanged(before, after, ignoreAttributes = [], key = (s) => s) {
  if (typeof before !== 'string' || typeof after !== 'string' || !before || !after) return false;
  return key(markupKey(before, ignoreAttributes)) !== key(markupKey(after, ignoreAttributes));
}

// A short description of what changed in the HTML, e.g.
// "HTML changed: <button> gained disabled, <img> src changed, 2 <li> added".
export function summarizeMarkup(before, after, ignoreAttributes = [], max = 300) {
  const parse = (h) => parseMarkup(h, { ignoreAttributes }).filter((i) => i.tag);
  const a = parse(before);
  const b = parse(after);
  const ops = diffArrays(a.map(tagLine), b.map(tagLine));
  const notes = [];
  const counts = new Map(); // "added <li>" -> 2
  const count = (key) => counts.set(key, (counts.get(key) || 0) + 1);
  let ia = 0;
  let ib = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.op === 'eq') {
      ia++;
      ib++;
      continue;
    }
    // A removed element followed by an added one of the same kind is the
    // same element with different attributes.
    let j = i;
    const dels = [];
    const adds = [];
    while (j < ops.length && ops[j].op !== 'eq') {
      if (ops[j].op === 'del') dels.push(a[ia++]);
      else adds.push(b[ib++]);
      j++;
    }
    i = j - 1;
    while (dels.length && adds.length && dels[0].tag === adds[0].tag) {
      const d = dels.shift();
      const n = adds.shift();
      const was = new Map(d.attrs);
      const now = new Map(n.attrs);
      const parts = [];
      for (const [name] of n.attrs) if (!was.has(name)) parts.push(`gained ${name}`);
      for (const [name] of d.attrs) if (!now.has(name)) parts.push(`lost ${name}`);
      for (const [name, value] of n.attrs) if (was.has(name) && was.get(name) !== value) parts.push(`${name} changed`);
      if (parts.length) notes.push(`<${n.tag}> ${parts.join(' and ')}`);
    }
    for (const d of dels) count(`<${d.tag}> removed`);
    for (const n of adds) count(`<${n.tag}> added`);
  }
  for (const [key, n] of counts) notes.push(n > 1 ? `${n} ${key}` : key);
  const unique = [...new Set(notes)];
  const text = unique.length ? `HTML changed: ${unique.join(', ')}` : 'The HTML changed.';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
