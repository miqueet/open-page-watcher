# Open Page Watcher: feature and security spec

This is a clean-room implementation. It was written from Distill Web Monitor's
public store listing, public documentation and observable behaviour. No Distill
code was copied, decompiled or consulted.

## Features (parity with Distill's local monitors)

| Distill feature | Open Page Watcher |
| --- | --- |
| Watch a whole page | Yes, "Watch whole page" in the popup |
| Visual selector to watch parts of a page | Yes, click-to-select picker that produces CSS selectors (multiple elements allowed) |
| CSS / XPath selection | Yes, editable per watch |
| Regex to extract matches | Yes, optional "keep only text matching" regex |
| Check schedule | Every 1 minute up to every 7 days, per watch |
| Pages that need JavaScript to render | "Render in tab" mode opens the page in a background tab, extracts, closes it |
| Conditions before alerting | Any change, contains / doesn't contain text, regex match, added text contains, number above / below / increased / decreased |
| Inbox / watchlist with unread state | Yes, with filters (all, unread, errors, paused) and search |
| Highlighted changes and history | Yes, line + word diff between any two stored versions |
| Pop-up and sound alerts | Yes, desktop notification, sound, toolbar badge count |
| Pause, check now, edit, delete | Yes |
| Import / export | Yes, JSON |

## Deliberately left out

These Distill features need data to leave your machine or a vendor account, so
they are not included:

- Cloud monitors, account login and cross-device sync
- Email, SMS, mobile push, Slack, Discord, Teams and webhook alerts
- Remote configuration, analytics, telemetry and crash reporting

## Security model

1. **No servers.** The extension talks only to the pages you choose to watch.
   There is no backend, account, analytics, or update channel other than the
   Chrome Web Store / your own install.
2. **Least privilege.** Install-time permissions are `storage`, `alarms`,
   `notifications`, `offscreen`, `activeTab` and `scripting`. There are **no
   install-time host permissions**. Access to a site is requested per origin,
   at the moment you add a watch for it, and released when you delete the last
   watch on that origin.
3. **No remote code.** Manifest V3, no `eval`, no CDN scripts, no build step and
   no third-party dependencies. Every file in `src/` is the code that runs.
4. **Strict CSP** on extension pages: `script-src 'self'; object-src 'none';
   base-uri 'none'`.
5. **Fetched pages never execute.** In the default mode pages are downloaded
   with `fetch` and parsed with `DOMParser` in an offscreen document. Parsed
   documents do not run scripts or load subresources. Extracted text is shown
   using `textContent` only; fetched HTML is never inserted into extension pages.
6. **Cookies off by default.** Each watch has an explicit "send my cookies"
   switch for pages behind a login. When it is off, requests use
   `credentials: "omit"`.
7. **Bounded work.** Requests time out after 30 seconds, responses over 5 MB are
   rejected, history is capped per watch, and only `http:` / `https:` URLs are
   accepted.
8. **Validated messages.** The service worker only accepts messages from its own
   extension pages and from the picker it injected, and validates every field.
9. **Local data only.** Watches and history live in `chrome.storage.local`.
   Export is a file you save yourself.

## Architecture

- `src/background.js`: service worker. Schedules checks with one `alarms` tick
  per minute, runs due checks, compares, evaluates conditions, alerts.
- `src/offscreen.*`: parses fetched HTML with `DOMParser` and plays alert sounds.
- `src/lib/extract.js`: self-contained extraction function used both in the
  offscreen document and inside a rendered tab.
- `src/lib/diff.js`: Myers diff (lines, then words).
- `src/lib/conditions.js`: alert conditions.
- `src/picker.js`: injected on demand via `activeTab` to select elements.
- `src/ui/`: popup and inbox pages.
