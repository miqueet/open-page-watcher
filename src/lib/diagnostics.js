// The diagnostics file for one watch: what the extension sees on the page and
// why, to share when a watch doesn't capture what it should.
//
// Pages watched at work are often internal, so the file is built to be safe
// to share by default: the captured text is left out unless the user ticks a
// box (only sizes, line counts and a fingerprint are included), and page
// addresses, host names and the watch's name are replaced with placeholders
// unless they tick another. Cookies, headers and anything typed into a page
// are never part of it.

export const DIAGNOSTICS_FORMAT = 'open-page-watcher-diagnostics';
const PREVIEW_CHARS = 20_000;

// Counts that describe a text without showing it.
export async function textStats(text) {
  const t = typeof text === 'string' ? text : '';
  const lines = t ? t.split('\n') : [];
  return {
    chars: t.length,
    lines: lines.length,
    blankLines: lines.filter((l) => !l.trim()).length,
    indentedLines: lines.filter((l) => /^[ \t]+\S/.test(l)).length,
    longestLine: lines.reduce((m, l) => Math.max(m, l.length), 0),
    sha256: await sha256(t),
  };
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const SETTINGS = [
  'mode', 'renderDelaySeconds', 'includeFrames', 'live', 'sendCookies', 'autoCookies', 'onSignIn', 'askToRender',
  'intervalMinutes', 'schedule', 'historyLimit', 'condition', 'paused', 'pauseAfterAlert', 'selectors', 'excludes',
  'regexFilter', 'ignore', 'watchFormatting', 'watchHtml', 'ignoreAttributes', 'watchScreenshot', 'screenshotThreshold',
];
const STATE = [
  'createdAt', 'lastCheckedAt', 'lastChangedAt', 'nextCheckAt', 'lastError', 'errorCount', 'signInNeeded', 'signInHandled',
  'redirectBlocked', 'scriptsNeeded', 'scriptsAsked', 'rebaseline',
];

// Plain-language notes on what the test check found, to read first.
export function findings(watch, run) {
  const notes = [];
  if (run.siteAccess === false) notes.push('The extension has no access to this site, so nothing could be read.');
  if (run.signInPage) notes.push('The page asked to sign in instead of showing its content.');
  if (run.scriptsNeeded) notes.push('Downloaded without scripts, the page is only a placeholder: use "Open it in a hidden window".');
  const frames = Array.isArray(run.frames) ? run.frames : [];
  const childFrames = frames.reduce((n, f) => n + (Array.isArray(f.childFrames) ? f.childFrames.length : 0), 0);
  if (childFrames && !watch.includeFrames) {
    notes.push(`The page has ${childFrames} frame(s) that aren't read. If what's missing is inside one, turn on "Include content inside frames on the page".`);
  }
  if (Array.isArray(run.skippedFrames) && run.skippedFrames.length) {
    notes.push(`${run.skippedFrames.length} frame(s) were left out because they come from sites this extension wasn't allowed to read.`);
  }
  for (const f of frames) {
    for (const e of Array.isArray(f.editors) ? f.editors : []) {
      const h = e.hints || {};
      const size = h.estimatedLines ? ` (it holds about ${h.estimatedLines} lines)`
        : h.scrollsFurther ? ' (it scrolls further, so it holds more)' : '';
      if (e.source === 'screen') {
        notes.push(watch.mode === 'tab'
          ? `A ${e.kind} code editor's full text couldn't be read, so only the ${e.lines} lines it drew were kept${size}. See "attempts" for why.`
          : `A ${e.kind} code editor was found, but downloaded pages don't run the editor, so only ${e.lines} drawn lines were kept${size}. Use "Open it in a hidden window".`);
      } else if (e.source) {
        notes.push(`A ${e.kind} code editor was read in full (${e.lines} lines, via ${e.source}).`);
      }
    }
    if (f.ok === false && f.error) notes.push(`Frame ${f.frameId}: ${f.error}`);
  }
  if (run.ok && typeof run.text === 'string' && !run.text.trim()) notes.push('The check worked but captured no text.');
  if (!run.ok && run.error && !notes.length) notes.push(`The check failed: ${run.error}`);
  return notes;
}

const iso = (t) => (Number(t) > 0 ? new Date(Number(t)).toISOString() : null);

// run: what a test check just found (see diagnoseWatch in background.js):
// { ok, error, ms, siteAccess, fetch?, render?, frames?, editorRead?, text?, signIn?, scriptsNeeded? }
export async function buildDiagnostics({
  version = '', userAgent = '', policy = {}, watch, history = [], log = [], run = {},
  includeContent = false, includeAddresses = false, now = Date.now(),
}) {
  const settings = {};
  for (const k of SETTINGS) if (k in watch) settings[k] = watch[k];
  const state = {};
  for (const k of STATE) if (k in watch) state[k] = /At$/.test(k) ? iso(watch[k]) : watch[k];

  const versions = [];
  for (const h of history.slice(-3)) {
    const v = { savedAt: iso(h.t), ...(await textStats(h.text)) };
    if (h.reader) v.reader = h.reader;
    if (h.html) v.htmlChars = h.html.length;
    if (typeof h.format === 'string') v.formatChars = h.format.length;
    if (h.shot) v.screenshot = true;
    if (includeContent) v.text = String(h.text || '').slice(0, PREVIEW_CHARS);
    versions.push(v);
  }

  const { text, ...rest } = run;
  const testCheck = { findings: findings(watch, run), ...rest };
  if (typeof text === 'string') {
    testCheck.captured = await textStats(text);
    const latest = history[history.length - 1];
    if (latest) testCheck.captured.sameAsLatestVersion = latest.text === text;
    if (includeContent) testCheck.captured.text = text.slice(0, PREVIEW_CHARS);
  }

  const report = {
    format: DIAGNOSTICS_FORMAT,
    formatVersion: 1,
    createdAt: iso(now),
    contentIncluded: includeContent,
    addressesIncluded: includeAddresses,
    extension: { version },
    browser: userAgent,
    organizationPolicy: Object.fromEntries(Object.entries(policy).map(([k, v]) => [k, Array.isArray(v) ? `${v.length} entries` : v])),
    watch: {
      id: watch.id,
      name: watch.name,
      url: watch.url,
      labels: watch.labels || [],
      settings,
      state,
    },
    savedVersions: { count: history.length, latest: versions },
    recentChecks: log.slice(-15).map((e) => ({
      at: iso(e.t), ok: e.ok, changed: e.changed, alerted: e.alerted, ms: e.ms, via: e.via, error: e.error || undefined, note: e.note || undefined,
    })),
    testCheck,
  };
  return includeAddresses ? report : hideAddresses(report);
}

// Replaces every web address with its scheme and a placeholder per site
// (site-1, site-2...), keeping whether two addresses are on the same site, and
// drops names and labels.
export function hideAddresses(report) {
  const out = structuredClone(report);
  out.watch.name = '(hidden)';
  out.watch.labels = out.watch.labels.length ? ['(hidden)'] : [];
  const hosts = new Map();
  const placeholder = (host) => {
    const h = host.toLowerCase();
    if (!hosts.has(h)) hosts.set(h, `site-${hosts.size + 1}`);
    return hosts.get(h);
  };
  // First every address, then any host name left on its own (in messages).
  const urlRe = /\b(https?|wss?|ftp):\/\/([^\s/?#"'<>:]+)(:\d+)?([^\s"'<>]*)/gi;
  const fixUrls = (s) => s.replace(urlRe, (_, scheme, host, port, rest) => `${scheme}://${placeholder(host)}${port || ''}${rest && rest !== '/' ? '/(path hidden)' : rest}`);
  const walk = (v) => {
    if (typeof v === 'string') return fixUrls(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k === 'text' && out.contentIncluded) continue; // the user chose to share the text as is
        v[k] = walk(v[k]);
      }
    }
    return v;
  };
  walk(out);
  // Host names and IP addresses left in messages (a redirect target, a
  // frame's site). Settings are left as written: selectors look like host
  // names too.
  const known = [...hosts.keys()].sort((a, b) => b.length - a.length)
    .map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const hostRe = new RegExp(`(${[...known, '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    '\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z][a-z0-9-]*[a-z0-9]\\b'].join('|')})`, 'gi');
  const KEEP = new Set(['settings', 'text', 'browser', 'sha256', 'id', 'format', 'kind', 'source']);
  const fixHosts = (v) => {
    if (typeof v === 'string') return v.replace(hostRe, (h) => (/^site-\d+$/.test(h) ? h : placeholder(h)));
    if (Array.isArray(v)) return v.map(fixHosts);
    if (v && typeof v === 'object') for (const k of Object.keys(v)) if (!KEEP.has(k)) v[k] = fixHosts(v[k]);
    return v;
  };
  fixHosts(out);
  return out;
}
