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
//   captureFormat: boolean,    // also return the text annotated with its formatting
//   userTab: boolean,          // the user's own tab (live mode): skip anything they may have typed
//   expect: { url } | { origin },  // the main frame must still show this page or site
// }
// Returns { ok: true, text, matched, html?, format? } or { ok: false, error, pageText? },
// plus signInForm (the page has a password or username field; no values are
// read) and title, used to spot a sign-in page, and scripts (how many script
// elements the page has) and emptyRoot (an app's mount point is empty), used
// to spot a page that only works with scripts.
// pageText is the start of the whole page's text when the selected parts
// weren't found.
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

  // Form fields can hold what the user typed into an open tab (live mode), so
  // only their page-supplied attributes are read, and password fields never.
  // In the user's own tab, form fields and editable areas may hold what they
  // typed (pages can copy it into the value attribute), so none are read.
  const FORM_FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  const userTab = Boolean(spec && spec.userTab);
  const tagOf = (node) => String(node.tagName || '').toUpperCase();
  const isSecret = (node) => (userTab && (FORM_FIELDS.has(tagOf(node)) || node.isContentEditable === true))
    || (tagOf(node) === 'INPUT' && /^(password|hidden|file)$/i.test(node.getAttribute('type') || ''));
  // Properties a watch may read when the attribute is missing. Anything else
  // (document.cookie, a field's typed value) stays out of reach.
  const PROPS = new Set(['currentSrc', 'href', 'src', 'title', 'alt', 'naturalWidth', 'naturalHeight', 'duration']);

  function attrOf(node, name) {
    if (node.nodeType !== 1 || isSecret(node)) return '';
    let value = node.getAttribute(name);
    if (value === null && PROPS.has(name) && !FORM_FIELDS.has(tagOf(node)) && name in node
      && typeof node[name] !== 'object' && typeof node[name] !== 'function') {
      value = String(node[name]); // e.g. the image actually shown, from srcset
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
      if (SKIP.has(tag) || isSecret(node)) return;
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

  // Formatting a reader can see, written into the text as plain marks:
  // # headings, - list items, > quotes, | table cells, **bold**, _italic_,
  // ~~struck~~, `code`, [links](url), and {name}...{/name} for the rest. Only
  // the page's own markup and inline styles count: stylesheets and class
  // names are left out because sites rename and retheme them all the time.
  const INLINE_MARKS = [
    ['bold', '**', '**'], ['italic', '_', '_'], ['strike', '~~', '~~'], ['code', '`', '`'],
    ['underline', '{underline}', '{/underline}'], ['highlight', '{highlight}', '{/highlight}'],
    ['superscript', '{sup}', '{/sup}'], ['subscript', '{sub}', '{/sub}'], ['small', '{small}', '{/small}'],
    ['big', '{big}', '{/big}'], ['hidden', '{hidden}', '{/hidden}'],
  ];
  const TAG_MARKS = {
    B: 'bold', STRONG: 'bold', I: 'italic', EM: 'italic', CITE: 'italic', DFN: 'italic', VAR: 'italic',
    S: 'strike', STRIKE: 'strike', DEL: 'strike', CODE: 'code', KBD: 'code', SAMP: 'code', TT: 'code',
    TH: 'bold', U: 'underline', INS: 'underline', MARK: 'highlight', SUP: 'superscript', SUB: 'subscript', SMALL: 'small', BIG: 'big',
  };
  const tidy = (v) => String(v).toLowerCase().replace(/\s+/g, ' ').replace(/\s*!important$/, '').trim().slice(0, 80);

  // The formatting an element turns on: { marks: Set, values: [[name, value]], href }
  function formatOf(node, tag) {
    const marks = new Set();
    const values = [];
    if (TAG_MARKS[tag]) marks.add(TAG_MARKS[tag]);
    if (node.hasAttribute('hidden')) marks.add('hidden');
    if (tag === 'FONT') {
      if (node.getAttribute('color')) values.push(['color', tidy(node.getAttribute('color'))]);
      if (node.getAttribute('size')) values.push(['size', tidy(node.getAttribute('size'))]);
    }
    const style = node.getAttribute('style');
    if (style) {
      for (const decl of style.split(';')) {
        const i = decl.indexOf(':');
        if (i < 0) continue;
        const prop = decl.slice(0, i).trim().toLowerCase();
        const value = tidy(decl.slice(i + 1));
        if (!value) continue;
        if (prop === 'color') values.push(['color', value]);
        else if (prop === 'background-color' || (prop === 'background' && !/url\(/.test(value))) values.push(['background', value]);
        else if (prop === 'font-size') values.push(['size', value]);
        else if (prop === 'font-weight' && (/^bold/.test(value) || Number(value) >= 600)) marks.add('bold');
        else if (prop === 'font-style' && /italic|oblique/.test(value)) marks.add('italic');
        else if (/^text-decoration(-line)?$/.test(prop)) {
          if (/underline/.test(value)) marks.add('underline');
          if (/line-through/.test(value)) marks.add('strike');
        } else if ((prop === 'display' && value === 'none') || (prop === 'visibility' && value === 'hidden')) marks.add('hidden');
      }
    }
    let href = '';
    if (tag === 'A' && node.hasAttribute('href')) href = (attrOf(node, 'href') || '').slice(0, 300);
    return { marks, values, href };
  }

  // Writes the marks that open an element's formatting and returns a function
  // that writes the closing ones. Empty elements get no marks.
  function openFormat(node, tag, out, active) {
    if (!String(node.textContent || '').trim()) return null;
    if (/^H[1-6]$/.test(tag)) out.push('#'.repeat(Number(tag[1])) + ' ');
    else if (tag === 'LI') out.push(node.parentElement && tagOf(node.parentElement) === 'OL' ? '1. ' : '- ');
    else if (tag === 'BLOCKQUOTE') out.push('> ');
    else if (tag === 'TD' || tag === 'TH') out.push('| ');
    const { marks, values, href } = formatOf(node, tag);
    const opened = [];
    for (const [name, open, close] of INLINE_MARKS) {
      if (marks.has(name) && !active.get(name)) opened.push([name, open, close]);
    }
    for (const [name, value] of values) {
      if (active.get(name) !== value) opened.push([name, `{${name}: ${value}}`, `{/${name}}`, value]);
    }
    if (href) opened.push(['link', '[', `](${href})`, href]);
    if (!opened.length) return null;
    const saved = opened.map(([name]) => [name, active.get(name)]);
    for (const [name, open, , value] of opened) {
      out.push(open);
      active.set(name, value ?? true);
    }
    return () => {
      for (let i = opened.length - 1; i >= 0; i--) out.push(opened[i][2]);
      for (const [name, prev] of saved) {
        if (prev === undefined) active.delete(name);
        else active.set(name, prev);
      }
    };
  }

  function textOf(root, format = false) {
    const out = [];
    const active = new Map(); // marks turned on by an ancestor, so nested ones aren't repeated
    (function walk(node) {
      if (excluded.has(node)) return;
      if (node.nodeType === 3) {
        out.push(node.nodeValue);
        return;
      }
      if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
      const tag = node.nodeType === 1 ? node.tagName.toUpperCase() : '';
      if (SKIP.has(tag)) return;
      if (node.nodeType === 1 && isSecret(node)) return;
      if (tag === 'INPUT') {
        out.push(' ' + (node.getAttribute('value') ?? '') + ' ');
        return;
      }
      if (tag === 'TEXTAREA') {
        out.push(' ' + (node.defaultValue ?? node.textContent ?? '') + ' ');
        return;
      }
      if (tag === 'IMG' && node.getAttribute('alt')) out.push(' ' + node.getAttribute('alt') + ' ');
      const block = BLOCK.has(tag);
      if (block) out.push('\n');
      const close = format && node.nodeType === 1 ? openFormat(node, tag, out, active) : null;
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
      if (close) close();
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

  let signInForm = false;
  let title = '';
  let scripts = 0;
  let emptyRoot = false;
  try {
    signInForm = Boolean(doc.querySelector('input[type=password i], input[autocomplete~="username" i], input[autocomplete~="current-password" i]'));
    title = String(doc.title || '').slice(0, 200);
    scripts = doc.getElementsByTagName('script').length;
    // The element that single-page apps fill in, still empty.
    emptyRoot = Array.from(doc.querySelectorAll('#root, #app, #__next, #__nuxt, app-root, [ng-app], [ng-version], [data-reactroot]'))
      .some((n) => !n.firstElementChild && !String(n.textContent || '').trim());
  } catch {
    // not an HTML document
  }
  return Object.assign(read(), { signInForm, title, scripts, emptyRoot });

  function read() {
    try {
      const expect = spec && spec.expect;
      if (expect && doc.location && typeof window !== 'undefined' && window.top === window) {
        const here = String(doc.location.href).split('#')[0];
        if ((expect.url && here !== String(expect.url).split('#')[0]) || (expect.origin && doc.location.origin !== expect.origin)) {
          return { ok: false, error: 'The tab no longer shows this page' };
        }
      }
      const selectors = (spec && spec.selectors) || [];
      excluded = new Set(((spec && spec.excludes) || []).flatMap(find));
      const html = spec && spec.captureHtml ? newHtmlBuffer() : null;
      const format = Boolean(spec && spec.captureFormat);
      const formatParts = [];
      const finish = (result) => {
        if (html && html.size <= MAX_HTML) result.html = html.parts.join('');
        if (format) result.format = formatParts.filter(Boolean).join('\n');
        return result;
      };
      if (selectors.length === 0) {
        const root = doc.body || doc.documentElement;
        if (!root) return { ok: false, error: 'Page has no content' };
        if (html) htmlOf(root, html);
        if (format) formatParts.push(textOf(root, true));
        return finish({ ok: true, text: textOf(root), matched: 1 });
      }
      const parts = [];
      let matched = 0;
      for (const sel of selectors) {
        const nodes = find(sel).filter((n) => !excluded.has(n));
        matched += nodes.length;
        for (const node of nodes) {
          if (html && node.nodeType === 1) htmlOf(node, html);
          const element = node.nodeType === 1 || node.nodeType === 9;
          const part = sel.attr ? attrOf(node, sel.attr)
            : element ? textOf(node) : String(node.nodeValue ?? node.textContent ?? '');
          parts.push(part);
          if (format) formatParts.push(!sel.attr && element ? textOf(node, true) : part);
        }
      }
      if (matched === 0) {
        const root = doc.body || doc.documentElement;
        excluded = new Set();
        return { ok: false, error: 'None of the selected elements were found on the page', pageText: root && !userTab ? textOf(root).slice(0, 2000) : '' };
      }
      return finish({ ok: true, text: parts.filter(Boolean).join('\n'), matched });
    } catch (e) {
      return { ok: false, error: 'Selector error: ' + (e && e.message ? e.message : String(e)) };
    }
  }
}
