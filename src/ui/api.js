import { originPattern } from '../lib/watch.js';

export async function call(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || 'Something went wrong');
  return res;
}

export async function getWatches() {
  const { watches } = await chrome.storage.local.get('watches');
  return Object.values(watches || {});
}

export async function getHistory(id) {
  const key = `history:${id}`;
  return (await chrome.storage.local.get(key))[key] || [];
}

export function hasAccess(url) {
  return chrome.permissions.contains({ origins: [originPattern(url)] });
}

// Must be called from a user gesture (a click handler).
export function requestAccess(urls) {
  const origins = [...new Set(urls.map(originPattern))];
  return chrome.permissions.request({ origins });
}

export function onChanged(fn) {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message?.target === 'ui') fn(message);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.watches) fn({ type: 'changed' });
  });
}

export function timeAgo(t) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

export function formatInterval(minutes) {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'every day' : `every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? 'every hour' : `every ${minutes / 60} hours`;
  return minutes === 1 ? 'every minute' : `every ${minutes} minutes`;
}

// Tiny DOM helper. Children that are strings become text nodes, never HTML.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
