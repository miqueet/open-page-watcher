// Element picker. Injected into the active tab only when the user starts it
// from the popup, the right-click menu or the keyboard shortcut. Runs in the extension's isolated
// world, so the page's own scripts can't see or call it.
(() => {
  if (window.__openPageWatcherPicker) return;
  window.__openPageWatcherPicker = true;
  // Set by the extension just before this file when the picker was opened
  // from the watch editor: the parts already chosen, and a token that sends
  // the picks back to that editor.
  const config = window.__openPageWatcherPickerConfig || null;
  delete window.__openPageWatcherPickerConfig;
  const forForm = typeof config?.token === 'string';

  const selected = [];
  const excluded = [];
  const host = document.createElement('div');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  const root = host.attachShadow({ mode: 'closed' });

  root.innerHTML = `
    <style>
      .box { position: fixed; pointer-events: none; box-sizing: border-box; border-radius: 3px; }
      .hover { border: 2px dashed #2563eb; background: rgba(37, 99, 235, 0.08); }
      .sel { border: 2px solid #16a34a; background: rgba(22, 163, 74, 0.12); }
      .exc { border: 2px solid #dc2626; background: rgba(220, 38, 38, 0.18); }
      .bar {
        position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
        pointer-events: auto; display: flex; gap: 8px; align-items: center;
        font: 14px/1.4 system-ui, sans-serif; color: #111827; background: #fff;
        border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); max-width: calc(100vw - 32px);
      }
      button { white-space: nowrap; font: inherit; border-radius: 6px; padding: 6px 12px; cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #111827; }
      button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
      button:disabled { opacity: 0.5; cursor: default; }
      .msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      label.keep { display: flex; gap: 4px; align-items: center; white-space: nowrap; cursor: pointer; }
      label.keep[hidden] { display: none; }
    </style>
    <div class="box hover" hidden></div>
    <div class="sels"></div>
    <div class="bar">
      <span class="msg">Click parts to watch. Click inside a selection to leave part out. Enter saves, Esc cancels.</span>
      <label class="keep" hidden><input type="checkbox" checked><span></span></label>
      <button class="primary save" disabled>Save (0)</button>
      <button class="cancel">Cancel</button>
    </div>`;

  const hoverBox = root.querySelector('.hover');
  const selBoxes = root.querySelector('.sels');
  const bar = root.querySelector('.bar');
  const msg = root.querySelector('.msg');
  const saveBtn = root.querySelector('.save');
  const cancelBtn = root.querySelector('.cancel');
  const keepLabel = root.querySelector('.keep');
  const keepBox = keepLabel.querySelector('input');
  document.documentElement.appendChild(host);

  function place(box, el) {
    const r = el.getBoundingClientRect();
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
  }

  function redraw() {
    const box = (el, cls) => {
      const b = document.createElement('div');
      b.className = `box ${cls}`;
      place(b, el);
      return b;
    };
    selBoxes.replaceChildren(...selected.map((el) => box(el, 'sel')), ...excluded.map((el) => box(el, 'exc')));
    if (forForm) {
      // Picking nothing here means watching the whole page.
      const n = selected.length + (keepBox.checked ? kept.selectors.length : 0);
      saveBtn.disabled = false;
      saveBtn.textContent = n ? `Use ${n} part${n > 1 ? 's' : ''}${excluded.length ? `, ${excluded.length} left out` : ''}` : 'Use whole page';
      return;
    }
    saveBtn.disabled = selected.length === 0;
    saveBtn.textContent = excluded.length ? `Save (${selected.length}, ${excluded.length} left out)` : `Save (${selected.length})`;
  }

  function drop(list, test) {
    for (let j = list.length - 1; j >= 0; j--) if (test(list[j])) list.splice(j, 1);
  }

  function isOurs(target) {
    return target === host || bar.contains(target);
  }

  // Only real input from the user counts: the page could dispatch fake
  // clicks and key presses to pick and save parts of its choosing.
  function onMove(e) {
    if (!e.isTrusted) return;
    const el = e.target;
    if (isOurs(el) || !(el instanceof Element)) {
      hoverBox.hidden = true;
      return;
    }
    hoverBox.hidden = false;
    place(hoverBox, el);
  }

  function onClick(e) {
    if (!e.isTrusted || isOurs(e.target) || e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (excluded.includes(el)) {
      // Clicking an excluded part puts it back.
      drop(excluded, (x) => x === el);
    } else if (selected.includes(el)) {
      drop(selected, (x) => x === el);
      drop(excluded, (x) => el.contains(x));
    } else if (selected.some((s) => s.contains(el))) {
      // Inside a selection: leave this part out.
      drop(excluded, (x) => el.contains(x));
      excluded.push(el);
    } else {
      // Selecting a parent replaces its selected children.
      drop(selected, (x) => el.contains(x));
      drop(excluded, (x) => !selected.some((s) => s.contains(x)) && !el.contains(x));
      selected.push(el);
    }
    redraw();
  }

  function block(e) {
    if (!e.composedPath().includes(host)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onKey(e) {
    if (!e.isTrusted) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && (selected.length || forForm) && !saveBtn.disabled) {
      e.preventDefault();
      save();
    }
  }

  function cssEscape(s) {
    return CSS.escape(s);
  }

  function unique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  // Ids that look machine-generated tend to change between page loads.
  function stableId(id) {
    return id && !/\d{3,}|[a-f0-9]{8,}|^(ember|react|ng|:r)/i.test(id);
  }

  function selectorFor(el) {
    if (stableId(el.id) && unique(`#${cssEscape(el.id)}`)) return `#${cssEscape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node !== el && stableId(node.id) && unique(`#${cssEscape(node.id)}`)) {
        parts.unshift(`#${cssEscape(node.id)}`);
        break;
      }
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (node.tagName === 'BODY') break;
      node = parent;
    }
    // Shorten from the left while the selector still points at exactly this element.
    let best = parts.join(' > ');
    for (let i = 1; i < parts.length; i++) {
      const candidate = parts.slice(i).join(' > ');
      const matches = document.querySelectorAll(candidate);
      if (matches.length === 1 && matches[0] === el) best = candidate;
      else break;
    }
    return best;
  }

  // Parts chosen before, shown as already picked. Each element remembers the
  // line it came from, so a line that's still fully picked is given back
  // unchanged (keeping an XPath or an @attribute) rather than rewritten.
  const groups = []; // { line, list, els }
  const kept = { selectors: [], excludes: [] }; // lines that can't be shown here

  function findAll(line) {
    const expr = line.replace(/\s@[A-Za-z_:][\w:.-]*$/, '').trim();
    try {
      if (!expr.startsWith('xpath:')) return Array.from(document.querySelectorAll(expr));
      const r = document.evaluate(expr.slice(6).trim(), document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const found = [];
      for (let i = 0; i < r.snapshotLength; i++) {
        const n = r.snapshotItem(i);
        const e = n instanceof Element ? n : n?.parentElement;
        if (e && !found.includes(e)) found.push(e);
      }
      return found;
    } catch {
      return [];
    }
  }

  const shown = (e) => e.getClientRects().length > 0;

  function preload() {
    for (const line of config.selectors || []) {
      const found = findAll(line).filter(shown);
      const els = found.length <= 50 ? found.filter((e) => !selected.some((s) => s === e || s.contains(e))) : [];
      if (!els.length) {
        kept.selectors.push(line);
        continue;
      }
      // A bigger part replaces smaller ones picked before it; their lines
      // then aren't given back, since this one covers them.
      drop(selected, (x) => els.some((e) => e.contains(x)));
      selected.push(...els);
      groups.push({ line, list: selected, els });
    }
    for (const line of config.excludes || []) {
      const els = findAll(line).filter((e) => shown(e) && !excluded.includes(e) && selected.some((s) => s !== e && s.contains(e)));
      if (!els.length) {
        kept.excludes.push(line);
        continue;
      }
      excluded.push(...els);
      groups.push({ line, list: excluded, els });
    }
    const n = kept.selectors.length;
    keepLabel.hidden = n === 0;
    keepLabel.querySelector('span').textContent = `Keep ${n} part${n > 1 ? 's' : ''} not shown on this page`;
    keepLabel.title = kept.selectors.join('\n');
    keepBox.addEventListener('change', redraw);
    msg.textContent = 'Click parts to add or remove them, or inside one to leave part out.';
  }

  function toLines(list) {
    const lines = [];
    const covered = new Set();
    for (const g of groups) {
      if (g.list === list && g.els.every((e) => list.includes(e))) {
        lines.push(g.line);
        g.els.forEach((e) => covered.add(e));
      }
    }
    for (const e of list) if (!covered.has(e)) lines.push(selectorFor(e));
    return [...new Set(lines)];
  }

  async function save() {
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    const selectors = forForm ? [...toLines(selected), ...(keepBox.checked ? kept.selectors : [])] : selected.map(selectorFor);
    const excludes = forForm ? [...toLines(excluded), ...kept.excludes] : excluded.map(selectorFor);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'picker:save', selectors, excludes });
      if (!res?.ok) throw new Error(res?.error || 'Could not save');
      if (res.form) {
        msg.textContent = 'Done. Taking you back to the watch…';
        return;
      }
      msg.textContent = 'Saved. Open the extension to see this watch.';
      setTimeout(stop, 1800);
    } catch (e) {
      msg.textContent = `Not saved: ${e.message}`;
      cancelBtn.disabled = false;
      saveBtn.disabled = false;
    }
  }

  function stop() {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit']) document.removeEventListener(t, block, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', redrawAll, true);
    window.removeEventListener('resize', redrawAll, true);
    host.remove();
    delete window.__openPageWatcherPicker;
  }

  function cancel() {
    stop();
    chrome.runtime.sendMessage({ type: 'picker:cancel' }).catch(() => {});
  }

  function redrawAll() {
    hoverBox.hidden = true;
    redraw();
  }

  saveBtn.addEventListener('click', (e) => e.isTrusted && save());
  cancelBtn.addEventListener('click', (e) => e.isTrusted && cancel());
  // Lets the extension note which page the picker was started on; a save is
  // only accepted from that same page.
  chrome.runtime.sendMessage({ type: 'picker:start', token: forForm ? config.token : undefined }).catch(() => {});
  if (forForm) {
    preload();
    redraw();
  }
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit']) document.addEventListener(t, block, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', redrawAll, true);
  window.addEventListener('resize', redrawAll, true);
})();
