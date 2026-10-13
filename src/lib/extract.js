// Extracts the watched text from a document.
//
// This function must stay self-contained (no references to anything outside
// its body) because it is also injected into rendered tabs with
// chrome.scripting.executeScript({ func: extractText }).
//
// spec: {
//   selectors: [{ type: 'css' | 'xpath', expr, attr? }],  // empty = whole page
//   excludes: [{ type, expr }],                            // skipped inside selections
//   baseUrl: string,                                       // resolves relative href/src
//   captureHtml: boolean,                                  // also return the selected HTML
// }
// Returns { ok: true, text, matched, html? } or { ok: false, error }.
export function extractText(spec, doc = document) {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'OBJECT', 'HEAD']);
  const BLOCK = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
    'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE',
    'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL', 'OPTION', 'LEGEND',
  ]);

  const URL_ATTRS = new Set(['href', 'src', 'action', 'poster', 'cite', 'data']);
  let excluded = new Set();

  function find(sel) {
    if (sel.type === 'xpath') {
      const nodes = [];
      const result = doc.evaluate(sel.expr, doc, null, 7 /* ORDERED_NODE_SNAPSHOT_TYPE */, null);
      for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i));
      return nodes;
    }
    return Array.from(doc.querySelectorAll(sel.expr));
  }

  function attrOf(node, name) {
    let value = node.getAttribute ? node.getAttribute(name) : null;
    if (value === null && name in node && typeof node[name] !== 'object' && typeof node[name] !== 'function') {
      value = String(node[name]); // a live property such as value or checked
    }
    if (value === null) return '';
    if (URL_ATTRS.has(name.toLowerCase()) && spec && spec.baseUrl) {
      try {
        value = new URL(value, spec.baseUrl).href;
      } catch {
        // keep the raw value
      }
    }
    return value.trim();
  }

  const MAX_HTML = 300 * 1024;
  const VOID = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'SOURCE', 'TRACK', 'WBR']);
  const esc = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Serializes a subtree without scripts, excluded parts or event handlers.
  // The result is only ever shown inside a sandboxed, script-less frame.
  function htmlOf(root, out) {
    (function walk(node) {
      if (out.size > MAX_HTML || excluded.has(node)) return;
      if (node.nodeType === 3) {
        out.push(esc(node.nodeValue));
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      const name = node.tagName.toLowerCase();
      let open = '<' + name;
      for (const a of node.attributes) {
        if (/^on/i.test(a.name)) continue;
        open += ' ' + a.name + '="' + esc(a.value) + '"';
      }
      out.push(open + '>');
      if (VOID.has(tag)) return;
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
      out.push('</' + name + '>');
    })(root);
  }

  function newHtmlBuffer() {
    const parts = [];
    return {
      parts,
      size: 0,
      push(s) {
        parts.push(s);
        this.size += s.length;
      },
    };
  }

  function textOf(root) {
    const out = [];
    (function walk(node) {
      if (excluded.has(node)) return;
      if (node.nodeType === 3) {
        out.push(node.nodeValue);
        return;
      }
      if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
      const tag = node.nodeType === 1 ? node.tagName.toUpperCase() : '';
      if (SKIP.has(tag)) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        out.push(' ' + (node.value ?? node.getAttribute('value') ?? '') + ' ');
        return;
      }
      if (tag === 'IMG' && node.getAttribute('alt')) out.push(' ' + node.getAttribute('alt') + ' ');
      const block = BLOCK.has(tag);
      if (block) out.push('\n');
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
      if (tag === 'TD' || tag === 'TH') out.push('\t');
      if (block) out.push('\n');
    })(root);
    return out
      .join('')
      .split('\n')
      .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  try {
    const selectors = (spec && spec.selectors) || [];
    excluded = new Set(((spec && spec.excludes) || []).flatMap(find));
    const html = spec && spec.captureHtml ? newHtmlBuffer() : null;
    const finish = (result) => {
      if (html && html.size <= MAX_HTML) result.html = html.parts.join('');
      return result;
    };
    if (selectors.length === 0) {
      const root = doc.body || doc.documentElement;
      if (!root) return { ok: false, error: 'Page has no content' };
      if (html) htmlOf(root, html);
      return finish({ ok: true, text: textOf(root), matched: 1 });
    }
    const parts = [];
    let matched = 0;
    for (const sel of selectors) {
      const nodes = find(sel).filter((n) => !excluded.has(n));
      matched += nodes.length;
      for (const node of nodes) {
        if (html && node.nodeType === 1) htmlOf(node, html);
        if (sel.attr) parts.push(attrOf(node, sel.attr));
        else parts.push(node.nodeType === 1 || node.nodeType === 9 ? textOf(node) : String(node.nodeValue ?? node.textContent ?? ''));
      }
    }
    if (matched === 0) return { ok: false, error: 'None of the selected elements were found on the page' };
    return finish({ ok: true, text: parts.filter(Boolean).join('\n'), matched });
  } catch (e) {
    return { ok: false, error: 'Selector error: ' + (e && e.message ? e.message : String(e)) };
  }
}
