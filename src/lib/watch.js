import { normalizeCondition } from './conditions.js';

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
export const DEFAULT_INTERVAL_MINUTES = 60;
export const DEFAULT_HISTORY = 20;
export const MAX_HISTORY = 200;
// What to do when a check finds a sign-in page instead of the watched content.
export const SIGN_IN_ACTIONS = ['notify', 'tab', 'pause', 'nothing'];
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

// Whether two URLs point at the same document (ignoring #fragments).
export function sameDocument(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    x.hash = '';
    y.hash = '';
    return x.href === y.href;
  } catch {
    return false;
  }
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

const SELECTOR_LIMIT = 50;
const DAYS = [0, 1, 2, 3, 4, 5, 6];

function cleanSelectors(list, { allowAttr }) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s.expr === 'string' && s.expr.trim())
    .slice(0, SELECTOR_LIMIT)
    .map((s) => {
      const out = { type: s.type === 'xpath' ? 'xpath' : 'css', expr: str(s.expr).trim() };
      // Attribute or property to read instead of text, e.g. href or src.
      if (allowAttr && typeof s.attr === 'string' && /^[A-Za-z_:][\w:.-]{0,63}$/.test(s.attr)) out.attr = s.attr;
      return out;
    });
}

function cleanTime(value, fallback) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

// A time-of-day window on some weekdays (used by schedules and quiet hours).
export function cleanWindow(w, fallback = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }) {
  const src = w || {};
  const days = Array.isArray(src.days) ? [...new Set(src.days.map(Number).filter((d) => DAYS.includes(d)))].sort() : fallback.days;
  return {
    enabled: src.enabled === true,
    days: days.length ? days : fallback.days,
    start: cleanTime(src.start, fallback.start),
    end: cleanTime(src.end, fallback.end),
  };
}

function cleanSchedule(src) {
  const s = src.schedule || {};
  return {
    type: s.type === 'random' ? 'random' : 'interval',
    // For random schedules, checks happen between intervalMinutes and this.
    randomMaxMinutes: clampInt(s.randomMaxMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES * 2),
    window: cleanWindow(s.window),
  };
}

function cleanLabels(labels) {
  if (!Array.isArray(labels)) return [];
  const out = [];
  for (const l of labels) {
    if (typeof l !== 'string') continue;
    const label = l.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (label && !out.some((x) => x.toLowerCase() === label.toLowerCase())) out.push(label);
    if (out.length >= 20) break;
  }
  return out;
}

// Builds a clean watch object from untrusted input (UI forms, imports, picker).
// Throws on input that can't be made valid.
export function sanitizeWatch(input, existing = {}) {
  const src = { ...existing, ...input };
  const url = str(src.url).trim();
  if (!isHttpUrl(url)) throw new Error('Only http and https URLs can be watched');

  const condition = normalizeCondition(src.condition);
  const regexFilter = str(src.regexFilter);
  if (regexFilter) new RegExp(regexFilter); // throws a readable SyntaxError if invalid
  for (const rule of condition.rules) {
    if (rule.type === 'regex' || rule.type === 'notRegex') new RegExp(rule.value);
  }
  const schedule = cleanSchedule(src);
  const intervalMinutes = clampInt(src.intervalMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES);
  if (schedule.randomMaxMinutes < intervalMinutes) schedule.randomMaxMinutes = intervalMinutes;

  return {
    id: typeof src.id === 'string' && /^[a-z0-9-]{1,64}$/i.test(src.id) ? src.id : crypto.randomUUID(),
    name: str(src.name).trim() || new URL(url).hostname,
    url,
    selectors: cleanSelectors(src.selectors, { allowAttr: true }),
    excludes: cleanSelectors(src.excludes, { allowAttr: false }),
    regexFilter,
    mode: src.mode === 'tab' ? 'tab' : 'fetch',
    renderDelaySeconds: clampInt(src.renderDelaySeconds, 0, 60, 3),
    includeFrames: src.includeFrames === true,
    live: src.live === true,
    sendCookies: src.sendCookies === true,
    // Try once with cookies when the page asks the user to sign in, and keep
    // them on if that gets past the sign-in page.
    autoCookies: src.autoCookies !== false,
    onSignIn: SIGN_IN_ACTIONS.includes(src.onSignIn) ? src.onSignIn : 'notify',
    intervalMinutes,
    schedule,
    historyLimit: clampInt(src.historyLimit, 2, MAX_HISTORY, DEFAULT_HISTORY),
    condition,
    notify: src.notify !== false,
    sound: src.sound === true,
    speak: src.speak === true,
    paused: src.paused === true,
    labels: cleanLabels(src.labels),
    ignore: {
      case: src.ignore?.case === true,
      whitespace: src.ignore?.whitespace === true,
      numbers: src.ignore?.numbers === true,
      dates: src.ignore?.dates === true,
    },
    // Runtime state (preserved from existing, never trusted from imports).
    createdAt: Number(existing.createdAt) || Date.now(),
    lastCheckedAt: Number(existing.lastCheckedAt) || 0,
    lastChangedAt: Number(existing.lastChangedAt) || 0,
    nextCheckAt: Number(existing.nextCheckAt) || 0,
    lastError: typeof existing.lastError === 'string' ? existing.lastError : '',
    errorCount: Number(existing.errorCount) || 0,
    unread: existing.unread === true,
    lastSummary: typeof existing.lastSummary === 'string' ? existing.lastSummary : '',
    signInNeeded: existing.signInNeeded === true,
    signInHandled: existing.signInHandled === true,
  };
}

const RUNTIME_FIELDS = [
  'lastCheckedAt', 'lastChangedAt', 'nextCheckAt', 'lastError', 'errorCount', 'unread', 'lastSummary', 'signInNeeded', 'signInHandled',
];

// Fields included in an export file.
export function exportableWatch(w) {
  const out = { ...w };
  for (const f of RUNTIME_FIELDS) delete out[f];
  return out;
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

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gi, // ISO
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, // 10/13/2026, 13.10.26
  new RegExp(`\\b(?:${MONTHS})\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}\\b`, 'gi'), // Oct 13, 2026
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)? (?:${MONTHS})\\.?,? \\d{4}\\b`, 'gi'), // 13 October 2026
  /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?\b/gi, // 12:25, 3:04:05 pm
  /\b(?:just now|\d+ (?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?) ago)\b/gi, // relative
];

// The text used to decide whether a page changed, after the watch's
// "ignore" options. The stored history keeps the real text.
export function comparisonKey(text, ignore = {}) {
  let t = text;
  if (ignore.dates) for (const re of DATE_PATTERNS) t = t.replace(re, '<date>');
  if (ignore.numbers) t = t.replace(/\d[\d,.]*/g, '<n>');
  if (ignore.whitespace) t = t.replace(/\s+/g, ' ').trim();
  if (ignore.case) t = t.toLowerCase();
  return t;
}

function minutesOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Whether `date` (local time) falls inside the watch's allowed time window.
// A window whose end is before its start runs overnight, e.g. 22:00-06:00.
export function inWindow(schedule, date) {
  const w = schedule?.window;
  if (!w?.enabled) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  const start = minutesOfDay(w.start);
  const end = minutesOfDay(w.end);
  if (start === end) return w.days.includes(date.getDay());
  if (start < end) return w.days.includes(date.getDay()) && now >= start && now < end;
  // Overnight: the part after midnight belongs to the previous day's window.
  if (now >= start) return w.days.includes(date.getDay());
  if (now < end) return w.days.includes((date.getDay() + 6) % 7);
  return false;
}

// When the next check should happen after a check at `from`.
export function nextCheckTime(watch, from, random = Math.random) {
  const min = watch.intervalMinutes;
  if (watch.schedule?.type !== 'random') return from + min * 60_000;
  const max = Math.max(min, watch.schedule.randomMaxMinutes);
  return from + Math.round((min + random() * (max - min)) * 60_000);
}

export function isDue(watch, now) {
  if (watch.paused) return false;
  if (!inWindow(watch.schedule, new Date(now))) return false;
  const due = watch.nextCheckAt || (watch.lastCheckedAt || 0) + watch.intervalMinutes * 60_000;
  return now >= due - 5_000;
}
