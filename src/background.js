import { extractText } from './lib/extract.js';
import { conditionMet, changedText } from './lib/conditions.js';
import { highlightChanges, HIGHLIGHT_CSS } from './lib/highlight.js';
import {
  summarizeChange, inQuietHours, shouldHold, readyToFlush, queueAlert, digestMessage,
} from './lib/alerts.js';
import { pdfToText } from './lib/pdf.js';
import { getPolicy, checkSiteAllowed, applyPolicy } from './lib/policy.js';
import {
  sanitizeWatch, exportableWatch, postProcess, isDue, nextCheckTime, originPattern, sameDocument, comparisonKey, isHttpUrl,
} from './lib/watch.js';
import {
  getWatches, getWatch, updateWatches, getHistory, appendHistory, deleteHistory, appendLog,
  getSettings, sanitizeSettings, serialize,
} from './lib/storage.js';

const TICK_ALARM = 'tick';
const FETCH_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 45_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_CONCURRENT = 3;
const LIVE_MIN_GAP_MS = 10_000;
const OFFSCREEN_URL = 'src/offscreen.html';
const INBOX_URL = chrome.runtime.getURL('src/ui/inbox.html');
const EXTENSION_ORIGIN = chrome.runtime.getURL('');

const inFlight = new Set();
const renderTabs = new Set(); // hidden tabs opened by "render in tab" checks

// ---------------------------------------------------------------------------
// Lifecycle

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

async function setup() {
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1, delayInMinutes: 0.1 });
  await setupMenus();
  await updateBadge();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TICK_ALARM) return;
  runDueChecks();
  flushAlerts().catch((e) => console.warn('Held alerts failed', e));
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
// Right-click menu and keyboard shortcut

const WEB_PAGES = ['http://*/*', 'https://*/*'];

async function setupMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'watch-page', title: 'Watch this page for changes', contexts: ['page'], documentUrlPatterns: WEB_PAGES });
  chrome.contextMenus.create({ id: 'watch-part', title: 'Watch part of this page…', contexts: ['page', 'selection', 'image', 'link'], documentUrlPatterns: WEB_PAGES });
  chrome.contextMenus.create({ id: 'watch-link', title: 'Watch the linked page for changes', contexts: ['link'], targetUrlPatterns: WEB_PAGES });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let task;
  if (info.menuItemId === 'watch-page') task = quickWatch(info.pageUrl || tab?.url, tab?.title);
  else if (info.menuItemId === 'watch-link') task = quickWatch(info.linkUrl, (info.selectionText || '').trim());
  else if (info.menuItemId === 'watch-part') task = startPicker(tab);
  task?.catch((e) => notifyProblem(e));
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'watch-part') startPicker(tab).catch((e) => notifyProblem(e));
});

// Asks for access to a site. Chrome may refuse to show the prompt outside a
// page of the extension; then the inbox offers an Allow button instead.
async function askAccess(url) {
  try {
    return await chrome.permissions.request({ origins: [originPattern(url)] });
  } catch {
    return false;
  }
}

async function quickWatch(url, name) {
  const watch = await enforcePolicy(sanitizeWatch({ url, name: name || '' }), { adding: 1 });
  await updateWatches((all) => {
    all[watch.id] = watch;
  });
  await askAccess(watch.url);
  checkWatch(watch.id);
  await openInbox(watch.id);
}

// The context menu click or shortcut grants temporary access to the tab
// (activeTab), which is enough to run the picker.
async function startPicker(tab) {
  if (!tab?.id || !isHttpUrl(tab.url || '')) throw new Error('Only http and https pages can be watched.');
  checkSiteAllowed(await getPolicy(), tab.url);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/picker.js'] });
  await askAccess(tab.url);
}

function notifyProblem(e) {
  return chrome.notifications.create(`problem:${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: "Couldn't add the watch",
    message: (e?.message || String(e)).slice(0, 300),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Checking a watch

// Runs one check. `via` is 'schedule' (also used for "Check now") or 'live'
// (an open tab of the page changed); live checks read that tab directly.
async function checkWatch(id, { via = 'schedule', tabId } = {}) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  const started = Date.now();
  try {
    const stored = await getWatch(id);
    if (!stored) return;
    const policy = await getPolicy();
    const watch = applyPolicy(policy, stored);
    if (via === 'live' && !watch.live) return;
    let result;
    let error = '';
    try {
      checkSiteAllowed(policy, watch.url);
      const granted = await chrome.permissions.contains({ origins: [originPattern(watch.url)] });
      if (!granted) throw new Error('Access to this site has not been granted. Open the watch and click Allow.');
      if (via === 'live') result = await extractInTab(tabId, watch);
      else if (watch.mode === 'tab') result = await renderAndExtract(watch);
      else result = await fetchAndExtract(watch);
      result.text = postProcess(result.text, watch);
    } catch (e) {
      error = e?.message || String(e);
    }
    await record(watch, result, error, { via, started });
  } finally {
    inFlight.delete(id);
  }
}

async function record(watch, result, error, { via, started }) {
  const { id } = watch;
  const now = Date.now();
  const logEntry = { t: now, ok: !error, changed: false, alerted: false, error, ms: now - started, via };

  if (error) {
    const updated = await updateWatches((all) => {
      const w = all[id];
      if (!w) return null;
      w.lastCheckedAt = now;
      if (via !== 'live') w.nextCheckAt = nextCheckTime(w, now);
      w.lastError = error;
      w.errorCount = (w.errorCount || 0) + 1;
      return { ...w };
    });
    await appendLog(id, logEntry);
    if (updated) await maybeAlertError(updated, now);
    await broadcast({ type: 'changed', id });
    return;
  }

  const history = await getHistory(id);
  const previous = history[history.length - 1];
  const changed = !previous
    || comparisonKey(previous.text, watch.ignore) !== comparisonKey(result.text, watch.ignore);
  let alert = false;
  if (changed) {
    const entry = { t: now, text: result.text };
    if (result.html) entry.html = result.html;
    await appendHistory(id, entry, watch.historyLimit);
    if (previous) {
      logEntry.changed = true;
      alert = conditionMet(watch.condition, previous.text, result.text, history.map((h) => h.text));
    }
  } else if (result.html && !previous.html && previous.text === result.text) {
    // Backfill the HTML of the current version so the visual view works.
    await serialize(async () => {
      const key = `history:${id}`;
      const h = (await chrome.storage.local.get(key))[key] || [];
      if (h.length && h[h.length - 1].text === result.text) {
        h[h.length - 1].html = result.html;
        await chrome.storage.local.set({ [key]: h });
      }
    });
  }
  logEntry.alerted = alert;
  await updateWatches((all) => {
    const w = all[id];
    if (!w) return;
    w.lastCheckedAt = now;
    if (via !== 'live') w.nextCheckAt = nextCheckTime(w, now);
    w.lastError = '';
    w.errorCount = 0;
    if (previous && changed) {
      w.lastChangedAt = now;
      w.lastSummary = summarizeChange(previous.text, result.text, 160);
    }
    if (alert) w.unread = true;
  });
  await appendLog(id, logEntry);
  if (alert) await deliverAlert(watch, previous.text, result.text).catch((e) => console.warn('Alert failed', e));
  await updateBadge();
  await broadcast({ type: 'changed', id });
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
    const isPdf = /application\/pdf/i.test(response.headers.get('content-type') || '');
    bytes = await readLimited(response, isPdf ? MAX_PDF_BYTES : MAX_BYTES);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The site took longer than 30 seconds to respond');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') || '';
  if (/application\/pdf/i.test(contentType) || startsWithPdfMagic(bytes)) {
    return { text: await pdfToText(bytes), kind: 'pdf' };
  }

  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] || 'utf-8';
  let body;
  try {
    body = new TextDecoder(charset).decode(bytes);
  } catch {
    body = new TextDecoder('utf-8').decode(bytes);
  }

  if (/json/i.test(contentType)) {
    try {
      return { text: JSON.stringify(JSON.parse(body), null, 2), kind: 'json' };
    } catch {
      return { text: body, kind: 'text' };
    }
  }
  if (/^text\/plain/i.test(contentType)) return { text: body, kind: 'text' };

  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'extract',
    html: body,
    mime: /xml/i.test(contentType) && !/html/i.test(contentType) ? 'application/xml' : 'text/html',
    spec: extractSpec(watch, response.url || watch.url),
  });
  if (!result?.ok) throw new Error(result?.error || 'Could not read the page');
  return result;
}

function startsWithPdfMagic(bytes) {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function extractSpec(watch, baseUrl) {
  return { selectors: watch.selectors, excludes: watch.excludes, baseUrl, captureHtml: true };
}

async function readLimited(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      reader.cancel();
      throw new Error(`The page is larger than ${Math.round(limit / 1024 / 1024)} MB`);
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
  renderTabs.add(tabId);
  try {
    await waitForTabComplete(tabId);
    await new Promise((r) => setTimeout(r, watch.renderDelaySeconds * 1000));
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || new URL(tab.url).origin !== new URL(watch.url).origin) {
      throw new Error('The page redirected to a different site');
    }
    return await extractInTab(tabId, watch);
  } finally {
    renderTabs.delete(tabId);
    chrome.windows.remove(win.id).catch(() => {});
  }
}

// Runs the extractor in a tab (and, if the watch asks for it, in the tab's
// frames that the extension has access to).
async function extractInTab(tabId, watch) {
  const tab = await chrome.tabs.get(tabId);
  const injections = await chrome.scripting.executeScript({
    target: watch.includeFrames ? { tabId, allFrames: true } : { tabId },
    func: extractText,
    args: [extractSpec(watch, tab.url)],
  });
  const main = injections.find((i) => i.frameId === 0)?.result;
  const found = injections
    .sort((a, b) => a.frameId - b.frameId)
    .map((i) => i.result)
    .filter((r) => r?.ok);
  if (!found.length) throw new Error(main?.error || 'Could not read the page');
  return {
    text: found.map((r) => r.text).filter(Boolean).join('\n'),
    html: found.map((r) => r.html || '').join(''),
  };
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
// Live mode: while a watched page is open in a tab, a small observer in that
// tab reports DOM changes and the page is re-read right away.

const lastLiveCheck = new Map();
const pendingLiveCheck = new Map();

// At most one live check per watch every LIVE_MIN_GAP_MS; a change reported
// sooner than that is checked once the gap has passed.
function liveCheck(id, tabId) {
  const wait = (lastLiveCheck.get(id) || 0) + LIVE_MIN_GAP_MS - Date.now();
  if (wait > 0) {
    if (!pendingLiveCheck.has(id)) {
      pendingLiveCheck.set(id, setTimeout(() => {
        pendingLiveCheck.delete(id);
        liveCheck(id, tabId);
      }, wait));
    }
    return;
  }
  lastLiveCheck.set(id, Date.now());
  checkWatch(id, { via: 'live', tabId }).catch(() => {});
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url?.startsWith('http') || renderTabs.has(tabId)) return;
  const live = Object.values(await getWatches()).filter((w) => w.live && !w.paused && sameDocument(w.url, tab.url));
  if (!live.length || (await getPolicy()).disableLiveMode) return;
  if (!(await chrome.permissions.contains({ origins: [originPattern(tab.url)] }))) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['src/live.js'] }).catch(() => {});
  for (const w of live) liveCheck(w.id, tabId);
});

async function onLiveChanged(tab) {
  const live = Object.values(await getWatches()).filter((w) => w.live && !w.paused && sameDocument(w.url, tab.url));
  for (const w of live) liveCheck(w.id, tab.id);
  return {};
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

// Sends the alert now, or holds it for quiet hours or the combined summary.
async function deliverAlert(watch, oldText, newText) {
  if (!watch.notify && !watch.sound && !watch.speak) return;
  const summary = summarizeChange(oldText, newText);
  const now = Date.now();
  if (!shouldHold(await getSettings(), now)) {
    await notify([{ id: watch.id, name: watch.name, summary, t: now, count: 1, notify: watch.notify, sound: watch.sound, speak: watch.speak }], now);
    return;
  }
  await serialize(async () => {
    const { pendingAlerts = [] } = await chrome.storage.local.get('pendingAlerts');
    const alert = { id: watch.id, name: watch.name, summary, t: now, notify: watch.notify, sound: watch.sound, speak: watch.speak };
    await chrome.storage.local.set({ pendingAlerts: queueAlert(pendingAlerts, alert) });
  });
  await flushAlerts(now);
}

// Sends held alerts once quiet hours are over or the summary is due. Watches
// the user has already looked at (no longer unread) are left out.
async function flushAlerts(now = Date.now()) {
  const settings = await getSettings();
  const batch = await serialize(async () => {
    const { pendingAlerts = [], lastDigestAt = 0 } = await chrome.storage.local.get(['pendingAlerts', 'lastDigestAt']);
    if (!readyToFlush(settings, pendingAlerts, lastDigestAt, now)) return null;
    await chrome.storage.local.set({ pendingAlerts: [], lastDigestAt: now });
    return pendingAlerts;
  });
  if (!batch) return;
  const watches = await getWatches();
  await notify(batch.filter((p) => watches[p.id]?.unread), now);
}

async function notify(alerts, now) {
  const shown = alerts.filter((a) => a.notify);
  if (shown.length) {
    const { title, message } = digestMessage(shown);
    const single = shown.length === 1;
    await chrome.notifications.create(single ? `watch:${shown[0].id}:${now}` : `digest:${now}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      buttons: single ? [{ title: 'View changes' }, { title: 'Open page' }] : [{ title: 'View changes' }],
      priority: 1,
    });
  }
  if (alerts.some((a) => a.sound)) {
    await ensureOffscreen();
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'beep' }).catch(() => {});
  }
  const spoken = alerts.filter((a) => a.speak);
  if (spoken.length) {
    const text = spoken.length > 3
      ? `${spoken.length} watches changed.`
      : spoken.map((a) => `${a.name} changed. ${a.summary}`).join(' ');
    chrome.tts.speak(text.slice(0, 500), { enqueue: true });
  }
}

// Tells the user once a watch has failed several checks in a row, then at
// most every few minutes while it keeps failing.
async function maybeAlertError(watch, now) {
  const settings = await getSettings();
  const { errorAlerts } = settings;
  if (!errorAlerts.enabled || watch.errorCount < errorAlerts.after) return;
  if (inQuietHours(settings, new Date(now))) return; // it will still be failing afterwards
  // Kept in session storage: survives service worker restarts, not browser restarts.
  const { errorAlertTimes = {} } = await chrome.storage.session.get('errorAlertTimes');
  if (now - (errorAlertTimes[watch.id] || 0) < errorAlerts.minIntervalMinutes * 60_000) return;
  errorAlertTimes[watch.id] = now;
  await chrome.storage.session.set({ errorAlertTimes });
  await chrome.notifications.create(`watch:${watch.id}:${now}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `Can't check: ${watch.name}`.slice(0, 120),
    message: `${watch.errorCount} checks in a row failed. ${watch.lastError}`.slice(0, 300),
    buttons: [{ title: 'View watch' }, { title: 'Open page' }],
    priority: 1,
  }).catch(() => {});
}

function watchIdFromNotification(notificationId) {
  const m = /^watch:([a-z0-9-]+):\d+$/i.exec(notificationId);
  return m ? m[1] : null;
}

chrome.notifications.onClicked.addListener((notificationId) => {
  const id = watchIdFromNotification(notificationId);
  if (id || notificationId.startsWith('digest:')) openInbox(id);
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const id = watchIdFromNotification(notificationId);
  chrome.notifications.clear(notificationId);
  if (notificationId.startsWith('digest:')) return openInbox(null);
  if (!id) return;
  if (buttonIndex === 0) return openInbox(id);
  openPage(id).catch(() => {});
});

// Opens the watched page and highlights what the latest change added.
async function openPage(id) {
  const watch = await getWatch(id);
  if (!watch) throw new Error('Watch not found');
  const tab = await chrome.tabs.create({ url: watch.url });
  const history = await getHistory(id);
  if (history.length < 2 || !(await chrome.permissions.contains({ origins: [originPattern(watch.url)] }))) return 0;
  const { added } = changedText(history[history.length - 2].text, history[history.length - 1].text);
  const fragments = added.split('\n').map((l) => l.trim()).filter((l) => l.length >= 2).slice(0, 50);
  if (!fragments.length) return 0;
  // Dynamic pages may fill in after load, so try a few times.
  for (const wait of [0, 1500, 4000]) {
    try {
      await waitForTabComplete(tab.id);
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const current = await chrome.tabs.get(tab.id);
      if (!sameDocument(current.url || current.pendingUrl || '', watch.url)) return 0; // navigated elsewhere
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: highlightChanges,
        args: [fragments, watch.selectors.map(({ type, expr }) => ({ type, expr }))],
      });
      if (result > 0) {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, css: HIGHLIGHT_CSS });
        return result;
      }
    } catch {
      return 0; // tab closed, or the page can't be scripted
    }
  }
  return 0;
}

async function openInbox(id) {
  const url = id ? `${INBOX_URL}#/w/${encodeURIComponent(id)}` : `${INBOX_URL}#/unread`;
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
async function releaseUnusedOrigins(removedUrls) {
  const watches = Object.values(await getWatches());
  const patterns = [...new Set(removedUrls.map(originPattern))]
    .filter((p) => !watches.some((w) => originPattern(w.url) === p));
  if (patterns.length) await chrome.permissions.remove({ origins: patterns }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Messages

// Applies organization policy to a watch being saved. Throws if the site isn't
// allowed or a new watch would exceed the limit.
async function enforcePolicy(watch, { adding = 0 } = {}) {
  const policy = await getPolicy();
  checkSiteAllowed(policy, watch.url);
  if (adding && policy.maxWatches) {
    const count = Object.keys(await getWatches()).length;
    if (count + adding > policy.maxWatches) {
      throw new Error(`Your organization allows at most ${policy.maxWatches} watches`);
    }
  }
  return applyPolicy(policy, watch);
}

// Changing any of these makes earlier versions incomparable with new ones.
const CONTENT_FIELDS = ['url', 'selectors', 'excludes', 'regexFilter', 'mode', 'includeFrames'];

const uiHandlers = {
  async createWatch({ watch }) {
    const clean = await enforcePolicy(sanitizeWatch(watch), { adding: 1 });
    await updateWatches((all) => {
      all[clean.id] = clean;
    });
    checkWatch(clean.id);
    return { id: clean.id };
  },

  async updateWatch({ watch }) {
    const before = await getWatch(watch?.id);
    if (!before) throw new Error('Watch not found');
    const clean = await enforcePolicy(sanitizeWatch(watch, before));
    const reset = CONTENT_FIELDS.some((f) => JSON.stringify(before[f]) !== JSON.stringify(clean[f]));
    const rescheduled = before.intervalMinutes !== clean.intervalMinutes
      || JSON.stringify(before.schedule) !== JSON.stringify(clean.schedule);
    if (rescheduled) clean.nextCheckAt = nextCheckTime(clean, clean.lastCheckedAt || Date.now());
    await updateWatches((all) => {
      all[clean.id] = clean;
    });
    if (reset) {
      await deleteHistory(clean.id);
      await updateWatches((all) => {
        if (all[clean.id]) Object.assign(all[clean.id], { lastCheckedAt: 0, nextCheckAt: 0 });
      });
      if (before.url !== clean.url) await releaseUnusedOrigins([before.url]);
      checkWatch(clean.id);
    }
    await broadcast({ type: 'changed', id: clean.id });
    return { id: clean.id };
  },

  async duplicateWatch({ id }) {
    const source = await getWatch(id);
    if (!source) throw new Error('Watch not found');
    const copy = await enforcePolicy(sanitizeWatch({
      ...exportableWatch(source), id: undefined, name: `${source.name} (copy)`.slice(0, 200),
    }), { adding: 1 });
    await updateWatches((all) => {
      all[copy.id] = copy;
    });
    checkWatch(copy.id);
    return { id: copy.id };
  },

  async deleteWatch({ id }) {
    return uiHandlers.bulk({ ids: [id], action: 'delete' });
  },

  async openPage({ id }) {
    return { highlighted: await openPage(id) };
  },

  async checkNow({ id }) {
    await checkWatch(id);
    return {};
  },

  async setRead({ id, read }) {
    return uiHandlers.bulk({ ids: [id], action: read ? 'markRead' : 'markUnread' });
  },

  async markAllRead() {
    const ids = Object.keys(await getWatches());
    return uiHandlers.bulk({ ids, action: 'markRead' });
  },

  // Applies one action to several watches.
  async bulk({ ids, action, label }) {
    if (!Array.isArray(ids)) throw new Error('No watches selected');
    const idSet = new Set(ids.filter((id) => typeof id === 'string'));
    const cleanLabel = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
    if ((action === 'addLabel' || action === 'removeLabel') && !cleanLabel) throw new Error('Enter a label');
    if (action === 'checkNow') {
      for (const id of idSet) checkWatch(id);
      return {};
    }
    const removed = [];
    await updateWatches((all) => {
      for (const id of idSet) {
        const w = all[id];
        if (!w) continue;
        switch (action) {
          case 'pause': w.paused = true; break;
          case 'resume': w.paused = false; break;
          case 'markRead': w.unread = false; break;
          case 'markUnread': w.unread = true; break;
          case 'addLabel':
            if (!w.labels.some((l) => l.toLowerCase() === cleanLabel.toLowerCase()) && w.labels.length < 20) w.labels.push(cleanLabel);
            break;
          case 'removeLabel':
            w.labels = w.labels.filter((l) => l.toLowerCase() !== cleanLabel.toLowerCase());
            break;
          case 'delete':
            removed.push(w.url);
            delete all[id];
            break;
          default:
            throw new Error('Unknown action');
        }
      }
    });
    if (action === 'delete') {
      for (const id of idSet) await deleteHistory(id);
      await releaseUnusedOrigins(removed);
    }
    await updateBadge();
    await broadcast({ type: 'changed' });
    return {};
  },

  async saveSettings({ settings }) {
    await chrome.storage.local.set({ settings: sanitizeSettings(settings) });
    await flushAlerts(); // e.g. quiet hours were just turned off
    return {};
  },

  async exportAll() {
    const watches = Object.values(await getWatches()).map(exportableWatch);
    return { data: { format: 'open-page-watcher', version: 3, watches, settings: await getSettings() } };
  },

  async importAll({ data, includeSettings = false }) {
    if (data?.format !== 'open-page-watcher' || !Array.isArray(data.watches)) {
      throw new Error('This is not an Open Page Watcher export file');
    }
    const existing = await getWatches();
    const imported = [];
    const skipped = [];
    for (const raw of data.watches.slice(0, 1000)) {
      try {
        const w = await enforcePolicy(sanitizeWatch({ ...raw, id: existing[raw?.id] ? undefined : raw?.id }), { adding: imported.length + 1 });
        imported.push(w);
      } catch (e) {
        skipped.push(`${raw?.name || raw?.url || 'unknown'}: ${e.message}`);
      }
    }
    await updateWatches((all) => {
      for (const w of imported) all[w.id] = w;
    });
    if (includeSettings === true && data.settings && typeof data.settings === 'object') {
      await chrome.storage.local.set({ settings: sanitizeSettings(data.settings) });
    }
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
  } else if (message.type === 'live:changed' && sender.tab?.url) {
    handler = () => onLiveChanged(sender.tab);
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
  const toSelectors = (list) => (Array.isArray(list) ? list : [])
    .filter((expr) => typeof expr === 'string')
    .map((expr) => ({ type: 'css', expr }));
  const selectors = toSelectors(message.selectors);
  if (!selectors.length) throw new Error('Select at least one element');
  const watch = await enforcePolicy(sanitizeWatch({
    url: tab.url,
    name: typeof tab.title === 'string' ? tab.title.slice(0, 200) : '',
    selectors,
    excludes: toSelectors(message.excludes),
  }), { adding: 1 });
  // If site access hasn't been granted yet, the watch is still saved; its first
  // check reports the missing access and the inbox offers to grant it.
  await updateWatches((all) => {
    all[watch.id] = watch;
  });
  checkWatch(watch.id);
  if (!(await chrome.permissions.contains({ origins: [originPattern(watch.url)] }))) openInbox(watch.id);
  return { id: watch.id };
}
