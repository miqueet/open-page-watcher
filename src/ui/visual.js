import { diffArrays } from '../lib/diff.js';

// Builds the "visual" view of a version: the captured HTML of the watched
// parts, with words added since the older version highlighted (and, if asked,
// deleted words shown struck through).
//
// The captured HTML comes from a web page, so it is treated as hostile:
// it is parsed inertly, stripped of anything active or anything that could
// load a resource or navigate, and shown in an iframe with sandbox="" (no
// scripts, no forms, no same-origin access) under a CSP that blocks all loads.

const DROP_TAGS = new Set([
  'script', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'link', 'meta', 'base', 'style', 'form', 'input', 'button', 'select', 'textarea', 'video',
  'audio', 'source', 'track', 'canvas', 'svg', 'math', 'portal', 'dialog',
]);
const KEEP_ATTRS = new Set(['colspan', 'rowspan', 'alt', 'title', 'lang', 'dir', 'scope', 'headers', 'start', 'reversed', 'type']);

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'";
const STYLE = `
  body { font: 15px/1.5 system-ui, sans-serif; color: #111827; background: #fff; margin: 16px; overflow-wrap: anywhere; }
  img { display: inline-block; min-width: 16px; min-height: 16px; background: #e5e7eb; }
  table { border-collapse: collapse; } td, th { border: 1px solid #e5e7eb; padding: 4px 8px; }
  mark.opw-add { background: #bbf7d0; color: #14532d; padding: 0 1px; border-radius: 2px; }
  del.opw-del { background: #fecaca; color: #7f1d1d; }
  @media (prefers-color-scheme: dark) {
    body { background: #111318; color: #e5e7eb; }
    td, th { border-color: #2b303b; }
    mark.opw-add { background: #14532d; color: #bbf7d0; }
    del.opw-del { background: #7f1d1d; color: #fecaca; }
  }`;

export function sanitizeInto(html) {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8) {
        child.remove();
      } else if (child.nodeType === 1) {
        const tag = child.localName;
        if (DROP_TAGS.has(tag)) {
          child.remove();
          continue;
        }
        for (const a of Array.from(child.attributes)) {
          if (!KEEP_ATTRS.has(a.name.toLowerCase())) child.removeAttribute(a.name);
        }
        walk(child);
      }
    }
  };
  walk(parsed.body);
  return parsed;
}

function words(text) {
  return text.match(/\S+/g) || [];
}

// Returns the srcdoc string for the sandboxed frame.
export function visualDocument(oldText, newHtml, { showDeleted = false } = {}) {
  const doc = sanitizeInto(newHtml);

  // Text nodes in order, each split into word tokens with offsets.
  const nodes = [];
  const tokens = [];
  const tw = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const re = /\S+/g;
    let m;
    const entry = { node: n, spans: [] };
    while ((m = re.exec(n.nodeValue))) {
      entry.spans.push({ start: m.index, end: m.index + m[0].length, token: tokens.length });
      tokens.push(m[0]);
    }
    nodes.push(entry);
  }

  // Which new tokens were added, and which old words were deleted before each.
  const added = new Set();
  const deletedBefore = new Map();
  let pos = 0;
  let pending = [];
  for (const op of diffArrays(words(oldText), tokens)) {
    if (op.op === 'del') {
      pending.push(op.value);
      continue;
    }
    if (pending.length) {
      deletedBefore.set(pos, pending.join(' '));
      pending = [];
    }
    if (op.op === 'add') added.add(pos);
    pos++;
  }
  if (pending.length) deletedBefore.set(pos, pending.join(' '));

  for (const { node, spans } of nodes) {
    if (!spans.length) continue;
    const text = node.nodeValue;
    const frag = doc.createDocumentFragment();
    let cursor = 0;
    for (const s of spans) {
      if (s.start > cursor) frag.append(text.slice(cursor, s.start));
      if (showDeleted && deletedBefore.has(s.token)) {
        const del = doc.createElement('del');
        del.className = 'opw-del';
        del.textContent = deletedBefore.get(s.token) + ' ';
        frag.append(del);
      }
      const word = text.slice(s.start, s.end);
      if (added.has(s.token)) {
        const mark = doc.createElement('mark');
        mark.className = 'opw-add';
        mark.textContent = word;
        frag.append(mark);
      } else {
        frag.append(word);
      }
      cursor = s.end;
    }
    if (cursor < text.length) frag.append(text.slice(cursor));
    node.replaceWith(frag);
  }
  if (showDeleted && deletedBefore.has(tokens.length)) {
    const del = doc.createElement('del');
    del.className = 'opw-del';
    del.textContent = deletedBefore.get(tokens.length);
    doc.body.append(del);
  }

  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}">`
    + `<meta charset="utf-8"><style>${STYLE}</style></head><body>${doc.body.innerHTML}</body></html>`;
}

// Source view: the captured HTML split one tag per line, for a line diff.
export function sourceLines(html) {
  return (html || '').replace(/>\s*</g, '>\n<').trim();
}
