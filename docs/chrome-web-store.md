# Publishing to the Chrome Web Store

A step-by-step guide to publishing Open Page Watcher, with everything to paste
into the Chrome Web Store Developer Dashboard: listing text, images, privacy
answers, permission justifications and notes for the reviewer.

Official references:
[Register](https://developer.chrome.com/docs/webstore/register) ·
[Publish](https://developer.chrome.com/docs/webstore/publish) ·
[Images](https://developer.chrome.com/docs/webstore/images) ·
[User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) ·
[Review process](https://developer.chrome.com/docs/webstore/review-process) ·
[Trader declaration](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)

## Checklist

1. [Set up the developer account](#1-developer-account) (once).
2. [Build the package](#2-package): bump the version, merge, run the
   **release** workflow, download the `-chrome-web-store.zip`.
3. In the dashboard, **Add new item** and upload the zip.
4. Fill in the [Store listing](#3-store-listing) tab.
5. Fill in the [Privacy](#4-privacy) tab.
6. Fill in the [Distribution](#5-distribution) tab.
7. Fill in the [Test instructions](#6-test-instructions) tab.
8. **Submit for review**. [What to expect](#7-review).
9. After it's published, [add the store link](#8-after-publishing) to the README.

## 1. Developer account

Done once, at the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole).

- Sign in with the Google account that should own the extension. The account's
  email can't be changed later, so use one you'll keep (a personal account is
  safer than a work one if you might change jobs).
- Turn on **2-Step Verification** for that Google account; the dashboard asks
  for it before you can publish.
- Accept the developer agreement and pay the one-time **US$5** registration fee.
- **Account** tab:
  - **Publisher name**: what users see as the developer (for example `miqueet`
    or your name).
  - **Contact email**: add and verify it. Items can't be published until it's
    verified.
  - **Trader / non-trader declaration**: everyone must choose. This extension
    is free, has no paid features and is a personal open-source project, so
    **Non-trader** is the usual choice. The listing then tells EU users that
    consumer-protection rights for traders don't apply. Choosing **Trader**
    instead publishes a legal name, address and phone number on the listing and
    needs verification. Google can't decide this for you; pick what's true.
  - Optional: turn on email notifications for review results.

New accounts can have at most two published extensions.

## 2. Package

Upload `open-page-watcher-vX.Y.Z-chrome-web-store.zip` from the
[latest release](https://github.com/miqueet/open-page-watcher/releases/latest).
It has `manifest.json` at the root of the zip, as the store requires. Don't
upload the plain `open-page-watcher-vX.Y.Z.zip`: it puts everything inside a
folder, so the store rejects it.

To make a release:

1. Bump `version` in `manifest.json` (every upload needs a higher version than
   the last one) and merge to `main`.
2. **Actions → release → Run workflow** on `main`. It runs the tests, checks
   that every file the manifest names is in the package, builds both zips and a
   `.sha256`, and publishes a GitHub release tagged `vX.Y.Z`.

The package has no build step, no minified or obfuscated code and no
third-party code, which keeps the review straightforward.

## 3. Store listing

**Name:** Open Page Watcher (from the manifest)

**Summary** (from the manifest, 132 characters max):
Watch web pages for changes. Open source, no servers, no tracking, per-site permissions.

**Category:** Tools (under Productivity / Workflow & Planning in the newer
category list, if Tools isn't offered)

**Language:** English (United States)

**Description** (paste as plain text):

```
Get alerted when a web page changes: a price drops, a job is posted, a status page updates, a document is revised, an item comes back in stock.

WATCH ANYTHING
• A whole page, or click to select just the parts you care about
• Web pages, PDFs, JSON, RSS/Atom feeds and sitemaps
• CSS and XPath selectors, attributes, JSON paths, and a regular expression to keep only matching text
• Add many pages at once
• Checks from every minute to every 7 days, at random times, or only during work hours
• Pages that need JavaScript can be opened in a hidden window before they're read

ALERT ONLY WHEN IT MATTERS
• Text appears or disappears, or the change is bigger than a size you choose
• A number rises or falls by an amount or a percentage, or crosses a limit ("dropped below $1,000")
• Ignore dates, counters, line order and lines you don't care about
• Optionally count formatting and HTML changes, like a button becoming disabled or a "sold out" class, even when the words stay the same
• Optionally compare screenshots of the watched part
• Pause a watch after its first alert, for one-off events like a restock

ALERTS
• Notifications that say what changed ("Went down from $1,299 to $1,199")
• Six alert sounds with a preview, or the change read aloud with your computer's own voices
• Quiet hours, and combined summaries instead of one alert per change

REVIEW CHANGES
• Inbox with unread changes, labels, filters, search, bulk actions and keyboard shortcuts
• Text, side-by-side, formatting, HTML, screenshot, visual and source comparisons
• A chart of the number on the page over time, and CSV export
• Open the page with what changed highlighted
• Notices when a page asks you to sign in, and lets you choose what happens
• Password-protected backups

PRIVATE AND SECURE BY DESIGN
Built for people who can't install trackers on their work browser:
• No servers, accounts, analytics or telemetry. Your data stays in your browser.
• Asks for access to a site only when you watch it, and gives it back when you stop.
• Your cookies only go to the site being watched, and only for pages that need you to sign in.
• Pages are read without running their scripts unless you choose otherwise.
• IT teams can restrict sites and options through Chrome policy.
• No remote code, no third-party libraries, no build step: the code in the store is the code on GitHub.
• 100% open source (MIT): https://github.com/miqueet/open-page-watcher
```

**Images** (all in [`store/`](../store), made by `scripts/store-assets.mjs`
and `scripts/promo-tiles.py`):

| Field | File |
| --- | --- |
| Store icon (128×128, from the package) | `icons/icon128.png` (96×96 artwork with 16 px transparent padding, as Google recommends) |
| Screenshots (1280×800, up to 5) | `store/screenshot-1-inbox.png`, `store/screenshot-2-picker.png`, `store/screenshot-3-options.png`, `store/screenshot-4-alerts.png`, `store/screenshot-5-html.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `store/promo-marquee-1400x560.png` |

Upload the screenshots in that order: the inbox with a price chart, picking a
part of a page, the watch options, alert settings, and an HTML-only change.

**Additional fields:**

- **Official URL:** leave as none (it needs a verified domain).
- **Homepage URL:** https://github.com/miqueet/open-page-watcher
- **Support URL:** https://github.com/miqueet/open-page-watcher/issues
- **Mature content:** No.

## 4. Privacy

### Single purpose

```
Monitors web pages the user chooses and alerts them when the content changes.
```

### Permission justifications

The dashboard shows one box per permission. Paste the matching text.

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's watches, settings and the history of each watched page's text, used to show what changed. Stored only on the device in chrome.storage.local. Also reads the optional IT policy from managed storage. |
| `unlimitedStorage` | Lets users keep longer histories (and the snapshots used for the visual, HTML and screenshot comparisons) for many watches without hitting the 10 MB local storage limit. Data still stays on the device. |
| `alarms` | Schedules the periodic checks of watched pages. |
| `notifications` | Shows a desktop notification when a watched page changes, or when a watch keeps failing. |
| `offscreen` | Parses downloaded pages with DOMParser in an offscreen document without running their scripts, and plays the optional alert sound. |
| `activeTab` | Injects the element picker into the current tab only when the user starts it from the popup, the right-click menu or the keyboard shortcut. |
| `scripting` | Runs the element picker in the current tab, reads the watched parts of a page the extension opened in a hidden window for watches set to "open in a hidden window", and highlights what changed when the user opens a watched page from the extension. |
| `contextMenus` | Adds "Watch this page for changes" and "Watch part of this page…" to the right-click menu. |
| `tts` | Reads a change aloud when the user turns that on for a watch. Only voices installed on the device are used, so the text is never sent to a speech service. |

**Host permission justification** (one box for all host permissions):

```
All host permissions are optional (optional_host_permissions); none are granted at install.

http://*/* and https://*/*: requested at runtime for one site at a time, only when the user adds a watch for that site, so the extension can download that page and check it for changes. The permission for a site is released when the last watch on that site is deleted. IT administrators can block or allow sites through Chrome policy (managed storage), and the extension checks that policy before asking.

<all_urls>: requested at runtime only when the user turns on "Also compare screenshots" for a watch, because chrome.tabs.captureVisibleTab only works with access to all sites (a grant for the single site is not enough). It is used only to capture the hidden window the extension opened for that watch's page. It is released as soon as no watch uses screenshots, and is never used to read or load any other site. IT administrators can turn the feature off with the disableScreenshots policy.
```

### Remote code

**No, I am not using remote code.** All JavaScript is in the package. There is
no `eval`, no `new Function`, no remote scripts, no external libraries or
WebAssembly, and the extension pages' content security policy is
`script-src 'self'; object-src 'none'; base-uri 'none'`.

### Data usage

Google requires disclosure even when data is only processed and stored on the
device ([User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
question 3). Answer:

| Data type | Tick? | Why |
| --- | --- | --- |
| Personally identifiable information | No | |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | No | Cookies are sent by Chrome only to the watched site, only if the user turns that on; the extension never reads them. Password and form fields are never read. |
| Personal communications | No | |
| Location | No | |
| Web history | No | Only the addresses the user chose to watch are stored, not browsing history. |
| User activity | No | The picker only records the element the user clicked to select it. |
| **Website content** | **Yes** | The text (and, if turned on, the markup and screenshots) of the pages the user chooses to watch is stored on the device to detect and show changes. |

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

```
https://github.com/miqueet/open-page-watcher/blob/main/PRIVACY.md
```

## 5. Distribution

- **Payments:** Free.
- **Visibility:**
  - **Public**: anyone can find and install it.
  - **Unlisted**: only people with the link can install it. Good if you mainly
    want it for yourself and your team.
  - **Private**: only for a Google Workspace domain or trusted testers.
- **Regions:** All regions.

IT teams can force-install it by its store ID through Chrome Enterprise policy,
and restrict it with the policies in [enterprise.md](enterprise.md).

## 6. Test instructions

Nothing needs an account. Paste this into the **Test instructions** tab so
the reviewer can try every permission:

```
No login or account is needed. All features work offline except loading the pages being watched.

1. Open any web page (for example https://example.com), click the toolbar icon and choose "Watch whole page". Chrome asks for access to that one site; allow it. The watch appears in the inbox ("Open inbox" in the popup, or the Options page).
2. To select part of a page: click the toolbar icon and choose "Select parts of page" (or press Alt+Shift+W, or right-click > "Watch part of this page…"), click an element, then Save.
3. In the inbox, click "Check now" to check immediately. Edit a watch to change the schedule, alert rules, sound or spoken alerts.
4. Screenshot comparison (the only feature that asks for access to all sites): edit a watch, tick "Also compare screenshots" (this switches "How to load the page" to the hidden window) and save. Chrome asks for access to all sites; this is released as soon as no watch uses screenshots.
5. Settings > About shows the version, licence and links to report a bug or request a feature on GitHub.

Source code: https://github.com/miqueet/open-page-watcher (the package is the repository's manifest.json, src/, icons/ and managed_schema.json, unminified).
```

## 7. Review

- Click **Submit for review**. To choose the launch moment yourself, untick
  **Publish automatically after review**; you then have 30 days to publish.
- Most reviews finish within a few days but can take a few weeks. New
  developers, new extensions and broad host permissions (even optional ones,
  like `<all_urls>` here) can make it slower. If it's pending for more than
  three weeks, contact developer support.
- If it's rejected, the email names the policy. The usual causes are a
  permission justification that doesn't match what the code does, or a
  description that lists a feature the code doesn't have; fix, bump the
  version and resubmit.
- Updates go through the same review: bump the version, run the release
  workflow, then **Package → Upload new package** and submit.

## 8. After publishing

- Add the store link to the top of the README and to docs/getting-started.md.
- The store ID is on the item's page in the dashboard. IT teams need it for
  policy (see [enterprise.md](enterprise.md)).

## Regenerating the images

```
PLAYWRIGHT=$(npm root -g)/playwright node scripts/store-assets.mjs   # screenshots
python3 scripts/promo-tiles.py                                       # promo tiles (needs Pillow)
```

The screenshots use a local demo server, so no real site is contacted.
