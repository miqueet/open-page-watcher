import { extractText } from './lib/extract.js';
import { conditionMet } from './lib/conditions.js';
import { addedText } from './lib/diff.js';
import { sanitizeWatch, exportableWatch, postProcess, isDue, originPattern } from './lib/watch.js';
import {
  getWatches, getWatch, updateWatches, getHistory, appendHistory, deleteHistory,
} from './lib/storage.js';

const TICK_ALARM = 'tick';
const FETCH_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 45_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CONCURRENT = 3;
const OFFSCREEN_URL = 'src/offscreen.html';
const INBOX_URL = chrome.runtime.getURL('src/ui/inbox.html');
const EXTENSION_ORIGIN = chrome.runtime.getURL('');

const inFlight = new Set();

// ---------------------------------------------------------------------------
// Lifecycle

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

async function setup() {
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1, delayInMinutes: 0.1 });
  await updateBadge();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) runDueChecks();
});

async function runDueChecks() {
  const now = Date.now();
  const due = Object.values(await getWatches())
    .filter((w) => isDue(w, now) && !inFlight.has(w.id))
    .sort((a, b) => a.lastCheckedAt - b.lastCheckedAt);
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, due.length) }, async () => {
    while (due.length) await checkWatch(due.shift().id);
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Checking a watch

async function checkWatch(id) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    const watch = await getWatch(id);
    if (!watch) return;
    let text;
    let error = '';
    try {
      const granted = await chrome.permissions.contains({ origins: [originPattern(watch.url)] });
      if (!granted) throw new Error('Access to this site has not been granted. Edit the watch and save it to grant access.');
      text = postProcess(watch.mode === 'tab' ? await renderAndExtract(watch) : await fetchAndExtract(watch), watch);
    } catch (e) {
      error = e?.message || String(e);
    }

    const now = Date.now();
    if (error) {
      await updateWatches((all) => {
        if (all[id]) Object.assign(all[id], { lastCheckedAt: now, lastError: error });
      });
      await broadcast({ type: 'changed', id });
      return;
    }

    const history = await getHistory(id);
    const previous = history[history.length - 1];
    let alert = false;
    if (!previous || previous.text !== text) {
      await appendHistory(id, { t: now, text }, watch.historyLimit);
      if (previous) alert = conditionMet(watch.condition, previous.text, text);
    }
    await updateWatches((all) => {
      const w = all[id];
      if (!w) return;
      w.lastCheckedAt = now;
      w.lastError = '';
      if (previous && previous.text !== text) w.lastChangedAt = now;
      if (alert) w.unread = true;
    });
    if (alert) await sendAlert(watch, previous.text, text).catch((e) => console.warn('Alert failed', e));
    await updateBadge();
    await broadcast({ type: 'changed', id });
  } finally {
    inFlight.delete(id);
  }
}

async function fetchAndExtract(watch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  let bytes;
  try {
    response = await fetch(watch.url, {
      credentials: watch.sendCookies ? 'include' : 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The site answered with HTTP ${response.status}`);
    bytes = await readLimited(response);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The site took longer than 30 seconds to respond');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') || '';
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] || 'utf-8';
  let body;
  try {
    body = new TextDecoder(charset).decode(bytes);
  } catch {
    body = new TextDecoder('utf-8').decode(bytes);
  }

  if (/json/i.test(contentType)) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  if (/^text\/plain/i.test(contentType)) return body;

  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'extract',
    html: body,
    mime: /xml/i.test(contentType) && !/html/i.test(contentType) ? 'application/xml' : 'text/html',
    spec: { selectors: watch.selectors },
  });
  if (!result?.ok) throw new Error(result?.error || 'Could not read the page');
  return result.text;
}

async function readLimited(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      reader.cancel();
      throw new Error('The page is larger than 5 MB');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

// Loads the page in a minimized window so its JavaScript can render, then
// extracts text and closes the window.
async function renderAndExtract(watch) {
  const win = await chrome.windows.create({ url: watch.url, state: 'minimized', focused: false });
  const tabId = win.tabs[0].id;
  try {
    await waitForTabComplete(tabId);
    await new Promise((r) => setTimeout(r, watch.renderDelaySeconds * 1000));
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || new URL(tab.url).origin !== new URL(watch.url).origin) {
      throw new Error('The page redirected to a different site');
    }
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractText,
      args: [{ selectors: watch.selectors }],
    });
    const result = injection?.result;
    if (!result?.ok) throw new Error(result?.error || 'Could not read the page');
    return result.text;
  } finally {
    chrome.windows.remove(win.id).catch(() => {});
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The page took longer than 45 seconds to load'));
    }, RENDER_TIMEOUT_MS);
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        cleanup();
        resolve();
      }
    };
    function cleanup() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') {
        cleanup();
        resolve();
      }
    }, () => {});
  });
}

// ---------------------------------------------------------------------------
// Offscreen document (HTML parsing and sound)

let offscreenStarting = null;

// Makes sure the offscreen document exists and is listening. Concurrent
// callers share one attempt; the document can exist before its script has
// registered its message listener, so we wait for it to answer a ping.
function ensureOffscreen() {
  offscreenStarting ||= (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['DOM_PARSER', 'AUDIO_PLAYBACK'],
        justification: 'Parse fetched pages without running their scripts, and play alert sounds.',
      });
    }
    for (let i = 0; i < 100; i++) {
      const pong = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ping' }).catch(() => null);
      if (pong?.ok) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('The page reader did not start');
  })().finally(() => {
    offscreenStarting = null;
  });
  return offscreenStarting;
}

// ---------------------------------------------------------------------------
// Alerts

async function sendAlert(watch, oldText, newText) {
  if (watch.notify) {
    const added = addedText(oldText, newText).trim();
    await chrome.notifications.create(`watch:${watch.id}:${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `Changed: ${watch.name}`.slice(0, 120),
      message: (added || 'Content was removed or rearranged.').slice(0, 300),
      buttons: [{ title: 'View changes' }, { title: 'Open page' }],
      priority: 1,
    });
  }
  if (watch.sound) {
    await ensureOffscreen();
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'beep' }).catch(() => {});
  }
}

function watchIdFromNotification(notificationId) {
  const m = /^watch:([a-z0-9-]+):\d+$/i.exec(notificationId);
  return m ? m[1] : null;
}

chrome.notifications.onClicked.addListener((notificationId) => {
  const id = watchIdFromNotification(notificationId);
  if (id) openInbox(id);
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const id = watchIdFromNotification(notificationId);
  chrome.notifications.clear(notificationId);
  if (!id) return;
  if (buttonIndex === 0) return openInbox(id);
  const watch = await getWatch(id);
  if (watch) chrome.tabs.create({ url: watch.url });
});

async function openInbox(id) {
  const url = `${INBOX_URL}#/w/${encodeURIComponent(id)}`;
  const [existing] = await chrome.tabs.query({ url: `${INBOX_URL}*` });
  if (existing) {
    await chrome.tabs.update(existing.id, { url, active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

async function updateBadge() {
  const unread = Object.values(await getWatches()).filter((w) => w.unread).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  await chrome.action.setBadgeText({ text: unread ? String(Math.min(unread, 999)) : '' });
}

function broadcast(message) {
  return chrome.runtime.sendMessage({ target: 'ui', ...message }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Permissions housekeeping

// Releases site access that no remaining watch needs.
async function releaseUnusedOrigins(removedUrl) {
  const pattern = originPattern(removedUrl);
  const stillUsed = Object.values(await getWatches()).some((w) => originPattern(w.url) === pattern);
  if (!stillUsed) await chrome.permissions.remove({ origins: [pattern] }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Messages

const uiHandlers = {
  async createWatch({ watch }) {
    const clean = sanitizeWatch(watch);
    await updateWatches((all) => {
      all[clean.id] = clean;
    });
    checkWatch(clean.id);
    return { id: clean.id };
  },

  async updateWatch({ watch }) {
    const before = await getWatch(watch?.id);
    if (!before) throw new Error('Watch not found');
    const clean = sanitizeWatch(watch, before);
    const reset = before.url !== clean.url
      || JSON.stringify(before.selectors) !== JSON.stringify(clean.selectors)
      || before.regexFilter !== clean.regexFilter
      || before.mode !== clean.mode;
    await updateWatches((all) => {
      all[clean.id] = clean;
    });
    if (reset) {
      // What is being watched changed, so earlier versions aren't comparable.
      await deleteHistory(clean.id);
      await updateWatches((all) => {
        if (all[clean.id]) all[clean.id].lastCheckedAt = 0;
      });
      if (before.url !== clean.url) await releaseUnusedOrigins(before.url);
      checkWatch(clean.id);
    }
    await broadcast({ type: 'changed', id: clean.id });
    return { id: clean.id };
  },

  async deleteWatch({ id }) {
    const watch = await getWatch(id);
    if (!watch) return {};
    await updateWatches((all) => {
      delete all[id];
    });
    await deleteHistory(id);
    await releaseUnusedOrigins(watch.url);
    await updateBadge();
    await broadcast({ type: 'changed', id });
    return {};
  },

  async checkNow({ id }) {
    await checkWatch(id);
    return {};
  },

  async setRead({ id, read }) {
    await updateWatches((all) => {
      if (all[id]) all[id].unread = !read;
    });
    await updateBadge();
    await broadcast({ type: 'changed', id });
    return {};
  },

  async markAllRead() {
    await updateWatches((all) => {
      for (const w of Object.values(all)) w.unread = false;
    });
    await updateBadge();
    await broadcast({ type: 'changed' });
    return {};
  },

  async exportAll() {
    const watches = Object.values(await getWatches()).map(exportableWatch);
    return { data: { format: 'open-page-watcher', version: 1, watches } };
  },

  async importAll({ data }) {
    if (data?.format !== 'open-page-watcher' || !Array.isArray(data.watches)) {
      throw new Error('This is not an Open Page Watcher export file');
    }
    const existing = await getWatches();
    const imported = [];
    const skipped = [];
    for (const raw of data.watches.slice(0, 1000)) {
      try {
        const w = sanitizeWatch({ ...raw, id: existing[raw?.id] ? undefined : raw?.id });
        imported.push(w);
      } catch (e) {
        skipped.push(`${raw?.name || raw?.url || 'unknown'}: ${e.message}`);
      }
    }
    await updateWatches((all) => {
      for (const w of imported) all[w.id] = w;
    });
    await broadcast({ type: 'changed' });
    const origins = [...new Set(imported.map((w) => originPattern(w.url)))];
    return { imported: imported.length, skipped, origins };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return false;
  if (message.target === 'offscreen' || message.target === 'ui') return false;

  let handler;
  if (message.type === 'picker:save' && sender.tab) {
    handler = () => savePickerWatch(message, sender.tab);
  } else if (sender.url?.startsWith(EXTENSION_ORIGIN) && !sender.tab?.url?.startsWith('http')
    && Object.hasOwn(uiHandlers, message.type)) {
    handler = () => uiHandlers[message.type](message);
  } else {
    return false;
  }

  handler().then(
    (result) => sendResponse({ ok: true, ...result }),
    (e) => sendResponse({ ok: false, error: e?.message || String(e) }),
  );
  return true;
});

// The picker runs inside a web page; trust only its selectors, and take the
// URL and title from the tab Chrome reports, not from the message.
async function savePickerWatch(message, tab) {
  const selectors = Array.isArray(message.selectors) ? message.selectors : [];
  if (!selectors.length) throw new Error('Select at least one element');
  const watch = sanitizeWatch({
    url: tab.url,
    name: typeof tab.title === 'string' ? tab.title.slice(0, 200) : '',
    selectors: selectors.map((expr) => ({ type: 'css', expr: String(expr) })),
  });
  // If site access hasn't been granted yet, the watch is still saved; its first
  // check reports the missing access and the inbox offers to grant it.
  await updateWatches((all) => {
    all[watch.id] = watch;
  });
  checkWatch(watch.id);
  return { id: watch.id };
}
