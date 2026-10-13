import { CONDITION_TYPES } from './conditions.js';

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
export const DEFAULT_INTERVAL_MINUTES = 60;
export const DEFAULT_HISTORY = 20;
export const MAX_HISTORY = 200;
const MAX_STRING = 2000;

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// The host permission pattern that covers a URL, e.g. https://example.com/*
export function originPattern(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

function str(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, MAX_STRING);
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Builds a clean watch object from untrusted input (UI forms, imports, picker).
// Throws on input that can't be made valid.
export function sanitizeWatch(input, existing = {}) {
  const src = { ...existing, ...input };
  const url = str(src.url).trim();
  if (!isHttpUrl(url)) throw new Error('Only http and https URLs can be watched');

  const selectors = Array.isArray(src.selectors)
    ? src.selectors
        .filter((s) => s && typeof s.expr === 'string' && s.expr.trim())
        .slice(0, 50)
        .map((s) => ({ type: s.type === 'xpath' ? 'xpath' : 'css', expr: str(s.expr).trim() }))
    : [];

  const condType = CONDITION_TYPES[src.condition?.type] ? src.condition.type : 'any';
  const regexFilter = str(src.regexFilter);
  if (regexFilter) new RegExp(regexFilter); // throws a readable SyntaxError if invalid
  if (condType === 'regex') new RegExp(str(src.condition?.value));

  return {
    id: typeof src.id === 'string' && /^[a-z0-9-]{1,64}$/i.test(src.id) ? src.id : crypto.randomUUID(),
    name: str(src.name).trim() || new URL(url).hostname,
    url,
    selectors,
    regexFilter,
    mode: src.mode === 'tab' ? 'tab' : 'fetch',
    renderDelaySeconds: clampInt(src.renderDelaySeconds, 0, 60, 3),
    sendCookies: src.sendCookies === true,
    intervalMinutes: clampInt(src.intervalMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES),
    historyLimit: clampInt(src.historyLimit, 2, MAX_HISTORY, DEFAULT_HISTORY),
    condition: { type: condType, value: str(src.condition?.value) },
    notify: src.notify !== false,
    sound: src.sound === true,
    paused: src.paused === true,
    // Runtime state (preserved from existing, never trusted from imports).
    createdAt: Number(existing.createdAt) || Date.now(),
    lastCheckedAt: Number(existing.lastCheckedAt) || 0,
    lastChangedAt: Number(existing.lastChangedAt) || 0,
    lastError: typeof existing.lastError === 'string' ? existing.lastError : '',
    unread: existing.unread === true,
  };
}

// Fields included in an export file.
export function exportableWatch(w) {
  const { lastCheckedAt, lastChangedAt, lastError, unread, ...rest } = w;
  return rest;
}

// Applies the optional regex filter: keeps only the matched text.
export function postProcess(text, watch) {
  if (!watch.regexFilter) return text;
  const re = new RegExp(watch.regexFilter, 'g');
  const matches = [];
  for (const m of text.matchAll(re)) {
    matches.push(m[1] ?? m[0]);
    if (matches.length > 1000) break;
  }
  return matches.join('\n');
}

export function isDue(watch, now) {
  if (watch.paused) return false;
  return now - (watch.lastCheckedAt || 0) >= watch.intervalMinutes * 60_000 - 5_000;
}
