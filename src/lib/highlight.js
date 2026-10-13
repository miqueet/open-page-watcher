// Highlights text that was added in the latest change, on the live page, using
// the CSS Custom Highlight API: no elements are inserted and the page's own
// markup is left untouched. Runs via chrome.scripting.executeScript, so it
// must stay self-contained (no imports, no outside variables).
//
// fragments: added text, one entry per changed line.
// selectors: the watch's selectors ({ type: 'css' | 'xpath', expr }); when they
//            match, only text inside them is searched.
// Returns the number of highlighted ranges.
export function highlightChanges(fragments, selectors) {
  const NAME = 'open-page-watcher-change';
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);

  const roots = [];
  for (const s of selectors || []) {
    try {
      if (s.type === 'xpath') {
        const r = document.evaluate(s.expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < r.snapshotLength; i++) roots.push(r.snapshotItem(i));
      } else {
        roots.push(...document.querySelectorAll(s.expr));
      }
    } catch {
      // invalid selector: ignore
    }
  }
  if (!roots.length && document.body) roots.push(document.body);

  // Text of each root with whitespace collapsed, mapped back to text nodes.
  const ranges = [];
  for (const root of roots) {
    let flat = '';
    const map = []; // flat index -> [node, offset]
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && SKIP.has(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n && flat.length < 2_000_000; n = walker.nextNode()) {
      const v = n.nodeValue;
      for (let i = 0; i < v.length; i++) {
        const space = /\s/.test(v[i]);
        if (space && (flat.endsWith(' ') || flat === '')) continue;
        flat += space ? ' ' : v[i];
        map.push([n, i]);
      }
    }
    for (const raw of fragments) {
      const needle = String(raw).replace(/\s+/g, ' ').trim();
      if (needle.length < 2) continue;
      let from = 0;
      for (let count = 0; count < 20; count++) {
        const at = flat.indexOf(needle, from);
        if (at < 0) break;
        const [startNode, startOffset] = map[at];
        const [endNode, endOffset] = map[at + needle.length - 1];
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, Math.min(endOffset + 1, endNode.nodeValue.length));
        ranges.push(range);
        from = at + needle.length;
      }
    }
  }
  if (!ranges.length || typeof Highlight !== 'function' || !CSS.highlights) return 0;
  CSS.highlights.set(NAME, new Highlight(...ranges.slice(0, 500)));
  const first = ranges[0].startContainer.parentElement;
  first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return ranges.length;
}

export const HIGHLIGHT_CSS = '::highlight(open-page-watcher-change) { background-color: #fde047; color: #111827; }';
