import {
  call, getWatches, getHistory, hasAccess, requestAccess, onChanged, timeAgo, formatInterval, el,
} from './api.js';
import { diffText } from '../lib/diff.js';
import { RULE_TYPES, RULE_SOURCES, normalizeCondition } from '../lib/conditions.js';
import { DEFAULT_INTERVAL_MINUTES, DEFAULT_HISTORY, SIGN_IN_ACTIONS, isHttpUrl } from '../lib/watch.js';
import { getLog, getSettings, DIGEST_CHOICES } from '../lib/storage.js';
import { visualDocument, sourceLines } from './visual.js';
import { numberSeries, numberChart } from './chart.js';
import { encryptBackup, decryptBackup, isEncrypted } from '../lib/backup.js';
import { getPolicy, isManaged, checkSiteAllowed } from '../lib/policy.js';
import { SIGN_IN_MESSAGE } from '../lib/signin.js';

const $ = (id) => document.getElementById(id);
const state = {
  watches: [],
  filter: 'all',
  label: null,
  search: '',
  checked: new Set(), // watches ticked for bulk actions
  view: 'text', // text | side | visual | source
  showDeleted: false,
  policy: null, // organization policy from managed storage
};

try {
  state.view = localStorage.getItem('opw:view') || 'text';
} catch {
  // storage unavailable; keep the default
}

// ---------------------------------------------------------------------------
// Routing: #/w/<id>, #/w/<id>/edit, #/new, #/settings

function route() {
  const m = /^#\/(?:w\/([^/]+)(\/edit)?|(new)|(settings))$/.exec(location.hash);
  if (!m) return { id: null, edit: false, isNew: false, settings: false };
  return { id: m[1] ? decodeURIComponent(m[1]) : null, edit: !!m[2], isNew: !!m[3], settings: !!m[4] };
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
  if (state.label && !w.labels?.includes(state.label)) return false;
  const q = state.search.trim().toLowerCase();
  return !q || w.name.toLowerCase().includes(q) || w.url.toLowerCase().includes(q)
    || (w.labels || []).some((l) => l.toLowerCase().includes(q));
}

function subtitle(w) {
  if (w.paused) return el('span', { class: 'sub muted' }, 'Paused');
  if (w.lastError) return el('span', { class: 'sub error' }, w.lastError);
  if (w.lastChangedAt) {
    return el('span', { class: 'sub muted', title: w.lastSummary || '' },
      `Changed ${timeAgo(w.lastChangedAt)}${w.lastSummary ? ` · ${w.lastSummary}` : ''}`);
  }
  return el('span', { class: 'sub muted' }, `Checked ${timeAgo(w.lastCheckedAt)}`);
}

function visibleWatches() {
  return state.watches
    .filter(matchesFilter)
    // Most recently changed first. Not unread-first: reading a watch would
    // move it and make j/k skip around.
    .sort((a, b) => (b.lastChangedAt - a.lastChangedAt) || a.name.localeCompare(b.name));
}

function renderList() {
  const { id } = route();
  const items = visibleWatches();
  const known = new Set(state.watches.map((w) => w.id));
  for (const x of state.checked) if (!known.has(x)) state.checked.delete(x);

  $('list').replaceChildren(...items.map((w) => el('li', {},
    el('input', {
      type: 'checkbox',
      checked: state.checked.has(w.id),
      'aria-label': `Select ${w.name}`,
      onchange: (e) => {
        if (e.target.checked) state.checked.add(w.id);
        else state.checked.delete(w.id);
        renderBulk();
      },
    }),
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

  const labels = [...new Set(state.watches.flatMap((w) => w.labels || []))].sort((a, b) => a.localeCompare(b));
  if (state.label && !labels.includes(state.label)) state.label = null;
  $('labels').replaceChildren(...labels.map((l) => el('button', {
    class: `chip ${state.label === l ? 'active' : ''}`,
    onclick: () => {
      state.label = state.label === l ? null : l;
      renderList();
    },
  }, l)));
  renderBulk();
}

function renderBulk() {
  const visible = visibleWatches().map((w) => w.id);
  $('bulk').hidden = state.watches.length === 0;
  const n = state.checked.size;
  $('bulk-count').textContent = n ? `${n} selected` : 'Select all';
  $('select-all').checked = visible.length > 0 && visible.every((x) => state.checked.has(x));
  $('bulk-action').disabled = n === 0;
}

$('select-all').addEventListener('change', (e) => {
  for (const w of visibleWatches()) {
    if (e.target.checked) state.checked.add(w.id);
    else state.checked.delete(w.id);
  }
  renderList();
});

$('bulk-action').addEventListener('change', async (e) => {
  const action = e.target.value;
  e.target.value = '';
  const ids = [...state.checked];
  if (!action || !ids.length) return;
  let label;
  if (action === 'addLabel' || action === 'removeLabel') {
    label = prompt(action === 'addLabel' ? 'Label to add' : 'Label to remove');
    if (!label) return;
  }
  if (action === 'delete' && !confirm(`Delete ${ids.length} watch${ids.length > 1 ? 'es' : ''} and their history?`)) return;
  try {
    await call('bulk', { ids, action, label });
    if (action === 'delete') state.checked.clear();
    toast('Done.');
  } catch (err) {
    toast(err.message);
  }
});

// ---------------------------------------------------------------------------
// Detail

// Downloading the page only gave a placeholder: offers the ways to read it,
// each one only for this watch.
function scriptsNeededBanner(watch) {
  const { id } = watch;
  const policy = state.policy;
  const renderOk = !policy?.disableRenderInTab && !policy?.disableCookies;
  const cookiesOk = !watch.sendCookies && !policy?.disableCookies;
  const choose = (how, done) => async (e) => {
    for (const b of e.target.parentElement.querySelectorAll('button')) b.disabled = true;
    try {
      await call('changeLoading', { id, how });
      toast(done);
    } catch (err) {
      toast(err.message);
    }
  };
  return el('div', { class: 'banner' },
    el('span', {},
      el('div', {}, watch.lastError || 'This page only shows its content once its scripts run.'),
      el('div', { class: 'hint' }, renderOk
        ? 'Reading it in a hidden tab lets its scripts run. That tab uses your Chrome sign-in for this site, and is closed right after each check. Nothing was saved as a version.'
        : 'Your organization doesn’t allow reading pages in a hidden tab. Nothing was saved as a version.')),
    renderOk ? el('button', {
      class: 'primary',
      onclick: choose('tab', 'This watch now reads the page in a hidden tab.'),
    }, 'Read it in a hidden tab') : null,
    cookiesOk ? el('button', {
      title: 'Some sites send the real page to signed-in users. Your cookies only ever go to this site.',
      onclick: choose('cookies', 'Tried again with your cookies.'),
    }, 'Try with my cookies') : null,
    el('button', {
      title: 'Save what downloading gives, and stop asking for this watch',
      onclick: choose('asis', 'Saved the page as it downloads.'),
    }, 'Keep it as downloaded'));
}

async function renderDetail() {
  const { id, edit, isNew, settings } = route();
  const detail = $('detail');
  if (settings) return detail.replaceChildren(await settingsForm());
  if (isNew) return detail.replaceChildren(watchForm(null));
  const watch = state.watches.find((w) => w.id === id);
  if (!watch) {
    return detail.replaceChildren(el('p', { class: 'empty-detail' },
      state.watches.length ? 'Select a watch to see its changes.' : 'Add your first watch to get started.'));
  }
  if (edit) return detail.replaceChildren(watchForm(watch));

  if (watch.unread) call('setRead', { id, read: true }).catch(() => {});

  const [history, access, log] = await Promise.all([getHistory(id), hasAccess(watch.url), getLog(id)]);
  const r = route();
  if (r.id !== id || r.edit) return; // navigated away meanwhile

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

  // The sign-in error carries advice (e.g. turn on cookies), so the banner shows it.
  const signInText = watch.lastError.startsWith(SIGN_IN_MESSAGE) ? watch.lastError : '';
  const signInBanner = watch.signInNeeded ? el('div', { class: 'banner' },
    el('span', {}, watch.paused
      ? `Paused because ${new URL(watch.url).hostname} asked you to sign in. Sign in, then click Resume.`
      : signInText || `${new URL(watch.url).hostname} asked you to sign in, so this page can't be checked. Sign in, then check again.`),
    el('button', {
      class: 'primary',
      title: 'Opens the page in a new tab. Once you’re signed in and back on the page, it’s checked again.',
      onclick: () => call('openSignIn', { id }).catch((e) => toast(e.message)),
    }, 'Open page to sign in')) : null;

  const scriptsBanner = watch.scriptsNeeded && watch.mode !== 'tab' ? scriptsNeededBanner(watch) : null;

  const schedule = watch.schedule?.type === 'random'
    ? `randomly every ${watch.intervalMinutes}–${watch.schedule.randomMaxMinutes} min`
    : formatInterval(watch.intervalMinutes);
  const meta = [
    `Checked ${timeAgo(watch.lastCheckedAt)}`,
    watch.lastChangedAt ? `changed ${timeAgo(watch.lastChangedAt)}` : 'no changes yet',
    schedule + (watch.schedule?.window?.enabled ? ` (${watch.schedule.window.start}–${watch.schedule.window.end})` : ''),
    watch.mode === 'tab' ? 'renders in a tab' : 'fetched without running scripts',
    watch.mode !== 'tab' && watch.sendCookies ? 'sends your cookies' : null,
    watch.live ? 'live while open' : null,
    watch.selectors.length ? `${watch.selectors.length} selected part${watch.selectors.length > 1 ? 's' : ''}` : 'whole page',
  ].filter(Boolean).join(' · ');

  detail.replaceChildren(...[
    el('h1', {}, watch.name, ...(watch.labels || []).map((l) => el('span', { class: 'label-tag' }, l))),
    el('a', { class: 'url', href: watch.url, target: '_blank', rel: 'noopener noreferrer' }, watch.url),
    el('div', { class: 'meta muted' }, meta),
    watch.lastSummary ? el('p', { class: 'summary' }, `Latest change: ${watch.lastSummary}`) : null,
    banner,
    signInBanner,
    scriptsBanner,
    watch.lastError && !(signInBanner && signInText && !watch.paused) && !scriptsBanner ? el('p', { class: 'error' }, watch.lastError) : null,
    el('div', { class: 'row' },
      el('button', {
        class: 'primary',
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Checking…';
          await call('checkNow', { id }).catch((err) => toast(err.message));
        },
      }, 'Check now'),
      el('button', {
        title: 'Opens the page and highlights what the latest change added',
        onclick: () => call('openPage', { id }).catch((err) => toast(err.message)),
      }, 'Open page'),
      el('button', { onclick: () => go(`#/w/${encodeURIComponent(id)}/edit`) }, 'Edit'),
      el('button', {
        title: 'Make a copy of this watch, e.g. to watch a similar page',
        onclick: async () => {
          const res = await call('duplicateWatch', { id }).catch((err) => toast(err.message));
          if (res) go(`#/w/${encodeURIComponent(res.id)}/edit`);
        },
      }, 'Duplicate'),
      el('button', { onclick: () => call('bulk', { ids: [id], action: watch.paused ? 'resume' : 'pause' }) }, watch.paused ? 'Resume' : 'Pause'),
      el('button', { onclick: () => call('setRead', { id, read: false }) }, 'Mark unread'),
      el('button', {
        class: 'danger',
        onclick: async () => {
          if (!confirm(`Delete "${watch.name}" and its history?`)) return;
          await call('deleteWatch', { id });
          go('#/');
        },
      }, 'Delete')),
    numberView(watch, history),
    historyView(history),
    logView(log),
  ].filter(Boolean));
}

function numberView(watch, history) {
  if (watch.ignore?.numbers) return null;
  const numericRule = normalizeCondition(watch.condition).rules.some((r) => RULE_TYPES[r.type]?.numeric);
  const points = numberSeries(history, { numericRule });
  return points ? numberChart(points) : null;
}

function versionLabel(entry, i) {
  return `Version ${i + 1} · ${new Date(entry.t).toLocaleString()}`;
}

const VIEWS = { text: 'Text', side: 'Side by side', visual: 'Visual', source: 'Source' };

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
  const showDeleted = el('input', { type: 'checkbox', checked: state.showDeleted });
  const output = el('div');
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  let current = -1;

  const step = (dir) => {
    const changes = [...output.querySelectorAll('[data-change]')];
    if (!changes.length) return;
    changes[current]?.classList.remove('current');
    current = (current + dir + changes.length) % changes.length;
    changes[current].classList.add('current');
    changes[current].scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const draw = () => {
    current = -1;
    const a = history[Number(from.value)];
    const b = history[Number(to.value)];
    for (const t of tabs.children) t.classList.toggle('active', t.dataset.view === state.view);
    onlyChanges.parentElement.hidden = state.view === 'visual';
    showDeleted.parentElement.hidden = state.view !== 'visual';
    if (state.view === 'visual') {
      if (!b.html) {
        output.replaceChildren(el('p', { class: 'muted' },
          'The visual view is available for the most recent versions only, and for pages read as HTML.'));
        return;
      }
      const frame = el('iframe', { class: 'visual-frame', sandbox: '', title: 'Visual comparison', referrerpolicy: 'no-referrer' });
      frame.srcdoc = visualDocument(a.text, b.html, { showDeleted: state.showDeleted });
      output.replaceChildren(frame);
      return;
    }
    if (state.view === 'source') {
      if (!a.html || !b.html) {
        output.replaceChildren(el('p', { class: 'muted' },
          'The source view is available for the most recent versions only, and for pages read as HTML.'));
        return;
      }
      output.replaceChildren(el('div', { class: 'diff' },
        ...diffNodes(diffText(sourceLines(a.html), sourceLines(b.html)), onlyChanges.checked)));
      return;
    }
    const lines = diffText(a.text, b.text);
    if (state.view === 'side') {
      output.replaceChildren(el('div', { class: 'side' },
        el('div', { class: 'diff' }, ...sideNodes(lines, 'old', onlyChanges.checked)),
        el('div', { class: 'diff' }, ...sideNodes(lines, 'new', onlyChanges.checked))));
      return;
    }
    output.replaceChildren(el('div', { class: 'diff' }, ...diffNodes(lines, onlyChanges.checked)));
  };

  for (const [key, label] of Object.entries(VIEWS)) {
    tabs.append(el('button', {
      dataset: { view: key },
      onclick: () => {
        state.view = key;
        try {
          localStorage.setItem('opw:view', key);
        } catch {
          // not persisted
        }
        draw();
      },
    }, label));
  }
  from.addEventListener('change', draw);
  to.addEventListener('change', draw);
  onlyChanges.addEventListener('change', draw);
  showDeleted.addEventListener('change', () => {
    state.showDeleted = showDeleted.checked;
    draw();
  });

  wrap.append(
    el('div', { class: 'versions' }, 'Compare', from, 'with', to),
    el('div', { class: 'versions' }, tabs,
      el('label', { class: 'inline' }, onlyChanges, 'Only show changed lines'),
      el('label', { class: 'inline' }, showDeleted, 'Show deleted text'),
      el('button', { onclick: () => step(-1), title: 'Previous change' }, '↑ Previous'),
      el('button', { onclick: () => step(1), title: 'Next change' }, '↓ Next')),
    output,
  );
  draw();
  return wrap;
}

// Lines to show when "only changed lines" is on: changes plus 2 lines of context.
function keepMask(lines, onlyChanges) {
  const CONTEXT = 2;
  return lines.map((_, i) => {
    if (!onlyChanges) return true;
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) {
      if (lines[j].type !== 'eq') return true;
    }
    return false;
  });
}

function withGaps(lines, onlyChanges, render) {
  const keep = keepMask(lines, onlyChanges);
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
    const node = render(line);
    if (node) nodes.push(node);
  });
  flush();
  if (!lines.some((l) => l.type !== 'eq')) nodes.push(el('div', { class: 'gap' }, 'These versions are identical.'));
  return nodes;
}

function diffNodes(lines, onlyChanges) {
  return withGaps(lines, onlyChanges, (line) => {
    if (line.type === 'mod') {
      return el('div', { dataset: { change: '' } }, ...line.parts.map((p) => {
        if (p.op === 'add') return el('ins', {}, p.value);
        if (p.op === 'del') return el('del', {}, p.value);
        return p.value;
      }));
    }
    if (line.type === 'eq') return el('div', {}, line.text);
    return el('div', { class: line.type, dataset: { change: '' } }, line.text);
  });
}

// One side of the side-by-side view. Lines missing on this side render as
// blank rows so both columns stay aligned.
function sideNodes(lines, side, onlyChanges) {
  return withGaps(lines, onlyChanges, (line) => {
    if (line.type === 'eq') return el('div', {}, line.text);
    if (line.type === 'mod') {
      return el('div', { dataset: { change: '' } }, ...line.parts
        .filter((p) => p.op === 'eq' || (side === 'old' ? p.op === 'del' : p.op === 'add'))
        .map((p) => (p.op === 'eq' ? p.value : el(p.op === 'add' ? 'ins' : 'del', {}, p.value))));
    }
    const mine = (side === 'old' && line.type === 'del') || (side === 'new' && line.type === 'add');
    return mine ? el('div', { class: line.type, dataset: { change: '' } }, line.text) : el('div', {}, '');
  });
}

function logView(log) {
  if (!log.length) return null;
  const rows = log.slice().reverse().map((e) => el('tr', {},
    el('td', {}, new Date(e.t).toLocaleString()),
    el('td', { class: e.ok ? '' : 'error' }, e.ok ? (e.changed ? (e.alerted ? 'Changed, alerted' : 'Changed') : 'No change') : e.error,
      e.note ? el('div', { class: 'hint' }, e.note) : null),
    el('td', { class: 'muted' }, e.via === 'live' ? 'live' : ''),
    el('td', { class: 'muted' }, `${(e.ms / 1000).toFixed(1)} s`)));
  return el('details', { class: 'log' },
    el('summary', {}, `Check log (last ${log.length})`),
    el('table', { class: 'log' }, el('tbody', {}, ...rows)));
}

// ---------------------------------------------------------------------------
// Add / edit form

function intervalParts(minutes) {
  if (minutes % 1440 === 0) return [minutes / 1440, 1440];
  if (minutes % 60 === 0) return [minutes / 60, 60];
  return [minutes, 1];
}

// Stops on the "how often" slider, in minutes: 1 minute up to 1 week.
const INTERVAL_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 4320, 10080];

// A range slider that moves through INTERVAL_STEPS and stays in sync with the
// number and unit fields, which still accept any value.
function intervalSlider(every, unit, minMinutes) {
  const allowed = INTERVAL_STEPS.filter((m) => m >= minMinutes);
  const steps = allowed.length ? allowed : INTERVAL_STEPS.slice(-1);
  const label = (m) => { const s = formatInterval(m); return s[0].toUpperCase() + s.slice(1); };
  const slider = el('input', { type: 'range', min: 0, max: steps.length - 1, step: 1, 'aria-label': 'How often to check' });
  const fromFields = () => {
    const minutes = Number(every.value) * Number(unit.value);
    if (!(minutes > 0)) return;
    let best = 0;
    steps.forEach((m, i) => {
      if (Math.abs(Math.log(m / minutes)) < Math.abs(Math.log(steps[best] / minutes))) best = i;
    });
    slider.value = String(best);
    slider.setAttribute('aria-valuetext', label(minutes));
  };
  slider.addEventListener('input', () => {
    const minutes = steps[Number(slider.value)];
    const [n, u] = intervalParts(minutes);
    every.value = String(n);
    unit.value = String(u);
    slider.setAttribute('aria-valuetext', label(minutes));
  });
  every.addEventListener('input', fromFields);
  unit.addEventListener('change', fromFields);
  fromFields();
  return el('div', { class: 'interval-slider' }, slider,
    el('div', { class: 'slider-ends hint' }, el('span', {}, label(steps[0])), el('span', {}, label(steps[steps.length - 1]))));
}

// Selector lines: "css selector", "xpath://expr", optionally ending in " @attr".
function selectorsToText(selectors) {
  return selectors.map((s) => (s.type === 'xpath' ? `xpath:${s.expr}` : s.expr) + (s.attr ? ` @${s.attr}` : '')).join('\n');
}

function textToSelectors(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    let attr;
    const m = /\s@([A-Za-z_:][\w:.-]*)$/.exec(line);
    if (m) {
      attr = m[1];
      line = line.slice(0, m.index).trim();
    }
    const sel = line.startsWith('xpath:') ? { type: 'xpath', expr: line.slice(6).trim() } : { type: 'css', expr: line };
    if (attr) sel.attr = attr;
    return sel;
  });
}

function unitSelect(value) {
  const s = el('select', {},
    el('option', { value: '1' }, 'minutes'), el('option', { value: '60' }, 'hours'), el('option', { value: '1440' }, 'days'));
  s.value = String(value);
  return s;
}

function ruleRow(rule, onRemove) {
  const on = el('select', { 'aria-label': 'Which text' }, Object.entries(RULE_SOURCES).map(([k, v]) => el('option', { value: k }, v)));
  const type = el('select', { 'aria-label': 'Rule' }, Object.entries(RULE_TYPES).filter(([k]) => k !== 'any').map(([k, v]) => el('option', { value: k }, v.label)));
  const value = el('input', { value: rule.value || '', 'aria-label': 'Value' });
  on.value = rule.on || 'text';
  type.value = rule.type || 'contains';
  const sync = () => {
    const kind = RULE_TYPES[type.value].value;
    value.hidden = !kind;
    value.type = kind === 'number' ? 'number' : 'text';
    value.placeholder = kind === 'regex' ? 'regular expression' : kind === 'number' ? 'number' : 'text';
    on.disabled = /^number(In|De)creased/.test(type.value) || type.value === 'neverSeen';
  };
  type.addEventListener('change', sync);
  sync();
  const row = el('div', { class: 'rule' }, on, type, value,
    el('button', { type: 'button', 'aria-label': 'Remove rule', onclick: () => onRemove(row) }, '✕'));
  row.read = () => ({ on: on.value, type: type.value, value: value.hidden ? '' : value.value });
  return row;
}

const PRESETS = [
  ['Whole page', '', 'All the text on the page'],
  ['All links', 'a[href] @href', 'The address of every link, so new or removed links show up as changes'],
  ['Page title', 'title', 'The title shown in the browser tab'],
  ['Headings', 'h1, h2, h3', 'The page’s headings'],
  ['Description', 'meta[name="description"] @content', 'The page description that search engines show'],
];

function watchForm(watch) {
  const w = watch || {
    name: '', url: '', selectors: [], excludes: [], regexFilter: '', mode: 'fetch', renderDelaySeconds: 3,
    includeFrames: false, live: false, sendCookies: false, autoCookies: true, askToRender: true, onSignIn: 'notify', intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    schedule: { type: 'interval', randomMaxMinutes: DEFAULT_INTERVAL_MINUTES * 2, window: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } },
    historyLimit: DEFAULT_HISTORY, condition: { match: 'all', rules: [] }, notify: true, sound: false, labels: [],
  };
  const schedule = w.schedule || { type: 'interval', randomMaxMinutes: w.intervalMinutes * 2, window: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } };
  const condition = normalizeCondition(w.condition);
  const [n, unit] = intervalParts(w.intervalMinutes);
  const [rn, runit] = intervalParts(schedule.randomMaxMinutes);

  const f = {
    name: el('input', { value: w.name, placeholder: 'Defaults to the site name' }),
    url: el('input', { type: 'url', value: w.url, required: true, placeholder: 'https://example.com/page' }),
    labels: el('input', { value: (w.labels || []).join(', '), placeholder: 'e.g. work, prices' }),
    selectors: el('textarea', { rows: 3, placeholder: '#price\n.status-banner\na.download @href\nxpath://table[1]//tr[2]' }),
    excludes: el('textarea', { rows: 2, placeholder: '.ad-banner\n.timestamp' }),
    regexFilter: el('input', { value: w.regexFilter, placeholder: 'Optional, e.g. \\$[\\d,.]+' }),
    scheduleType: el('select', {},
      el('option', { value: 'interval' }, 'Every'), el('option', { value: 'random' }, 'Randomly between')),
    every: el('input', { type: 'number', min: 1, value: String(n), required: true }),
    unit: unitSelect(unit),
    randomMax: el('input', { type: 'number', min: 1, value: String(rn) }),
    randomUnit: unitSelect(runit),
    windowOn: el('input', { type: 'checkbox', checked: schedule.window.enabled }),
    windowStart: el('input', { type: 'time', value: schedule.window.start }),
    windowEnd: el('input', { type: 'time', value: schedule.window.end }),
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => el('input', { type: 'checkbox', value: String(i), checked: schedule.window.days.includes(i), 'aria-label': d })),
    mode: el('select', {},
      el('option', { value: 'fetch' }, 'Download the page without running its scripts (safer, faster)'),
      el('option', { value: 'tab' }, 'Open it in a hidden window so its scripts run (for dynamic pages)')),
    renderDelaySeconds: el('input', { type: 'number', min: 0, max: 60, value: String(w.renderDelaySeconds) }),
    includeFrames: el('input', { type: 'checkbox', checked: w.includeFrames }),
    live: el('input', { type: 'checkbox', checked: w.live }),
    sendCookies: el('input', { type: 'checkbox', checked: w.sendCookies }),
    autoCookies: el('input', { type: 'checkbox', checked: w.autoCookies !== false }),
    askToRender: el('input', { type: 'checkbox', checked: w.askToRender !== false }),
    onSignIn: el('select', {},
      el('option', { value: 'notify' }, 'Send me a notification'),
      el('option', { value: 'tab' }, 'Open the page in a new tab so I can sign in'),
      el('option', { value: 'pause' }, 'Pause the watch until I sign in'),
      el('option', { value: 'nothing' }, 'Do nothing (it still shows in the inbox)')),
    match: el('select', {}, el('option', { value: 'all' }, 'all'), el('option', { value: 'any' }, 'any')),
    notify: el('input', { type: 'checkbox', checked: w.notify }),
    sound: el('input', { type: 'checkbox', checked: w.sound }),
    speak: el('input', { type: 'checkbox', checked: w.speak === true }),
    historyLimit: el('input', { type: 'number', min: 2, max: 200, value: String(w.historyLimit) }),
    ignore: Object.fromEntries(['dates', 'numbers', 'case', 'whitespace'].map((k) => [k, el('input', { type: 'checkbox', checked: w.ignore?.[k] === true })])),
  };
  const policy = state.policy;
  if (policy?.disableRenderInTab || policy?.disableCookies) f.mode.querySelector('option[value="tab"]').disabled = true;
  if (policy?.disableLiveMode) f.live.disabled = true;
  if (policy?.disableCookies) {
    f.sendCookies.disabled = true;
    f.autoCookies.disabled = true;
  }
  if (policy?.minIntervalMinutes) f.every.title = `Your organization requires at least ${policy.minIntervalMinutes} minutes between checks`;
  f.selectors.value = selectorsToText(w.selectors);
  f.excludes.value = selectorsToText(w.excludes || []);
  f.mode.value = w.mode;
  f.scheduleType.value = schedule.type;
  f.onSignIn.value = SIGN_IN_ACTIONS.includes(w.onSignIn) ? w.onSignIn : 'notify';
  f.match.value = condition.match;

  const rules = el('div', { class: 'rules' });
  const addRule = (rule) => rules.append(ruleRow(rule, (row) => {
    row.remove();
    sync();
  }));
  condition.rules.forEach(addRule);

  const delayRow = el('label', { class: 'field' }, el('span', {}, 'Wait after load (seconds)'), f.renderDelaySeconds);
  const framesRow = el('label', { class: 'check' }, f.includeFrames,
    el('span', {}, 'Include content inside frames on the page',
      el('div', { class: 'hint' }, 'Only frames from sites you have allowed are read.')));
  const cookieRow = el('label', { class: 'check' }, f.sendCookies,
    el('span', {}, 'Send my cookies for this site',
      el('div', { class: 'hint' }, 'Needed for pages behind a login. Cookies only ever go to this site.')));
  const autoCookiesRow = el('label', { class: 'check' }, f.autoCookies,
    el('span', {}, 'Turn this on by itself if the page asks me to sign in',
      el('div', { class: 'hint' }, 'The check is tried once more with your cookies, and they stay on only if that gets past the sign-in page.')));
  const askToRenderRow = el('label', { class: 'check' }, f.askToRender,
    el('span', {}, 'Ask me before using a hidden tab if the page needs its scripts',
      el('div', { class: 'hint' }, 'When downloading gives only a placeholder like “your browser is not supported” or an empty page, it isn’t saved, and you’re asked what to do.')));
  const signInRow = el('label', { class: 'field' }, el('span', {}, 'If the page asks me to sign in'), f.onSignIn,
    el('span', { class: 'hint' }, 'This happens once, not on every check. After you sign in, checks pick up again by themselves.'));
  const randomRow = el('span', { class: 'inline' }, 'and', f.randomMax, f.randomUnit);
  const sliderRow = intervalSlider(f.every, f.unit, policy?.minIntervalMinutes || 0);
  const windowRow = el('div', { class: 'field' },
    el('div', { class: 'inline' }, 'Between', f.windowStart, 'and', f.windowEnd),
    el('div', { class: 'days' }, ...f.days.map((d) => el('label', {}, d, d.getAttribute('aria-label')))));
  const matchRow = el('div', { class: 'inline' }, 'Alert when', f.match, 'of these are true:');
  const noRules = el('p', { class: 'hint' }, 'No rules: every change alerts you.');
  function sync() {
    delayRow.hidden = f.mode.value !== 'tab';
    framesRow.hidden = f.mode.value !== 'tab';
    cookieRow.hidden = f.mode.value === 'tab';
    autoCookiesRow.hidden = f.mode.value === 'tab' || f.sendCookies.checked || Boolean(policy?.disableCookies);
    askToRenderRow.hidden = f.mode.value === 'tab';
    randomRow.hidden = f.scheduleType.value !== 'random';
    windowRow.hidden = !f.windowOn.checked;
    matchRow.hidden = rules.children.length < 2;
    noRules.hidden = rules.children.length > 0;
  }
  f.mode.addEventListener('change', sync);
  f.scheduleType.addEventListener('change', sync);
  f.windowOn.addEventListener('change', sync);
  f.sendCookies.addEventListener('change', sync);
  sync();

  const error = el('p', { class: 'error', hidden: true });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      error.hidden = true;
      const url = f.url.value.trim();
      // Check the organization's rules before asking Chrome for access, so
      // access is never granted to a site that can't be watched.
      try {
        if (!isHttpUrl(url)) throw new Error('Enter a full http:// or https:// address.');
        if (policy) checkSiteAllowed(policy, url);
      } catch (err) {
        error.hidden = false;
        error.textContent = err.message;
        return;
      }
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
        labels: f.labels.value.split(',').map((l) => l.trim()).filter(Boolean),
        selectors: textToSelectors(f.selectors.value),
        excludes: textToSelectors(f.excludes.value).map(({ type, expr }) => ({ type, expr })),
        regexFilter: f.regexFilter.value,
        intervalMinutes: Number(f.every.value) * Number(f.unit.value),
        schedule: {
          type: f.scheduleType.value,
          randomMaxMinutes: Number(f.randomMax.value) * Number(f.randomUnit.value),
          window: {
            enabled: f.windowOn.checked,
            days: f.days.filter((d) => d.checked).map((d) => Number(d.value)),
            start: f.windowStart.value || '09:00',
            end: f.windowEnd.value || '17:00',
          },
        },
        mode: f.mode.value,
        renderDelaySeconds: Number(f.renderDelaySeconds.value),
        includeFrames: f.includeFrames.checked,
        live: f.live.checked,
        sendCookies: f.sendCookies.checked,
        autoCookies: f.autoCookies.checked,
        askToRender: f.askToRender.checked,
        onSignIn: f.onSignIn.value,
        condition: { match: f.match.value, rules: [...rules.children].map((r) => r.read()) },
        notify: f.notify.checked,
        sound: f.sound.checked,
        speak: f.speak.checked,
        historyLimit: Number(f.historyLimit.value),
        ignore: Object.fromEntries(Object.entries(f.ignore).map(([k, box]) => [k, box.checked])),
      };
      try {
        const { id } = await call(watch ? 'updateWatch' : 'createWatch', { watch: data });
        if (!granted) toast('Saved. Site access was not granted, so checks will fail until you allow it.');
        else toast('Saved.');
        go(`#/w/${encodeURIComponent(id)}`);
      } catch (err) {
        error.hidden = false;
        error.textContent = err.message;
        if (granted) call('releaseUnusedAccess').catch(() => {});
      }
    },
  },
  el('h1', {}, watch ? `Edit ${watch.name}` : 'Add a watch'),
  policy && isManaged(policy) ? el('p', { class: 'banner' }, 'Some options are set by your organization and can’t be changed here.') : null,
  el('label', { class: 'field' }, el('span', {}, 'Page address'), f.url,
    el('span', { class: 'hint' }, 'Web pages, JSON, plain text, PDF files, RSS/Atom feeds and XML sitemaps are supported.')),
  el('label', { class: 'field' }, el('span', {}, 'Name'), f.name),
  el('label', { class: 'field' }, el('span', {}, 'Labels'), f.labels, el('span', { class: 'hint' }, 'Separate labels with commas.')),
  el('fieldset', {}, el('legend', {}, 'What to watch'),
    el('div', { class: 'presets' }, el('span', { class: 'hint' }, 'Quick fill:'),
      ...PRESETS.map(([label, text, hint]) => el('button', {
        type: 'button',
        title: hint,
        onclick: () => {
          f.selectors.value = text;
          f.selectors.focus();
        },
      }, label))),
    el('label', { class: 'field' }, el('span', {}, 'Parts of the page (leave empty for the whole page)'), f.selectors,
      el('span', { class: 'hint' }, 'One CSS selector per line. Start a line with xpath: for XPath. End a line with @href, @src or another attribute name to watch that attribute instead of the text. The "Select parts of page" button in the toolbar popup fills this in for you.')),
    el('label', { class: 'field' }, el('span', {}, 'Leave out'), f.excludes,
      el('span', { class: 'hint' }, 'Selectors for parts to ignore, such as ads or timestamps.')),
    el('label', { class: 'field' }, el('span', {}, 'Keep only text matching this regular expression'), f.regexFilter),
    el('div', { class: 'field' }, el('span', {}, 'Don’t count it as a change when only these differ'),
      el('div', { class: 'days' },
        el('label', {}, f.ignore.dates, 'Dates and times'),
        el('label', {}, f.ignore.numbers, 'Numbers'),
        el('label', {}, f.ignore.case, 'Upper/lower case'),
        el('label', {}, f.ignore.whitespace, 'Spacing')))),
  el('fieldset', {}, el('legend', {}, 'When to check'),
    el('div', { class: 'inline' }, f.scheduleType, f.every, f.unit, randomRow),
    sliderRow,
    el('label', { class: 'check' }, f.windowOn, el('span', {}, 'Only check during certain hours')),
    windowRow,
    el('label', { class: 'check' }, f.live,
      el('span', {}, 'Also check instantly while the page is open in a tab',
        el('div', { class: 'hint' }, 'Watches the open tab for changes and re-reads it right away.')))),
  el('fieldset', {}, el('legend', {}, 'How to load the page'),
    el('label', { class: 'field' }, f.mode),
    delayRow,
    framesRow,
    cookieRow,
    autoCookiesRow,
    askToRenderRow,
    signInRow),
  el('fieldset', {}, el('legend', {}, 'Alerts'),
    matchRow,
    rules,
    noRules,
    el('div', {}, el('button', {
      type: 'button',
      onclick: () => {
        addRule({ type: 'contains', on: 'text', value: '' });
        sync();
      },
    }, '+ Add rule')),
    el('label', { class: 'check' }, f.notify, el('span', {}, 'Desktop notification')),
    el('label', { class: 'check' }, f.sound, el('span', {}, 'Play a sound')),
    el('label', { class: 'check' }, f.speak, el('span', {}, 'Read the change aloud',
      el('div', { class: 'hint' }, 'Only voices installed on this computer are used, never online voices.'))),
    el('label', { class: 'field' }, el('span', {}, 'Versions to keep'), f.historyLimit)),
  error,
  el('div', { class: 'row' },
    el('button', { class: 'primary', type: 'submit' }, watch ? 'Save' : 'Add watch'),
    el('button', { type: 'button', onclick: () => go(watch ? `#/w/${encodeURIComponent(watch.id)}` : '#/') }, 'Cancel')));
  return form;
}

// ---------------------------------------------------------------------------
// Settings

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatEvery(minutes) {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return 'hour';
  if (minutes === 1440) return 'day';
  return `${minutes / 60} hours`;
}

async function settingsForm() {
  const s = await getSettings();
  const enabled = el('input', { type: 'checkbox', checked: s.errorAlerts.enabled });
  const after = el('input', { type: 'number', min: 1, max: 100, value: String(s.errorAlerts.after) });
  const every = el('input', { type: 'number', min: 1, max: 1440, value: String(s.errorAlerts.minIntervalMinutes) });
  const digest = el('input', { type: 'checkbox', checked: s.delivery.mode === 'digest' });
  const digestEvery = el('select', { 'aria-label': 'How often' },
    DIGEST_CHOICES.map((m) => el('option', { value: String(m) }, formatEvery(m))));
  digestEvery.value = String(s.delivery.digestEveryMinutes);
  const quietOn = el('input', { type: 'checkbox', checked: s.quietHours.enabled });
  const quietStart = el('input', { type: 'time', value: s.quietHours.start, 'aria-label': 'Quiet hours start' });
  const quietEnd = el('input', { type: 'time', value: s.quietHours.end, 'aria-label': 'Quiet hours end' });
  const quietDays = DAY_NAMES.map((d, i) => el('input', { type: 'checkbox', value: String(i), checked: s.quietHours.days.includes(i), 'aria-label': d }));
  const digestRow = el('div', { class: 'inline' }, 'At most one notification every', digestEvery);
  const quietRow = el('div', { class: 'field' },
    el('div', { class: 'inline' }, 'From', quietStart, 'to', quietEnd),
    el('div', { class: 'days' }, ...quietDays.map((d) => el('label', {}, d, d.getAttribute('aria-label')))));
  const sync = () => {
    digestRow.hidden = !digest.checked;
    quietRow.hidden = !quietOn.checked;
  };
  digest.addEventListener('change', sync);
  quietOn.addEventListener('change', sync);
  sync();

  return el('form', {
    id: 'settings-form',
    onsubmit: async (e) => {
      e.preventDefault();
      await call('saveSettings', {
        settings: {
          errorAlerts: { enabled: enabled.checked, after: Number(after.value), minIntervalMinutes: Number(every.value) },
          delivery: { mode: digest.checked ? 'digest' : 'instant', digestEveryMinutes: Number(digestEvery.value) },
          quietHours: {
            enabled: quietOn.checked,
            start: quietStart.value || '22:00',
            end: quietEnd.value || '07:00',
            days: quietDays.filter((d) => d.checked).map((d) => Number(d.value)),
          },
        },
      });
      toast('Settings saved.');
    },
  },
  el('h1', {}, 'Settings'),
  el('fieldset', {}, el('legend', {}, 'Change alerts'),
    el('label', { class: 'check' }, digest, el('span', {}, 'Combine alerts into one summary',
      el('div', { class: 'hint' }, 'Changes are still recorded right away. Only the notifications are bundled.'))),
    digestRow),
  el('fieldset', {}, el('legend', {}, 'Quiet hours'),
    el('label', { class: 'check' }, quietOn, el('span', {}, 'No notifications or sounds during these hours',
      el('div', { class: 'hint' }, 'Watches keep checking. What changed is sent as one summary when quiet hours end.'))),
    quietRow),
  el('fieldset', {}, el('legend', {}, 'Keyboard shortcuts'),
    el('table', { class: 'log shortcuts' }, el('tbody', {},
      ...[['j / k', 'Next / previous watch'], ['e', 'Edit'], ['c', 'Check now'], ['u', 'Mark read or unread'],
        ['n', 'Add a watch'], ['/', 'Search'], ['Alt+Shift+W', 'Pick parts of the current page to watch (any tab)']]
        .map(([k, v]) => el('tr', {}, el('td', {}, el('kbd', {}, k)), el('td', {}, v))))),
    el('p', { class: 'hint' }, 'Change the Alt+Shift+W shortcut at chrome://extensions/shortcuts.')),
  el('fieldset', {}, el('legend', {}, 'Error alerts'),
    el('label', { class: 'check' }, enabled, el('span', {}, 'Notify me when a watch keeps failing')),
    el('div', { class: 'inline' }, 'After', after, 'failed checks in a row, at most every', every, 'minutes')),
  el('div', { class: 'row' }, el('button', { class: 'primary', type: 'submit' }, 'Save')));
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
$('settings').addEventListener('click', () => go('#/settings'));
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

// A small modal form. Resolves to true when confirmed.
function dialog(title, body, confirmLabel) {
  return new Promise((resolve) => {
    const confirmBtn = el('button', { class: 'primary', type: 'submit' }, confirmLabel);
    const d = el('dialog', { class: 'dialog' },
      el('form', { method: 'dialog' },
        el('h2', {}, title),
        ...body,
        el('div', { class: 'row' },
          el('button', { type: 'button', onclick: () => d.close('cancel') }, 'Cancel'),
          confirmBtn)));
    d.addEventListener('close', () => {
      d.remove();
      resolve(d.returnValue === 'ok');
    });
    confirmBtn.value = 'ok';
    document.body.append(d);
    d.showModal();
  });
}

function download(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('export').addEventListener('click', async () => {
  const protect = el('input', { type: 'checkbox', id: 'backup-protect' });
  const pw = el('input', { type: 'password', id: 'backup-password', autocomplete: 'new-password', minlength: 8, placeholder: 'At least 8 characters' });
  const pw2 = el('input', { type: 'password', id: 'backup-password2', autocomplete: 'new-password', placeholder: 'Type it again' });
  const fields = el('div', { class: 'field', hidden: true },
    el('label', { class: 'field' }, el('span', {}, 'Password'), pw),
    el('label', { class: 'field' }, el('span', {}, 'Confirm password'), pw2),
    el('p', { class: 'hint' }, "There's no way to recover a forgotten password."));
  const sync = () => {
    fields.hidden = !protect.checked;
    pw.required = protect.checked;
    pw2.setCustomValidity(protect.checked && pw.value !== pw2.value ? "The passwords don't match" : '');
  };
  protect.addEventListener('change', sync);
  pw.addEventListener('input', sync);
  pw2.addEventListener('input', sync);
  const ok = await dialog('Export watches', [
    el('p', { class: 'hint' }, 'Saves your watches and settings to a file on this computer. Saved versions are not included.'),
    el('label', { class: 'check' }, protect, el('span', {}, 'Protect the file with a password',
      el('div', { class: 'hint' }, 'Recommended if the file will leave this computer. Your watched addresses can be sensitive.'))),
    fields,
  ], 'Export');
  if (!ok) return;
  try {
    const { data } = await call('exportAll');
    const day = new Date().toISOString().slice(0, 10);
    if (protect.checked) {
      toast('Encrypting…');
      download(await encryptBackup(data, pw.value), `open-page-watcher-${day}-protected.json`);
    } else {
      download(data, `open-page-watcher-${day}.json`);
    }
    toast('Exported.');
  } catch (err) {
    toast(`Export failed: ${err.message}`);
  }
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('That file is too large');
    let data = JSON.parse(await file.text());
    if (isEncrypted(data)) {
      const pw = el('input', { type: 'password', id: 'import-password', autocomplete: 'current-password', required: true });
      if (!await dialog('Password-protected file', [el('label', { class: 'field' }, el('span', {}, 'Password'), pw)], 'Unlock')) return;
      data = await decryptBackup(data, pw.value);
    }
    const includeSettings = Boolean(data?.settings) && await dialog('Import settings too?', [
      el('p', {}, 'This file also has settings (alerts, quiet hours). Replace your current settings with them?'),
    ], 'Replace settings');
    const res = await call('importAll', { data, includeSettings });
    toast(`Imported ${res.imported} watch${res.imported === 1 ? '' : 'es'}${res.skipped.length ? `, skipped ${res.skipped.length}` : ''}. Open each one and click Allow to grant site access.`);
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
});

// Keyboard: j/k move through the list, e edits, c checks now,
// u toggles read, / searches, n adds a watch.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, dialog, [contenteditable]')) return;
  const { id } = route();
  const list = visibleWatches();
  const at = list.findIndex((w) => w.id === id);
  const move = (dir) => {
    const next = list[Math.min(list.length - 1, Math.max(0, at < 0 ? 0 : at + dir))];
    if (next) go(`#/w/${encodeURIComponent(next.id)}`);
  };
  const current = list[at];
  const actions = {
    j: () => move(1),
    k: () => move(-1),
    e: () => current && go(`#/w/${encodeURIComponent(current.id)}/edit`),
    c: () => current && call('checkNow', { id: current.id }).catch((err) => toast(err.message)),
    u: () => current && call('setRead', { id: current.id, read: current.unread }),
    n: () => go('#/new'),
    '/': () => $('search').focus(),
  };
  if (!Object.hasOwn(actions, e.key)) return;
  e.preventDefault();
  actions[e.key]();
});

// ---------------------------------------------------------------------------

let renderQueued = false;
async function refresh() {
  [state.watches, state.policy] = await Promise.all([getWatches(), getPolicy()]);
  render();
}

function render() {
  // "#/unread" (from a combined alert) opens the inbox filtered to unread.
  if (location.hash === '#/unread') {
    state.filter = 'unread';
    history.replaceState(null, '', '#/');
  }
  renderList();
  // Don't wipe a form the user is typing in.
  const { edit, isNew, settings } = route();
  if ((edit || isNew || settings) && $('detail').querySelector('form') && document.activeElement?.closest('form')) return;
  renderDetail();
}

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'managed') refresh();
});

onChanged(() => {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    refresh();
  }, 100);
});

refresh();
