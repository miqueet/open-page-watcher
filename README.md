# Open Page Watcher

An open-source, security-conscious Chrome extension that watches web pages for
changes and alerts you, similar to Distill Web Monitor.

## Why

Popular page-monitoring extensions ask for access to every site, sync your data
to vendor servers and ship code you can't easily audit, which makes them hard to
approve for use at work. Open Page Watcher gives you the same core features with:

- No servers, accounts, analytics or telemetry. Everything stays in your browser.
- Access to a site only when you add a watch for it, released when you remove it.
- No remote code, no build step and no third-party dependencies, so the code in
  this repository is exactly what runs.

This is a clean-room implementation written from scratch. It contains no code
from Distill or any other proprietary extension.

## Features

**Choosing what to watch**
- Watch a whole page, or click to select just the parts you care about, and
  click inside a selection to leave parts out (ads, timestamps)
- CSS and XPath selectors, attributes such as `@href`, and an optional regex to
  keep only matching text
- Quick fills for all links, the page title, headings or the description
- Web pages, JSON, plain text, PDF files, RSS/Atom feeds and XML sitemaps
- Pages that need JavaScript can be rendered in a hidden window, including
  content inside frames
- Right-click any page or link to watch it, or press Alt+Shift+W to pick parts

**When to check**
- Every minute up to every 7 days, or at a random time within a range
- Only during certain hours and days
- Instantly while the page is open in a tab (live mode)

**When to alert**
- Rules combined with all/any: text contains, starts or ends with, is empty,
  matches a regex, length, never seen before, number above or below, and number
  up or down by an amount or a percentage, checked on the new, added, removed or
  previous text
- Ignore changes that are only dates, numbers, letter case or spacing
- Notifications that say what changed ("Went down from $1,299 to $1,199"),
  an optional sound, or the change read aloud
- Quiet hours, and an option to combine alerts into one summary
- An alert when a watch keeps failing

**Reviewing changes**
- Inbox with unread changes, labels, filters, search, bulk actions and keyboard
  shortcuts
- Text, side-by-side, visual and source views of any two saved versions
- A chart of the number on the page over time
- Open the page with what changed highlighted
- A log of recent checks for each watch

**Keeping control**
- Password-protected backups (AES-256-GCM), plus plain JSON import and export
- IT teams can limit sites, intervals and options through Chrome policy (see
  [docs/enterprise.md](docs/enterprise.md))

See [docs/SPEC.md](docs/SPEC.md) for how this maps to Distill's features, what is
deliberately left out, and the full security model.

## Install

1. Download the latest `open-page-watcher-vX.Y.Z.zip` from
   [Releases](https://github.com/miqueet/open-page-watcher/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder (the one that contains `manifest.json`).

Each release also has a `.sha256` file so you can check the zip wasn't altered,
and a `-chrome-web-store.zip` ready to upload to the Chrome Web Store (see
[docs/chrome-web-store.md](docs/chrome-web-store.md)).

Managed work machines sometimes block unpacked extensions. In that case your IT
team can review this repository and publish it internally or allow-list it.

## Use

- On any page, click the toolbar icon and choose **Watch whole page** or
  **Select parts of page**. With the picker, click the elements you want (click
  again to deselect), then **Save**.
- Chrome asks once per site for permission to read it. Watches on a site you
  haven't allowed show an **Allow** button in the inbox.
- Open the inbox from the popup to see changes, edit how often a page is
  checked, set alert conditions, or turn on cookies for pages behind a login.

## Permissions

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Save your watches and their history locally, without the 10 MB cap |
| `alarms` | Run checks on a schedule |
| `notifications` | Show change alerts |
| `offscreen` | Parse pages without running their scripts, and play the alert sound |
| `activeTab`, `scripting` | Inject the element picker into the tab you're on when you ask for it, read rendered pages, and highlight changes on a page you open from the inbox |
| `contextMenus` | The "Watch this page" right-click items |
| `tts` | Read changes aloud, if you turn that on for a watch (on-device voices only) |
| Site access (optional, per site) | Requested only for sites you watch, and released when you stop |

## Development

```sh
npm test                    # unit tests, no dependencies needed
PLAYWRIGHT=$(npm root -g)/playwright node test/e2e.mjs   # browser tests (needs Playwright + Chromium)
```

## Privacy

Nothing leaves your browser. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE)
