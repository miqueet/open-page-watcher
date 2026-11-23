import { HTML_VERSIONS_KEPT, SHOT_VERSIONS_KEPT } from './storage.js';
import { MAX_HISTORY } from './watch.js';

// Saved versions in backup files. A backup can include each watch's saved
// versions; on import they are checked here field by field, because the file
// may have been edited or come from someone else.

// The same limits a check applies before it saves a version.
export const MAX_TEXT_CHARS = 2_000_000;
export const MAX_HTML_CHARS = 300 * 1024;
const MAX_SHOT_CHARS = 8 * 1024 * 1024;
// Screenshots are stored as data: URLs of these types only, so an imported
// one can't point the inbox at a web address.
const SHOT_PATTERN = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
// The ways a version's text was read (2: code editors read in full).
const READERS = [2];
// The versions sent to the background page in one message on import.
export const IMPORT_BATCH = 10;

// A copy of a watch's versions for an export file. Without `pages`, the page
// copies (HTML) and screenshots are left out, which keeps the file small.
export function exportHistory(history, { pages = true } = {}) {
  if (!Array.isArray(history)) return [];
  return history.map((h) => {
    const out = { ...h };
    if (!pages) {
      delete out.html;
      delete out.shot;
    }
    return out;
  });
}

// Keeps only well-formed versions with known fields, oldest first.
// Returns [] for anything that isn't a list.
export function cleanHistory(input, { shots = true, now = Date.now() } = {}) {
  if (!Array.isArray(input)) return [];
  const out = [];
  // Versions dated more than a day ahead would stay "newest" forever.
  const latest = now + 24 * 60 * 60 * 1000;
  for (const raw of input.slice(-MAX_HISTORY)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const t = raw.t;
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || t > latest) continue;
    if (typeof raw.text !== 'string' || raw.text.length > MAX_TEXT_CHARS) continue;
    const entry = { t: Math.round(t), text: raw.text };
    if (typeof raw.html === 'string' && raw.html && raw.html.length <= MAX_HTML_CHARS) entry.html = raw.html;
    if (typeof raw.format === 'string' && raw.format.length <= MAX_TEXT_CHARS) entry.format = raw.format;
    if (shots && typeof raw.shot === 'string' && raw.shot.length <= MAX_SHOT_CHARS && SHOT_PATTERN.test(raw.shot)) entry.shot = raw.shot;
    if (READERS.includes(raw.reader)) entry.reader = raw.reader;
    out.push(entry);
  }
  return out.sort((a, b) => a.t - b.t);
}

// Adds imported versions to a watch's own, in time order. A version already
// there (same time and text) isn't added twice. Keeps the newest `limit`
// versions, and page copies and screenshots only for the most recent ones, as
// checks do.
export function mergeHistory(existing, imported, limit) {
  const seen = new Set();
  const all = [];
  for (const h of [...(Array.isArray(existing) ? existing : []), ...imported]) {
    const key = `${h.t}\n${h.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(h);
  }
  all.sort((a, b) => a.t - b.t);
  const kept = all.slice(-Math.max(1, limit));
  for (let i = 0; i < kept.length - HTML_VERSIONS_KEPT; i++) delete kept[i].html;
  for (let i = 0; i < kept.length - SHOT_VERSIONS_KEPT; i++) delete kept[i].shot;
  return kept;
}

// The saved versions a backup file holds for each watch, keyed by the watch's
// id in the file, as a Map. Files without saved versions give an empty Map.
export function historyInFile(data) {
  const h = data?.history;
  const out = new Map();
  if (!h || typeof h !== 'object' || Array.isArray(h)) return out;
  for (const [id, list] of Object.entries(h)) if (Array.isArray(list) && list.length) out.set(id, list);
  return out;
}
