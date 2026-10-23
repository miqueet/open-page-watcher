# Open Page Watcher: feature and security spec

This is a clean-room implementation. It was written from Distill Web Monitor's
public store listing, public documentation and observable behaviour. No Distill
code was copied, decompiled or consulted.

## Features (parity with Distill's local monitors)

| Distill feature | Open Page Watcher |
| --- | --- |
| Watch a whole page | Yes, "Watch whole page" in the popup or the right-click menu |
| Visual selector to watch parts of a page | Yes, click-to-select picker (multiple elements), with click-inside to exclude parts; reselect from the watch editor with current parts highlighted |
| CSS / XPath selection, exclusions | Yes, editable per watch, plus attributes (`a @href`) |
| Regex to extract matches | Yes, optional "keep only text matching" regex |
| Check schedule | Every 1 minute to every 7 days (slider or exact value), or random within a range, optionally only during set hours and days |
| Pages that need JavaScript to render | "Render in tab" mode opens the page in a hidden window, waits, extracts, closes it; can include frames |
| Live monitoring of an open tab | Yes, opt-in live mode re-reads the tab when its content changes |
| Conditions before alerting | Rule lists with all/any: text, regex, length, empty, never seen, number thresholds and changes by amount or percent, on new / added / removed / previous text |
| Ignore noise | Ignore dates, numbers, letter case or spacing when comparing |
| Inbox / watchlist with unread state | Yes, with filters, search, labels, bulk actions and keyboard shortcuts |
| Highlighted changes and history | Text, side-by-side, visual (sandboxed snapshot) and source views between any two saved versions |
| Pop-up, sound and spoken alerts | Desktop notification with a plain summary of the change, a choice of six built-in sounds (made locally, nothing downloaded), read aloud (on-device voices only), toolbar badge |
| Error alerts and check log | Alert after N failed checks in a row, and a log of the last 50 checks per watch |
| Feeds, PDFs, JSON | RSS/Atom and sitemaps one entry per line, PDF text, pretty-printed JSON |
| Pause, check now, edit, duplicate, delete | Yes |
| Import / export | JSON, optionally password protected |

Features from other popular monitors (Visualping, Page Monitor,
changedetection.io), from their public listings and documentation:

| Feature | Seen in | Open Page Watcher |
| --- | --- | --- |
| Only alert when enough changed | Visualping (sensitivity), changedetection.io | "Lines changed is more than" a count or a percentage, as alert rules |
| Watch values in a JSON API | changedetection.io (JSONPath) | `json:` paths: names, `[n]`, `[*]` and `['key']`. No filters or scripts |
| Ignore lines containing text | changedetection.io | Plain text (any case) or `/regex/`, per watch |
| Ignore line order | changedetection.io (sort lines) | Yes |
| Stop after a change | Visualping | "Pause after the first alert" |
| Add many pages at once | Distill, Visualping, changedetection.io | "Add several": a list of addresses with shared labels and schedule |
| Export change history | Distill, Visualping | Download a watch's versions as CSV (cells that a spreadsheet would run as formulas are escaped) |
| Highlighted, visual and text comparisons | All of them | Yes (see above) |

Additions that Distill doesn't have as local features:

- Quiet hours, and combining alerts into one summary notification
- Spotting pages that ask you to sign in, turning on cookies for the watch once
  that gets past the sign-in page, and a choice of what to do (notify, open a
  tab to sign in, pause, or nothing)
- A chart of the first number on the page over time
- Opening the page with what changed highlighted (CSS Custom Highlight API)
- Formatting changes, per watch and off by default ("Also watch formatting").
  The extractor writes the text a second time with plain marks for headings,
  list items, quotes, table cells, bold, italic, strikethrough, code, links
  (with their address), underline, highlight, superscript/subscript, small/big,
  hidden (`hidden`, `display:none`, `visibility:hidden`) and inline-style or
  `<font>` colors, background colors and sizes. Stylesheets, class names and
  computed styles are left out on purpose: sites rename classes and retheme
  constantly, and a downloaded page has no styles applied, so they would mean
  false alerts. Not used with the regex filter, attribute selectors (their
  value is compared as is), PDFs, JSON or feeds. Versions saved before it was
  turned on have no formatting and are never a formatting change
- Organization policy through Chrome managed storage ([enterprise.md](enterprise.md))

## Deliberately left out

These Distill features need data to leave your machine or a vendor account, so
they are not included:

- Cloud monitors, account login and cross-device sync
- Email, SMS, mobile push, Slack, Discord, Teams and webhook alerts
- AI summaries of changes
- Remote configuration, analytics, telemetry and crash reporting

These run on the device but were left out as security trade-offs:

- Macros (scripted clicks and typing before a check), because they act as the
  signed-in user on the page
- Custom JavaScript selectors and conditions, because they would mean running
  user-supplied code with the extension's privileges
- Screenshot (pixel) comparison, as in Visualping: capturing tabs needs access
  to every site (`<all_urls>`). The sandboxed visual view covers the use case
- Proxies, custom request headers and POST requests: headers would mean
  storing tokens next to the watches, and proxies send pages through a third
  party
- Crawling a whole site for new pages: it would need access to more than the
  pages the user picked

## Security model

1. **No servers.** The extension talks only to the pages you choose to watch.
   There is no backend, account, analytics, or update channel other than the
   Chrome Web Store / your own install.
2. **Least privilege.** Install-time permissions are `storage`,
   `unlimitedStorage`, `alarms`, `notifications`, `offscreen`, `activeTab`,
   `scripting`, `contextMenus` and `tts`. There are **no install-time host
   permissions**. Access to a site is requested per origin, when you add a watch
   for it (after checking organization policy), and released when you delete
   the last watch on that origin, cancel the picker, or a save fails. Access no
   watch uses is also cleaned up when the browser starts.
3. **No remote code.** Manifest V3, no `eval`, no CDN scripts, no build step and
   no third-party dependencies (the PDF reader is written from scratch). Every
   file in `src/` is the code that runs.
4. **Strict CSP** on extension pages: `script-src 'self'; object-src 'none';
   base-uri 'none'`.
5. **Fetched pages never execute.** In the default mode pages are downloaded
   with `fetch` and parsed with `DOMParser` in an offscreen document. Parsed
   documents do not run scripts or load subresources. Text is shown with
   `textContent` only.
6. **Snapshots are inert.** The visual view shows a captured snapshot that has
   been stripped of scripts, event handlers, forms, frames, media, styles and
   every attribute except a short safe list, inside an `<iframe sandbox="">`
   (no scripts, no same-origin access) with a CSP that blocks all network loads.
7. **Cookies only where needed, and only to the watched site.** Each watch has
   a "send my cookies" switch for pages behind a sign-in. It starts off, and
   while it is off requests use `credentials: "omit"`. When a check without
   cookies lands on a sign-in page (an HTTP 401, a redirect to a sign-in
   address, or a password or username field where the watched content should
   be), it is tried once more with cookies, and the switch is turned on only if
   that gets past the sign-in page. That is logged, shown on the watch, and can
   be turned off per watch. Cookies only go to the watched page's own site.
   Sign-in pages are never saved as versions; instead the watch does what the
   user chose (notify, open the page in a tab, pause, or nothing), once until a
   check gets through again. Render-in-tab mode always loads the page as the
   signed-in user, so the organization setting that forces cookies off also
   turns render-in-tab and the automatic switch off.
   Downloads ask without following redirects first. A redirect that leads to
   a site the extension has no access to (typically a single sign-on host)
   can't be followed, so it counts as a sign-in page; timer checks then don't
   follow it again until the page stops redirecting, which keeps Chrome from
   logging a blocked request on every check. Checks the user starts still
   follow it. The sign-in banner also offers reading the page in a hidden tab.
   A downloaded page that only works with scripts (a "browser not supported"
   or "enable JavaScript" placeholder, an empty app mount point such as
   `#root`, or selected parts missing from a near-empty page with scripts) is
   never saved as a version. The user is asked once, per watch, whether to read
   it in a hidden tab, try again with cookies, or keep it as downloaded; nothing
   is escalated without that answer. The first version read the new way is a
   new starting point and doesn't alert.
8. **Bounded work.** Requests time out after 30 seconds, pages over 5 MB and
   PDFs over 20 MB are rejected, watched text over 2 million characters is
   refused, snapshots are capped at 300 KB, history and logs are capped per
   watch, and only `http:` / `https:` URLs are accepted. PDF decompression and
   interpretation stop at fixed caps, and JSON that would balloon when
   pretty-printed is kept as sent. A redirect must stay on the same host or a
   site the user has allowed, and on a site the organization allows.
9. **Validated messages.** The service worker accepts UI requests only from its
   own extension pages. From a web page, only the extension's own injected
   scripts can send anything: the picker's selectors and a "something changed"
   ping in live mode. A picker save is accepted only from the document the
   picker was started in, for the address it had then (the page can't swap it
   with `pushState`), and the picker ignores synthetic clicks and key presses,
   so the page can't pick or save for the user. A picker opened from the watch
   editor ("Pick on page") gets its starting selectors and a one-time token in
   the extension's isolated world; its picks only fill in the editor's fields
   and are saved by the editor's own Save. Every field is validated.
10. **Scripts injected into pages are small and passive.** The picker runs only
    when you start it; the live-mode observer only reports that the page
    changed; the highlighter only adds a CSS highlight. When a watch reads a
    page, it can read element text and attributes plus a short list of safe
    properties (such as an image's `currentSrc`), never `document.cookie` or
    storage. Password, hidden and file inputs are always skipped, and in live
    mode (the user's own tab) no form field or editable area is read at all,
    incognito tabs are never read, and a check is dropped if the tab has moved
    to another page.
11. **Local data only.** Watches, history and logs live in
    `chrome.storage.local`. Backups are files you save yourself, and can be
    encrypted with AES-256-GCM using a key derived from your password with
    PBKDF2-SHA-256 (600,000 iterations). Imported encrypted files with
    unreasonable key-derivation settings are refused.
12. **Spoken alerts stay on the device.** Only Chrome's own voices with
    `remote: false` are used (not voices supplied by other extensions), so
    change text is never sent to an online speech service.
13. **Organization policy wins.** Settings from Chrome managed storage (allowed
    and blocked sites, no cookies, no render-in-tab, no live mode, minimum
    interval, maximum watches) are applied when a watch is saved, when it is
    scheduled, and again at every check. Site entries are matched the way the
    browser writes host names (punycode, no trailing dot), and an entry that
    can't be read matches nothing.

## Architecture

- `src/background.js`: service worker. Schedules checks with one `alarms` tick
  per minute, runs due checks, compares, evaluates rules, records history and
  logs, and delivers or holds alerts.
- `src/offscreen.*`: parses fetched HTML and XML with `DOMParser` and plays
  alert sounds.
- `src/lib/extract.js`: self-contained extraction function used both in the
  offscreen document and inside a rendered tab.
- `src/lib/pdf.js`: dependency-free PDF text extraction.
- `src/lib/feeds.js`: RSS, Atom and sitemap reading.
- `src/lib/diff.js`: Myers diff (lines, then words).
- `src/lib/conditions.js`: alert rules.
- `src/lib/jsonpath.js`: the JSON path subset (parsed, never evaluated).
- `src/lib/csv.js`: CSV export of saved versions.
- `src/lib/alerts.js`: change summaries, quiet hours and combined alerts.
- `src/lib/policy.js`: organization policy.
- `src/lib/signin.js`: spotting sign-in pages.
- `src/lib/backup.js`: password-protected backups.
- `src/lib/highlight.js`: highlights changes on an opened page.
- `src/picker.js`: injected on demand via `activeTab` to select elements.
- `src/live.js`: live-mode observer, injected only into tabs showing a watched
  page with live mode on.
- `src/ui/`: popup and inbox pages, including the sandboxed visual view and the
  number chart.
