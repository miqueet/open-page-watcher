// Reads the full text of code editors (CodeMirror 5 and 6, Monaco, Ace) on a
// page. These editors only draw the lines that are on screen, so the page's
// text holds just the first screenful, without its indentation. The whole
// text lives in the editor's own data, which only the page's scripts can see,
// so this function runs in the page's world (chrome.scripting world 'MAIN').
//
// It must stay self-contained (it is injected with { func: readEditors }).
// Everything it returns comes from the page and is treated as untrusted
// text: it is never run, and only ever saved or compared as text. It reads
// nothing but the editors' text and is passed nothing but limits.
//
// Returns { editors: [{ kind, source, text?, chars, lines }], frameUrl }.
// The list follows the order of the outermost editor elements in the page,
// which the extractor (running separately in the extension's own world)
// finds the same way. source is 'model' (the editor's own data), 'page-data'
// (the text the page handed to the editor), 'copy' (what the editor itself
// would copy after "select all"), or '' when none of these worked.
//
// options.copy allows the last way: Monaco bundled into an app keeps no data
// anywhere a script can reach, but its own copy handler writes the selected
// text into the copy event. The function selects all and sends the editor a
// made-up copy event carrying its own empty DataTransfer, then reads that.
// The system clipboard is never touched (pages can't reach it with made-up
// events). It changes the editor's selection, so it is only allowed in the
// hidden window the extension opened, never in the user's own tabs.
export function readEditors(options = {}) {
  const SELECTOR = '.cm-editor, .CodeMirror, .monaco-editor, .ace_editor';
  const maxChars = Number(options.maxChars) > 0 ? Number(options.maxChars) : 2_000_000;
  let frameUrl = '';
  try {
    frameUrl = String(location.href);
  } catch {
    // no location
  }
  const editors = [];
  let total = 0;
  let nodes = [];
  try {
    nodes = Array.from(document.querySelectorAll(SELECTOR))
      .filter((n) => !(n.parentElement && n.parentElement.closest(SELECTOR)))
      .slice(0, 50);
  } catch {
    return { editors, frameUrl };
  }

  const kindOf = (n) => {
    const c = n.classList;
    if (c.contains('cm-editor')) return 'codemirror6';
    if (c.contains('CodeMirror')) return 'codemirror5';
    if (c.contains('monaco-editor')) return 'monaco';
    return 'ace';
  };
  const asText = (v) => (typeof v === 'string' ? v : null);

  function fromModel(node, kind) {
    if (kind === 'codemirror6') {
      // Newer versions keep a "tile" on each element, older ones a "view".
      const content = node.querySelector('.cm-content');
      for (const holder of [content, node]) {
        if (!holder) continue;
        for (const t of [holder.cmTile, holder.cmView]) {
          if (!t || typeof t !== 'object') continue;
          const view = (t.root && t.root.view) || (t.rootView && t.rootView.view) || t.view;
          const doc = view && view.state && view.state.doc;
          if (doc && typeof doc.toString === 'function') return asText(doc.toString());
        }
      }
      return null;
    }
    if (kind === 'codemirror5') {
      const cm = node.CodeMirror;
      return cm && typeof cm.getValue === 'function' ? asText(cm.getValue('\n')) : null;
    }
    if (kind === 'ace') {
      const editor = node.env && node.env.editor;
      return editor && typeof editor.getValue === 'function' ? asText(editor.getValue()) : null;
    }
    // Monaco keeps nothing on its elements; its API is global when the page
    // loads it the usual way.
    const api = globalThis.monaco && globalThis.monaco.editor;
    if (!api) return null;
    const list = typeof api.getEditors === 'function' ? api.getEditors() : [];
    for (const e of list) {
      const dom = e && typeof e.getDomNode === 'function' ? e.getDomNode() : null;
      if (dom && (dom === node || node.contains(dom) || dom.contains(node))) {
        const model = typeof e.getModel === 'function' ? e.getModel() : null;
        if (model && typeof model.getValue === 'function') return asText(model.getValue());
      }
    }
    const models = typeof api.getModels === 'function' ? api.getModels() : [];
    if (models.length === 1 && nodes.filter((n) => kindOf(n) === 'monaco').length === 1) {
      return asText(models[0].getValue());
    }
    return null;
  }

  // Every line the editor shows must be in a guessed text, in order.
  function fitsShown(node, kind, text) {
    const shown = shownLines(node, kind);
    if (!shown.length) return false;
    let at = 0;
    for (const line of shown) {
      const i = text.indexOf(line, at);
      if (i < 0) return false;
      at = i + line.length;
    }
    return true;
  }

  // Select all, then ask the editor to copy into an event we hold.
  function fromCopy(node, kind) {
    if (kind !== 'monaco') return null;
    const target = node.querySelector('.native-edit-context, textarea.inputarea, textarea');
    if (!target) return null;
    target.focus({ preventScroll: true });
    // A hidden window has no focus, so Chrome may not send the focus events
    // the editor waits for before it takes keys.
    if (!document.hasFocus()) {
      target.dispatchEvent(new FocusEvent('focus'));
      target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    }
    const mac = /Mac|iPhone|iPad/.test(String(navigator.platform || ''));
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true,
    }));
    const data = new DataTransfer();
    target.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    const text = data.getData('text/plain');
    target.blur();
    if (!text) throw new Error('Copying from the editor gave nothing');
    if (!fitsShown(node, kind, text)) throw new Error(`Copying from the editor gave ${text.split('\n').length} lines that don't match what it shows`);
    return text;
  }

  // The lines the editor shows, as plain text, to check a guess against.
  function shownLines(node, kind) {
    const pick = {
      codemirror6: '.cm-content .cm-line',
      codemirror5: '.CodeMirror-code pre.CodeMirror-line',
      monaco: '.view-lines .view-line',
      ace: '.ace_text-layer .ace_line',
    }[kind];
    return Array.from(node.querySelectorAll(pick))
      .map((l) => String(l.textContent || '').replace(/[ ​]/g, ' ').trim())
      .filter(Boolean);
  }

  // Pages built with React hand the editor its text as a property. Used only
  // when the editor's own data can't be reached, and only if every line the
  // editor shows is in that text, in order.
  function fromPageData(node, kind) {
    const fits = (text) => fitsShown(node, kind, text);
    for (let el = node, depth = 0; el && depth < 4; el = el.parentElement, depth++) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      let fiber = key ? el[key] : null;
      for (let up = 0; fiber && up < 25; fiber = fiber.return, up++) {
        const props = fiber.memoizedProps;
        if (!props || typeof props !== 'object') continue;
        for (const name of ['value', 'defaultValue', 'code', 'doc', 'content', 'initialValue']) {
          const v = props[name];
          if (typeof v === 'string' && v.length && fits(v)) return v;
        }
      }
      if (key) break;
    }
    return null;
  }

  const message = (e) => String((e && e.message) || e).slice(0, 200);

  // What the page is built with, by name only, to explain why an editor's
  // data can or can't be reached.
  function pageHints() {
    const hints = {
      focused: document.hasFocus(),
      visibility: document.visibilityState,
      globals: ['monaco', 'require', 'define', 'ace', 'CodeMirror'].filter((k) => k in globalThis),
      frameworks: [],
    };
    try {
      const root = document.querySelector('#root, #app, #__next, [data-reactroot]') || document.body;
      const keys = root ? Object.keys(root).concat(Object.keys(root.firstElementChild || {})) : [];
      if (keys.some((k) => k.startsWith('__react'))) hints.frameworks.push('react');
      if (document.querySelector('[ng-version]')) hints.frameworks.push('angular');
      if (root && (root.__vue_app__ || root.__vue__)) hints.frameworks.push('vue');
      if (Object.keys(globalThis).some((k) => k.startsWith('webpackChunk') || k === 'webpackJsonp')) hints.frameworks.push('webpack');
      if (document.querySelector('script[type="module"]')) hints.frameworks.push('es-modules');
    } catch {
      // only hints
    }
    return hints;
  }

  // How big the editor says its text is, from the height it reserves for
  // scrolling, against the lines it actually drew.
  function sizeHints(node, kind) {
    const lines = Array.from(node.querySelectorAll({
      codemirror6: '.cm-content .cm-line',
      codemirror5: '.CodeMirror-code pre.CodeMirror-line',
      monaco: '.view-lines .view-line',
      ace: '.ace_text-layer .ace_line',
    }[kind]));
    const out = { drawnLines: lines.length };
    const lineHeight = lines.length ? lines[0].getBoundingClientRect().height : 0;
    // The scrolling height the editor reserves for all its lines.
    let total = 0;
    if (kind === 'monaco') {
      const track = node.querySelector('.scrollbar.vertical');
      const slider = track && track.querySelector('.slider');
      const t = track ? track.getBoundingClientRect().height : 0;
      const h = slider ? slider.getBoundingClientRect().height : 0;
      if (t > 0 && h > 0) {
        out.scrollsFurther = h < t - 1;
        // Monaco never draws its slider under 20px, so that size only says "long".
        if (h > 20) total = (t / h) * node.getBoundingClientRect().height;
      }
    } else {
      const scroller = node.querySelector({ codemirror6: '.cm-scroller', codemirror5: '.CodeMirror-scroll', ace: '.ace_scrollbar-v' }[kind]);
      if (scroller) {
        out.scrollsFurther = scroller.scrollHeight > scroller.clientHeight + 1;
        total = scroller.scrollHeight;
      }
    }
    if (lineHeight > 0 && total > 0) out.estimatedLines = Math.round(total / lineHeight);
    out.input = node.querySelector('.native-edit-context') ? 'edit-context'
      : node.querySelector('textarea') ? 'textarea'
        : node.querySelector('[contenteditable]') ? 'contenteditable' : 'none';
    return out;
  }

  const page = pageHints();
  for (const node of nodes) {
    const kind = kindOf(node);
    let text = null;
    let source = '';
    let error = '';
    const attempts = [];
    try {
      text = fromModel(node, kind);
      if (text !== null) source = 'model';
      attempts.push({ way: 'model', result: text !== null ? 'read' : kind === 'monaco' && !globalThis.monaco ? 'no monaco global' : 'editor data not found' });
    } catch (e) {
      error = message(e);
      attempts.push({ way: 'model', result: `failed: ${error}` });
    }
    if (text === null) {
      try {
        text = fromPageData(node, kind);
        if (text !== null) source = 'page-data';
        attempts.push({ way: 'page-data', result: text !== null ? 'read' : page.frameworks.includes('react') ? 'no matching React property' : 'not a React page' });
      } catch (e) {
        attempts.push({ way: 'page-data', result: `failed: ${message(e)}` });
      }
    }
    if (text === null && options.copy === true) {
      try {
        text = fromCopy(node, kind);
        if (text !== null) source = 'copy';
        attempts.push({ way: 'copy', result: text !== null ? 'read' : 'not tried for this editor' });
      } catch (e) {
        error = message(e);
        attempts.push({ way: 'copy', result: `failed: ${error}` });
      }
    }
    const entry = { kind, source, attempts };
    try {
      entry.hints = sizeHints(node, kind);
    } catch {
      // only hints
    }
    if (error && text === null) entry.error = error;
    if (text !== null) {
      text = text.replace(/\r\n?/g, '\n');
      if (total + text.length > maxChars) {
        entry.source = '';
        entry.error = 'The editor holds more text than can be kept';
      } else {
        total += text.length;
        entry.text = text;
        entry.chars = text.length;
        entry.lines = text ? text.split('\n').length : 0;
      }
    }
    editors.push(entry);
  }
  return { editors, frameUrl, page: nodes.length ? page : undefined };
}
