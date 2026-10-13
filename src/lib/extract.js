// Extracts the watched text from a document.
//
// This function must stay self-contained (no references to anything outside
// its body) because it is also injected into rendered tabs with
// chrome.scripting.executeScript({ func: extractText }).
//
// spec: { selectors: [{ type: 'css' | 'xpath', expr }] }
// Returns { ok: true, text, matched } or { ok: false, error }.
export function extractText(spec, doc = document) {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'OBJECT', 'HEAD']);
  const BLOCK = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
    'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE',
    'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL', 'OPTION', 'LEGEND',
  ]);

  function textOf(root) {
    const out = [];
    (function walk(node) {
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
    if (selectors.length === 0) {
      const root = doc.body || doc.documentElement;
      if (!root) return { ok: false, error: 'Page has no content' };
      return { ok: true, text: textOf(root), matched: 1 };
    }
    const parts = [];
    let matched = 0;
    for (const sel of selectors) {
      let nodes = [];
      if (sel.type === 'xpath') {
        const result = doc.evaluate(sel.expr, doc, null, 7 /* ORDERED_NODE_SNAPSHOT_TYPE */, null);
        for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i));
      } else {
        nodes = Array.from(doc.querySelectorAll(sel.expr));
      }
      matched += nodes.length;
      for (const node of nodes) {
        parts.push(node.nodeType === 1 || node.nodeType === 9 ? textOf(node) : String(node.nodeValue ?? node.textContent ?? ''));
      }
    }
    if (matched === 0) return { ok: false, error: 'None of the selected elements were found on the page' };
    return { ok: true, text: parts.filter(Boolean).join('\n'), matched };
  } catch (e) {
    return { ok: false, error: 'Selector error: ' + (e && e.message ? e.message : String(e)) };
  }
}
