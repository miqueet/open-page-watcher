import { cleanWindow } from './watch.js';

// All persistent state lives in chrome.storage.local.
//   watches            -> { [id]: watch }
//   history:<id>       -> [{ t, text, html? }] oldest first
//   log:<id>           -> [{ t, ok, changed, alerted, error, ms, via }] newest last
//   settings           -> see DEFAULT_SETTINGS
//
// Writes are serialized so concurrent checks can't overwrite each other.

export const HTML_VERSIONS_KEPT = 5;
const LOG_LIMIT = 50;

export const DEFAULT_SETTINGS = {
  errorAlerts: { enabled: true, after: 5, minIntervalMinutes: 15 },
  // 'instant' sends each alert as it happens; 'digest' combines them into one
  // notification at most every digestEveryMinutes.
  delivery: { mode: 'instant', digestEveryMinutes: 180 },
  // No notifications or sounds in this window; held alerts go out after it.
  quietHours: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '07:00' },
};
export const DIGEST_CHOICES = [30, 60, 180, 360, 720, 1440];

let queue = Promise.resolve();

export function serialize(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export async function getWatches() {
  const { watches } = await chrome.storage.local.get('watches');
  return watches || {};
}

export async function getWatch(id) {
  const all = await getWatches();
  return typeof id === 'string' && Object.hasOwn(all, id) ? all[id] : null;
}

export function updateWatches(mutator) {
  return serialize(async () => {
    const watches = await getWatches();
    const result = await mutator(watches);
    await chrome.storage.local.set({ watches });
    return result;
  });
}

export async function getHistory(id) {
  const key = `history:${id}`;
  return (await chrome.storage.local.get(key))[key] || [];
}

// Page HTML (for the visual and source views) is kept only for the most
// recent versions, to bound storage.
export function appendHistory(id, entry, limit) {
  return serialize(async () => {
    const key = `history:${id}`;
    const history = (await chrome.storage.local.get(key))[key] || [];
    history.push(entry);
    while (history.length > limit) history.shift();
    for (let i = 0; i < history.length - HTML_VERSIONS_KEPT; i++) delete history[i].html;
    await chrome.storage.local.set({ [key]: history });
    return history;
  });
}

export function deleteHistory(id) {
  return serialize(() => chrome.storage.local.remove([`history:${id}`, `log:${id}`]));
}

export async function getLog(id) {
  const key = `log:${id}`;
  return (await chrome.storage.local.get(key))[key] || [];
}

export function appendLog(id, entry) {
  return serialize(async () => {
    const key = `log:${id}`;
    const log = (await chrome.storage.local.get(key))[key] || [];
    log.push(entry);
    while (log.length > LOG_LIMIT) log.shift();
    await chrome.storage.local.set({ [key]: log });
  });
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return sanitizeSettings(settings);
}

export function sanitizeSettings(input) {
  const e = input?.errorAlerts || {};
  const d = input?.delivery || {};
  const int = (v, min, max, def) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : def);
  return {
    errorAlerts: {
      enabled: e.enabled !== false,
      after: int(e.after, 1, 100, DEFAULT_SETTINGS.errorAlerts.after),
      minIntervalMinutes: int(e.minIntervalMinutes, 1, 1440, DEFAULT_SETTINGS.errorAlerts.minIntervalMinutes),
    },
    delivery: {
      mode: d.mode === 'digest' ? 'digest' : 'instant',
      digestEveryMinutes: DIGEST_CHOICES.includes(Number(d.digestEveryMinutes))
        ? Number(d.digestEveryMinutes) : DEFAULT_SETTINGS.delivery.digestEveryMinutes,
    },
    quietHours: cleanWindow(input?.quietHours, DEFAULT_SETTINGS.quietHours),
  };
}
