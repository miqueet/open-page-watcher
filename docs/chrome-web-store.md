# Publishing to the Chrome Web Store

Everything you need to fill in the Chrome Web Store Developer Dashboard.

## 1. Package

Upload `open-page-watcher-vX.Y.Z-chrome-web-store.zip` from the
[latest release](https://github.com/miqueet/open-page-watcher/releases/latest).
It has `manifest.json` at the root of the zip, which the store requires. The
plain `open-page-watcher-vX.Y.Z.zip` puts everything inside a folder, so the
store would reject it.

Every upload needs a higher `version` in `manifest.json` than the last one.
Bump it, merge, then run the **release** workflow from the Actions tab.

## 2. Store listing

**Name:** Open Page Watcher

**Summary** (132 characters max):
Watch web pages for changes. Open source, no servers, no tracking, per-site permissions.

**Category:** Productivity → Tools

**Language:** English

**Description:**

> Get alerted when a web page changes: a price drops, a job is posted, a status
> page updates, a document is revised.
>
> • Watch a whole page, or click to select just the parts you care about
> • Web pages, PDFs, JSON, RSS/Atom feeds and sitemaps
> • CSS and XPath selectors, attributes, and a regular expression to keep only matching text
> • Checks from every minute to every 7 days, at random times, or only during work hours
> • Pages that need JavaScript can be rendered before they're read
> • Alert only when it matters: text appears or disappears, a number rises or falls
>   by an amount or a percentage, and more. Ignore changes in dates or counters.
> • Notifications that say what changed, an optional sound, or the change read aloud
> • Quiet hours, and combined summaries instead of one alert per change
> • Inbox with labels, bulk actions, keyboard shortcuts, a price/number chart and
>   text, side-by-side and visual comparisons
> • Open the page with what changed highlighted
> • Notices when a page asks you to sign in, and lets you choose what happens
> • Password-protected backups
>
> Built for people who can't install trackers on their work browser:
> • No servers, accounts, analytics or telemetry. Your data stays in your browser.
> • Asks for access to a site only when you watch it, and gives it back when you stop.
> • Your cookies only go to the site being watched, and only for pages that need you to sign in.
> • Pages are read without running their scripts unless you choose otherwise.
> • IT teams can restrict sites and options through Chrome policy.
> • 100% open source (MIT): https://github.com/miqueet/open-page-watcher

**Images** (all in [`store/`](../store)):

| Field | File |
| --- | --- |
| Store icon (128×128) | `icons/icon128.png` |
| Screenshots (1280×800) | `store/screenshot-1-inbox.png`, `store/screenshot-2-picker.png`, `store/screenshot-3-options.png`, `store/screenshot-4-alerts.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `store/promo-marquee-1400x560.png` |

**Homepage URL:** https://github.com/miqueet/open-page-watcher
**Support URL:** https://github.com/miqueet/open-page-watcher/issues

## 3. Privacy tab

**Single purpose:**
Monitors web pages the user chooses and alerts them when the content changes.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's watches and the page text history used to show what changed, locally on the device. |
| `unlimitedStorage` | Lets users keep longer histories (and snapshots for the visual comparison) for many watches without hitting the 10 MB local storage limit. Data still stays on the device. |
| `alarms` | Schedules the periodic checks of watched pages. |
| `notifications` | Shows a desktop notification when a watched page changes. |
| `offscreen` | Parses downloaded pages with DOMParser without running their scripts, and plays the optional alert sound. |
| `activeTab` | Injects the element picker into the current tab only when the user starts it from the popup, the right-click menu or the keyboard shortcut. |
| `scripting` | Runs the element picker in the current tab, reads the text of a page rendered in a background window for watches set to "render in tab", and highlights what changed when the user opens a watched page from the extension. |
| `contextMenus` | Adds "Watch this page" and "Watch part of this page" to the right-click menu. |
| `tts` | Reads a change aloud when the user turns that on for a watch. Only voices installed on the device are used. |
| Host permissions (optional, `http://*/*`, `https://*/*`) | Requested at runtime for one site at a time, only when the user adds a watch for that site, so the extension can download that page. Released when the last watch on the site is deleted. |

**Are you using remote code?** No. All code is in the package; there is no
`eval`, no remote scripts and no external libraries.

**Data usage:** Leave every data type unchecked. Nothing is transmitted to the
developer or any third party. Website content is processed only on the device
(see the privacy policy). Then tick the three certifications (no selling data,
no unrelated use, no creditworthiness use).

**Privacy policy URL:**
https://github.com/miqueet/open-page-watcher/blob/main/PRIVACY.md

## 4. Distribution

Public, or **Unlisted** if you only want people with the link to install it.
Organizations on Google Workspace can also publish it **Private** to their
domain, or IT can force-install it by ID through Chrome Enterprise policy.

## Notes

- A developer account costs a one-time US$5 registration fee.
- Because the extension can request access to any site (optionally, per site),
  Google may run an in-depth review, which can take longer than usual.
- Regenerate screenshots with
  `PLAYWRIGHT=$(npm root -g)/playwright node scripts/store-assets.mjs` and the
  promo tiles with `python3 scripts/promo-tiles.py`.
