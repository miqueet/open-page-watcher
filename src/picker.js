// Element picker. Injected into the active tab only when the user clicks
// "Select parts of this page" in the popup. Runs in the extension's isolated
// world, so the page's own scripts can't see or call it.
(() => {
  if (window.__openPageWatcherPicker) return;
  window.__openPageWatcherPicker = true;

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
      button { font: inherit; border-radius: 6px; padding: 6px 12px; cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #111827; }
      button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
      button:disabled { opacity: 0.5; cursor: default; }
      .msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    </style>
    <div class="box hover" hidden></div>
    <div class="sels"></div>
    <div class="bar">
      <span class="msg">Click parts to watch. Click inside a selection to leave part out. Enter saves, Esc cancels.</span>
      <button class="primary save" disabled>Save (0)</button>
      <button class="cancel">Cancel</button>
    </div>`;

  const hoverBox = root.querySelector('.hover');
  const selBoxes = root.querySelector('.sels');
  const bar = root.querySelector('.bar');
  const msg = root.querySelector('.msg');
  const saveBtn = root.querySelector('.save');
  const cancelBtn = root.querySelector('.cancel');
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
    saveBtn.disabled = selected.length === 0;
    saveBtn.textContent = excluded.length ? `Save (${selected.length}, ${excluded.length} left out)` : `Save (${selected.length})`;
  }

  function isOurs(target) {
    return target === host || bar.contains(target);
  }

  function onMove(e) {
    const el = e.target;
    if (isOurs(el) || !(el instanceof Element)) {
      hoverBox.hidden = true;
      return;
    }
    hoverBox.hidden = false;
    place(hoverBox, el);
  }

  function onClick(e) {
    if (isOurs(e.target) || e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = e.target;
    if (!(el instanceof Element)) return;
    const drop = (list, test) => {
      for (let j = list.length - 1; j >= 0; j--) if (test(list[j])) list.splice(j, 1);
    };
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
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
    } else if (e.key === 'Enter' && selected.length && !saveBtn.disabled) {
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

  async function save() {
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    const selectors = selected.map(selectorFor);
    const excludes = excluded.map(selectorFor);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'picker:save', selectors, excludes });
      if (!res?.ok) throw new Error(res?.error || 'Could not save');
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

  function redrawAll() {
    hoverBox.hidden = true;
    redraw();
  }

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', stop);
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit']) document.addEventListener(t, block, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', redrawAll, true);
  window.addEventListener('resize', redrawAll, true);
})();
