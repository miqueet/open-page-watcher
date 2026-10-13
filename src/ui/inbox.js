import {
  call, getWatches, getHistory, hasAccess, requestAccess, onChanged, timeAgo, formatInterval, el,
} from './api.js';
import { diffText } from '../lib/diff.js';
import { CONDITION_TYPES } from '../lib/conditions.js';
import { DEFAULT_INTERVAL_MINUTES, DEFAULT_HISTORY } from '../lib/watch.js';

const $ = (id) => document.getElementById(id);
const state = { watches: [], filter: 'all', search: '', editing: false };

// ---------------------------------------------------------------------------
// Routing: #/w/<id>, #/w/<id>/edit, #/new

function route() {
  const m = /^#\/(?:w\/([^/]+)(\/edit)?|(new))$/.exec(location.hash);
  if (!m) return { id: null, edit: false, isNew: false };
  return { id: m[1] ? decodeURIComponent(m[1]) : null, edit: !!m[2], isNew: !!m[3] };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

window.addEventListener('hashchange', render);

// ---------------------------------------------------------------------------
// List

function matchesFilter(w) {
  if (state.filter === 'unread' && !w.unread) return false;
  if (state.filter === 'errors' && !w.lastError) return false;
  if (state.filter === 'paused' && !w.paused) return false;
  const q = state.search.trim().toLowerCase();
  return !q || w.name.toLowerCase().includes(q) || w.url.toLowerCase().includes(q);
}

function subtitle(w) {
  if (w.paused) return el('span', { class: 'sub muted' }, 'Paused');
  if (w.lastError) return el('span', { class: 'sub error' }, w.lastError);
  if (w.lastChangedAt) return el('span', { class: 'sub muted' }, `Changed ${timeAgo(w.lastChangedAt)}`);
  return el('span', { class: 'sub muted' }, `Checked ${timeAgo(w.lastCheckedAt)}`);
}

function renderList() {
  const { id } = route();
  const items = state.watches
    .filter(matchesFilter)
    .sort((a, b) => (b.unread - a.unread) || (b.lastChangedAt - a.lastChangedAt) || a.name.localeCompare(b.name));
  $('list').replaceChildren(...items.map((w) => el('li', {},
    el('button', {
      class: [w.unread ? 'unread' : '', w.id === id ? 'selected' : ''].join(' '),
      onclick: () => go(`#/w/${encodeURIComponent(w.id)}`),
      title: w.url,
    }, el('span', { class: 'dot' }), el('span', { class: 'name' }, w.name), subtitle(w)))));
  const empty = $('list-empty');
  empty.hidden = items.length > 0;
  empty.textContent = state.watches.length
    ? 'Nothing matches.'
    : 'No watches yet. Open a page and click the extension icon, or use "Add watch".';
  for (const b of document.querySelectorAll('.filters button')) {
    b.classList.toggle('active', b.dataset.filter === state.filter);
  }
}

// ---------------------------------------------------------------------------
// Detail

async function renderDetail() {
  const { id, edit, isNew } = route();
  const detail = $('detail');
  if (isNew) return detail.replaceChildren(watchForm(null));
  const watch = state.watches.find((w) => w.id === id);
  if (!watch) {
    return detail.replaceChildren(el('p', { class: 'empty-detail' },
      state.watches.length ? 'Select a watch to see its changes.' : 'Add your first watch to get started.'));
  }
  if (edit) return detail.replaceChildren(watchForm(watch));

  if (watch.unread) call('setRead', { id, read: true }).catch(() => {});

  const [history, access] = await Promise.all([getHistory(id), hasAccess(watch.url)]);
  if (route().id !== id || route().edit) return; // navigated away meanwhile

  const banner = access ? null : el('div', { class: 'banner' },
    el('span', {}, `Open Page Watcher needs your permission to read ${new URL(watch.url).hostname}.`),
    el('button', {
      class: 'primary',
      onclick: async () => {
        if (await requestAccess([watch.url])) {
          toast('Access granted. Checking now.');
          await call('checkNow', { id }).catch((e) => toast(e.message));
        }
      },
    }, 'Allow'));

  const meta = [
    `Checked ${timeAgo(watch.lastCheckedAt)}`,
    watch.lastChangedAt ? `changed ${timeAgo(watch.lastChangedAt)}` : 'no changes yet',
    formatInterval(watch.intervalMinutes),
    watch.mode === 'tab' ? 'renders in a tab' : 'fetched without running scripts',
    watch.selectors.length ? `${watch.selectors.length} selected part${watch.selectors.length > 1 ? 's' : ''}` : 'whole page',
  ].join(' · ');

  detail.replaceChildren(...[
    el('h1', {}, watch.name),
    el('a', { class: 'url', href: watch.url, target: '_blank', rel: 'noopener noreferrer' }, watch.url),
    el('div', { class: 'meta muted' }, meta),
    banner,
    watch.lastError ? el('p', { class: 'error' }, watch.lastError) : null,
    el('div', { class: 'row' },
      el('button', {
        class: 'primary',
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Checking…';
          await call('checkNow', { id }).catch((err) => toast(err.message));
        },
      }, 'Check now'),
      el('button', { onclick: () => go(`#/w/${encodeURIComponent(id)}/edit`) }, 'Edit'),
      el('button', { onclick: () => saveWatch({ ...watch, paused: !watch.paused }) }, watch.paused ? 'Resume' : 'Pause'),
      el('button', { onclick: () => call('setRead', { id, read: false }) }, 'Mark unread'),
      el('button', {
        class: 'danger',
        onclick: async () => {
          if (!confirm(`Delete "${watch.name}" and its history?`)) return;
          await call('deleteWatch', { id });
          go('#/');
        },
      }, 'Delete')),
    historyView(history),
  ].filter(Boolean));
}

function versionLabel(entry, i) {
  return `Version ${i + 1} · ${new Date(entry.t).toLocaleString()}`;
}

function historyView(history) {
  const wrap = el('section');
  if (history.length === 0) {
    wrap.append(el('p', { class: 'muted' }, 'No content captured yet.'));
    return wrap;
  }
  if (history.length === 1) {
    wrap.append(
      el('p', { class: 'muted' }, `Baseline captured ${new Date(history[0].t).toLocaleString()}. Changes will appear here.`),
      el('div', { class: 'diff' }, ...history[0].text.split('\n').map((line) => el('div', {}, line))),
    );
    return wrap;
  }

  const options = () => history.map((h, i) => el('option', { value: String(i) }, versionLabel(h, i)));
  const from = el('select', { 'aria-label': 'Older version' }, options());
  const to = el('select', { 'aria-label': 'Newer version' }, options());
  from.value = String(history.length - 2);
  to.value = String(history.length - 1);
  const onlyChanges = el('input', { type: 'checkbox', checked: true });
  const output = el('div', { class: 'diff' });

  const draw = () => {
    const lines = diffText(history[Number(from.value)].text, history[Number(to.value)].text);
    output.replaceChildren(...diffNodes(lines, onlyChanges.checked));
  };
  from.addEventListener('change', draw);
  to.addEventListener('change', draw);
  onlyChanges.addEventListener('change', draw);
  draw();

  wrap.append(
    el('div', { class: 'versions' }, 'Compare', from, 'with', to,
      el('label', { class: 'inline' }, onlyChanges, 'Only show changed lines')),
    output,
  );
  return wrap;
}

function diffNodes(lines, onlyChanges) {
  const CONTEXT = 2;
  const changed = lines.map((l) => l.type !== 'eq');
  const keep = lines.map((_, i) => {
    if (!onlyChanges) return true;
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) {
      if (changed[j]) return true;
    }
    return false;
  });
  const nodes = [];
  let skipped = 0;
  const flush = () => {
    if (skipped) nodes.push(el('div', { class: 'gap' }, `… ${skipped} unchanged line${skipped > 1 ? 's' : ''}`));
    skipped = 0;
  };
  lines.forEach((line, i) => {
    if (!keep[i]) {
      skipped++;
      return;
    }
    flush();
    if (line.type === 'mod') {
      nodes.push(el('div', {}, ...line.parts.map((p) => {
        if (p.op === 'add') return el('ins', {}, p.value);
        if (p.op === 'del') return el('del', {}, p.value);
        return p.value;
      })));
    } else {
      nodes.push(el('div', { class: line.type === 'eq' ? '' : line.type }, line.text));
    }
  });
  flush();
  if (!lines.some((l) => l.type !== 'eq')) nodes.push(el('div', { class: 'gap' }, 'These versions are identical.'));
  return nodes;
}

// ---------------------------------------------------------------------------
// Add / edit form

function intervalParts(minutes) {
  if (minutes % 1440 === 0) return [minutes / 1440, 1440];
  if (minutes % 60 === 0) return [minutes / 60, 60];
  return [minutes, 1];
}

function selectorsToText(selectors) {
  return selectors.map((s) => (s.type === 'xpath' ? `xpath:${s.expr}` : s.expr)).join('\n');
}

function textToSelectors(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (
    l.startsWith('xpath:') ? { type: 'xpath', expr: l.slice(6).trim() } : { type: 'css', expr: l }
  ));
}

function watchForm(watch) {
  const w = watch || {
    name: '', url: '', selectors: [], regexFilter: '', mode: 'fetch', renderDelaySeconds: 3,
    sendCookies: false, intervalMinutes: DEFAULT_INTERVAL_MINUTES, historyLimit: DEFAULT_HISTORY,
    condition: { type: 'any', value: '' }, notify: true, sound: false,
  };
  const [n, unit] = intervalParts(w.intervalMinutes);

  const f = {
    name: el('input', { value: w.name, placeholder: 'Defaults to the site name' }),
    url: el('input', { type: 'url', value: w.url, required: true, placeholder: 'https://example.com/page' }),
    selectors: el('textarea', { rows: 3, placeholder: '#price\n.status-banner\nxpath://table[1]//tr[2]' }),
    regexFilter: el('input', { value: w.regexFilter, placeholder: 'Optional, e.g. \\$[\\d,.]+' }),
    every: el('input', { type: 'number', min: 1, value: String(n), required: true }),
    unit: el('select', {},
      el('option', { value: '1' }, 'minutes'), el('option', { value: '60' }, 'hours'), el('option', { value: '1440' }, 'days')),
    mode: el('select', {},
      el('option', { value: 'fetch' }, 'Download the page without running its scripts (safer, faster)'),
      el('option', { value: 'tab' }, 'Open it in a hidden window so its scripts run (for dynamic pages)')),
    renderDelaySeconds: el('input', { type: 'number', min: 0, max: 60, value: String(w.renderDelaySeconds) }),
    sendCookies: el('input', { type: 'checkbox', checked: w.sendCookies }),
    condType: el('select', {}, Object.entries(CONDITION_TYPES).map(([k, v]) => el('option', { value: k }, v.label))),
    condValue: el('input', { value: w.condition.value }),
    notify: el('input', { type: 'checkbox', checked: w.notify }),
    sound: el('input', { type: 'checkbox', checked: w.sound }),
    historyLimit: el('input', { type: 'number', min: 2, max: 200, value: String(w.historyLimit) }),
  };
  f.selectors.value = selectorsToText(w.selectors);
  f.unit.value = String(unit);
  f.mode.value = w.mode;
  f.condType.value = w.condition.type;

  const delayRow = el('label', { class: 'field' }, el('span', {}, 'Wait after load (seconds)'), f.renderDelaySeconds);
  const cookieRow = el('label', { class: 'check' }, f.sendCookies,
    el('span', {}, 'Send my cookies for this site',
      el('div', { class: 'hint' }, 'Needed for pages behind a login. Off by default so watches can’t act as you.')));
  const condValueRow = el('label', { class: 'field' }, el('span', {}, 'Value'), f.condValue);
  const sync = () => {
    delayRow.hidden = f.mode.value !== 'tab';
    cookieRow.hidden = f.mode.value === 'tab';
    condValueRow.hidden = !CONDITION_TYPES[f.condType.value].needsValue;
  };
  f.mode.addEventListener('change', sync);
  f.condType.addEventListener('change', sync);
  sync();

  const error = el('p', { class: 'error', hidden: true });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.hidden = true;
      const url = f.url.value.trim();
      // Ask for site access first, while we still have the click's user gesture.
      let granted = false;
      try {
        granted = await requestAccess([url]);
      } catch {
        error.hidden = false;
        error.textContent = 'Enter a full http:// or https:// address.';
        return;
      }
      const data = {
        ...(watch || {}),
        name: f.name.value,
        url,
        selectors: textToSelectors(f.selectors.value),
        regexFilter: f.regexFilter.value,
        intervalMinutes: Number(f.every.value) * Number(f.unit.value),
        mode: f.mode.value,
        renderDelaySeconds: Number(f.renderDelaySeconds.value),
        sendCookies: f.sendCookies.checked,
        condition: { type: f.condType.value, value: f.condValue.value },
        notify: f.notify.checked,
        sound: f.sound.checked,
        historyLimit: Number(f.historyLimit.value),
      };
      try {
        const { id } = await call(watch ? 'updateWatch' : 'createWatch', { watch: data });
        if (!granted) toast('Saved. Site access was not granted, so checks will fail until you allow it.');
        else toast('Saved.');
        go(`#/w/${encodeURIComponent(id)}`);
      } catch (err) {
        error.hidden = false;
        error.textContent = err.message;
      }
    },
  },
  el('h1', {}, watch ? `Edit ${watch.name}` : 'Add a watch'),
  el('label', { class: 'field' }, el('span', {}, 'Page address'), f.url),
  el('label', { class: 'field' }, el('span', {}, 'Name'), f.name),
  el('fieldset', {}, el('legend', {}, 'What to watch'),
    el('label', { class: 'field' }, el('span', {}, 'Parts of the page (leave empty for the whole page)'), f.selectors,
      el('span', { class: 'hint' }, 'One CSS selector per line. Start a line with xpath: for XPath. The "Select parts of page" button in the toolbar popup fills this in for you.')),
    el('label', { class: 'field' }, el('span', {}, 'Keep only text matching this regular expression'), f.regexFilter)),
  el('fieldset', {}, el('legend', {}, 'How to check'),
    el('div', { class: 'field' }, el('span', {}, 'Check every'), el('div', { class: 'inline' }, f.every, f.unit)),
    el('label', { class: 'field' }, el('span', {}, 'Loading'), f.mode),
    delayRow,
    cookieRow),
  el('fieldset', {}, el('legend', {}, 'Alerts'),
    el('label', { class: 'field' }, el('span', {}, 'Alert when'), f.condType),
    condValueRow,
    el('label', { class: 'check' }, f.notify, el('span', {}, 'Desktop notification')),
    el('label', { class: 'check' }, f.sound, el('span', {}, 'Play a sound')),
    el('label', { class: 'field' }, el('span', {}, 'Versions to keep'), f.historyLimit)),
  error,
  el('div', { class: 'row' },
    el('button', { class: 'primary', type: 'submit' }, watch ? 'Save' : 'Add watch'),
    el('button', { type: 'button', onclick: () => go(watch ? `#/w/${encodeURIComponent(watch.id)}` : '#/') }, 'Cancel')));
  return form;
}

async function saveWatch(data) {
  try {
    await call('updateWatch', { watch: data });
  } catch (e) {
    toast(e.message);
  }
}

// ---------------------------------------------------------------------------
// Toolbar

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

$('add').addEventListener('click', () => go('#/new'));
$('mark-all').addEventListener('click', () => call('markAllRead'));
$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderList();
});
for (const b of document.querySelectorAll('.filters button')) {
  b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    renderList();
  });
}

$('export').addEventListener('click', async () => {
  const { data } = await call('exportAll');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `open-page-watcher-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('That file is too large');
    const data = JSON.parse(await file.text());
    const res = await call('importAll', { data });
    toast(`Imported ${res.imported} watch${res.imported === 1 ? '' : 'es'}${res.skipped.length ? `, skipped ${res.skipped.length}` : ''}. Open each one and click Allow to grant site access.`);
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------

let renderQueued = false;
async function refresh() {
  state.watches = await getWatches();
  render();
}

function render() {
  renderList();
  // Don't wipe a form the user is typing in.
  const { edit, isNew } = route();
  if ((edit || isNew) && $('detail').querySelector('form') && document.activeElement?.closest('form')) return;
  renderDetail();
}

onChanged(() => {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    refresh();
  }, 100);
});

refresh();
