// Organization policy, set by IT through Chrome's managed storage
// (see managed_schema.json and docs/enterprise.md). Policy always wins over
// what the user picked, and is applied again at every check, so tightening a
// policy affects existing watches too.

export async function getPolicy() {
  try {
    return normalizePolicy(await chrome.storage.managed.get(null));
  } catch {
    return normalizePolicy({});
  }
}

function hostList(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter((h) => typeof h === 'string' && h.trim())
    .slice(0, 1000)
    .map((h) => h.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '')
      .replace(/^\*\./, ''));
}

export function normalizePolicy(raw = {}) {
  const int = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  return {
    allowedSites: hostList(raw.allowedSites),
    blockedSites: hostList(raw.blockedSites) || [],
    disableCookies: raw.disableCookies === true,
    disableRenderInTab: raw.disableRenderInTab === true,
    disableLiveMode: raw.disableLiveMode === true,
    minIntervalMinutes: int(raw.minIntervalMinutes),
    maxWatches: int(raw.maxWatches),
  };
}

export function isManaged(policy) {
  return Boolean(policy.allowedSites || policy.blockedSites.length || policy.disableCookies
    || policy.disableRenderInTab || policy.disableLiveMode || policy.minIntervalMinutes || policy.maxWatches);
}

function covers(entry, host) {
  return host === entry || host.endsWith(`.${entry}`);
}

// Throws if the organization doesn't allow watching this URL.
export function checkSiteAllowed(policy, url) {
  const host = new URL(url).hostname.toLowerCase();
  if (policy.blockedSites.some((e) => covers(e, host))) {
    throw new Error(`Your organization doesn't allow watching ${host}`);
  }
  if (policy.allowedSites && !policy.allowedSites.some((e) => covers(e, host))) {
    throw new Error(`Your organization doesn't allow watching ${host}`);
  }
}

// Returns the watch with any policy limits applied.
export function applyPolicy(policy, watch) {
  const w = { ...watch, schedule: watch.schedule ? { ...watch.schedule } : watch.schedule };
  if (policy.disableCookies) w.sendCookies = false;
  if (policy.disableRenderInTab) w.mode = 'fetch';
  if (policy.disableLiveMode) w.live = false;
  if (policy.minIntervalMinutes && w.intervalMinutes < policy.minIntervalMinutes) w.intervalMinutes = policy.minIntervalMinutes;
  if (w.schedule && policy.minIntervalMinutes && w.schedule.randomMaxMinutes < w.intervalMinutes) {
    w.schedule.randomMaxMinutes = w.intervalMinutes;
  }
  return w;
}
