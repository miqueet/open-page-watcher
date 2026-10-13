# Open Page Watcher: feature and security spec

This is a clean-room implementation. It was written from Distill Web Monitor's
public store listing, public documentation and observable behaviour. No Distill
code was copied, decompiled or consulted.

## Features (parity with Distill's local monitors)

| Distill feature | Open Page Watcher |
| --- | --- |
| Watch a whole page | Yes, "Watch whole page" in the popup or the right-click menu |
| Visual selector to watch parts of a page | Yes, click-to-select picker (multiple elements), with click-inside to exclude parts |
| CSS / XPath selection, exclusions | Yes, editable per watch, plus attributes (`a @href`) |
| Regex to extract matches | Yes, optional "keep only text matching" regex |
| Check schedule | Every 1 minute to every 7 days, or random within a range, optionally only during set hours and days |
| Pages that need JavaScript to render | "Render in tab" mode opens the page in a hidden window, waits, extracts, closes it; can include frames |
| Live monitoring of an open tab | Yes, opt-in live mode re-reads the tab when its content changes |
| Conditions before alerting | Rule lists with all/any: text, regex, length, empty, never seen, number thresholds and changes by amount or percent, on new / added / removed / previous text |
| Ignore noise | Ignore dates, numbers, letter case or spacing when comparing |
| Inbox / watchlist with unread state | Yes, with filters, search, labels, bulk actions and keyboard shortcuts |
| Highlighted changes and history | Text, side-by-side, visual (sandboxed snapshot) and source views between any two saved versions |
| Pop-up, sound and spoken alerts | Desktop notification with a plain summary of the change, sound, read aloud (on-device voices only), toolbar badge |
| Error alerts and check log | Alert after N failed checks in a row, and a log of the last 50 checks per watch |
| Feeds, PDFs, JSON | RSS/Atom and sitemaps one entry per line, PDF text, pretty-printed JSON |
| Pause, check now, edit, duplicate, delete | Yes |
| Import / export | JSON, optionally password protected |

Additions that Distill doesn't have as local features:

- Quiet hours, and combining alerts into one summary notification
- A chart of the first number on the page over time
- Opening the page with what changed highlighted (CSS Custom Highlight API)
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

## Security model

1. **No servers.** The extension talks only to the pages you choose to watch.
   There is no backend, account, analytics, or update channel other than the
   Chrome Web Store / your own install.
2. **Least privilege.** Install-time permissions are `storage`,
   `unlimitedStorage`, `alarms`, `notifications`, `offscreen`, `activeTab`,
   `scripting`, `contextMenus` and `tts`. There are **no install-time host
   permissions**. Access to a site is requested per origin, when you add a watch
   for it, and released when you delete the last watch on that origin.
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
7. **Cookies off by default.** Each watch has an explicit "send my cookies"
   switch for pages behind a login. When it is off, requests use
   `credentials: "omit"`. Organizations can force it off.
8. **Bounded work.** Requests time out after 30 seconds, pages over 5 MB and
   PDFs over 20 MB are rejected, history and logs are capped per watch, and only
   `http:` / `https:` URLs are accepted. PDF decompression stops at a size cap.
9. **Validated messages.** The service worker accepts UI requests only from its
   own extension pages; web pages can only send the picker's selectors (the URL
   and title come from Chrome, not the message) and a "something changed" ping
   in live mode. Every field is validated.
10. **Scripts injected into pages are small and passive.** The picker runs only
    when you start it; the live-mode observer only reports that the page
    changed; the highlighter only adds a CSS highlight. None of them read
    cookies, storage or form fields.
11. **Local data only.** Watches, history and logs live in
    `chrome.storage.local`. Backups are files you save yourself, and can be
    encrypted with AES-256-GCM using a key derived from your password with
    PBKDF2-SHA-256 (600,000 iterations). Imported encrypted files with
    unreasonable key-derivation settings are refused.
12. **Spoken alerts stay on the device.** Only voices with `remote: false`
    are used, so change text is never sent to an online speech service.
13. **Organization policy wins.** Settings from Chrome managed storage (allowed
    and blocked sites, no cookies, no render-in-tab, no live mode, minimum
    interval, maximum watches) are applied when a watch is saved and again at
    every check.

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
- `src/lib/alerts.js`: change summaries, quiet hours and combined alerts.
- `src/lib/policy.js`: organization policy.
- `src/lib/backup.js`: password-protected backups.
- `src/lib/highlight.js`: highlights changes on an opened page.
- `src/picker.js`: injected on demand via `activeTab` to select elements.
- `src/live.js`: live-mode observer, injected only into tabs showing a watched
  page with live mode on.
- `src/ui/`: popup and inbox pages, including the sandboxed visual view and the
  number chart.
