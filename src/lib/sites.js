import { isHttpUrl, originPattern } from './watch.js';

// Site access: which sites Chrome lets the extension read, and which watches
// need each one. Used by the inbox's Site access page and the background's
// permission housekeeping.

// Grants that cover every site. The extension only asks for <all_urls>, and
// only while a watch compares screenshots; the others can be granted by hand
// on chrome://extensions.
export const BROAD_PATTERNS = ['<all_urls>', 'http://*/*', 'https://*/*', '*://*/*'];

const SITE_PATTERN = /^https?:\/\/[^/*\s]+\/\*$/;

// Whether a value is a single-site pattern like https://example.com/*.
export function isSitePattern(value) {
  return typeof value === 'string' && SITE_PATTERN.test(value);
}

// Turns what someone typed ("example.com", "https://example.com/news") into
// the address of the site. A missing scheme means https.
export function siteUrl(text) {
  let value = String(text ?? '').trim();
  if (!value) throw new Error('Enter a site, like example.com');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  if (!isHttpUrl(value)) throw new Error('Only http:// and https:// sites can be allowed');
  const url = new URL(value);
  if (!url.hostname || url.hostname.includes('*')) throw new Error('Enter one site, like example.com');
  return `${url.protocol}//${url.hostname}/`;
}

// The site part of a pattern for display: "example.com", or
// "http://example.com" for unencrypted http.
export function siteLabel(pattern) {
  if (BROAD_PATTERNS.includes(pattern)) return 'All sites';
  const m = /^(https?):\/\/([^/]+)\/\*$/.exec(pattern);
  if (!m) return pattern;
  return m[1] === 'http' ? `http://${m[2]}` : m[2];
}

// Keeps only valid, distinct single-site patterns.
export function cleanKeptSites(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(isSitePattern))].slice(0, 500);
}

// Builds the Site access list.
//   origins: chrome.permissions.getAll().origins
//   watches: the saved watches
//   kept:    sites the user allowed on the Site access page
// Returns { broad, rows }: broad lists the all-site grants held, and each row
// is { pattern, label, granted, kept, watches: [{ id, name, paused, screenshot }] }.
// A site some watch needs but that isn't granted is listed too (granted false),
// so it can be allowed from the same page.
export function siteRows({ origins = [], watches = [], kept = [] }) {
  const broad = origins.filter((o) => BROAD_PATTERNS.includes(o));
  const rows = new Map();
  const row = (pattern) => {
    if (!rows.has(pattern)) {
      rows.set(pattern, { pattern, label: siteLabel(pattern), granted: false, kept: false, watches: [] });
    }
    return rows.get(pattern);
  };
  for (const o of origins) if (isSitePattern(o)) row(o).granted = true;
  for (const p of cleanKeptSites(kept)) row(p).kept = true;
  for (const w of watches) {
    if (!isHttpUrl(w?.url)) continue;
    row(originPattern(w.url)).watches.push({
      id: w.id, name: w.name || w.url, paused: !!w.paused, screenshot: !!w.watchScreenshot,
    });
  }
  // While an all-sites grant is held, Chrome doesn't list sites one by one,
  // so a kept site or a site with watches counts as granted.
  if (broad.length) for (const r of rows.values()) if (r.kept || r.watches.length) r.granted = true;
  const host = (p) => p.replace(/^https?:\/\//, '');
  const list = [...rows.values()].sort((a, b) => host(a.pattern).localeCompare(host(b.pattern)) || a.pattern.localeCompare(b.pattern));
  for (const r of list) r.watches.sort((a, b) => a.name.localeCompare(b.name));
  return { broad, rows: list };
}
