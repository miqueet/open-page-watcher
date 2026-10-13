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

- Watch a whole page, or click to select just the parts you care about
- CSS and XPath selectors, plus an optional regex to keep only matching text
- Checks from every minute up to every 7 days
- Pages that need JavaScript can be rendered in a hidden window before reading
- Alert conditions: any change, text appears or disappears, added text contains,
  regex match, number above / below / increased / decreased
- Inbox with unread changes, filters, search and a line + word diff between any
  two saved versions
- Desktop notifications, an optional sound and an unread count on the toolbar icon
- Import and export of your watches as JSON

See [docs/SPEC.md](docs/SPEC.md) for how this maps to Distill's features, what is
deliberately left out, and the full security model.

## Install

1. Download the latest `open-page-watcher-vX.Y.Z.zip` from
   [Releases](https://github.com/miqueet/open-page-watcher/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder (the one that contains `manifest.json`).

Each release also has a `.sha256` file so you can check the zip wasn't altered.

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
| `storage` | Save your watches and their history locally |
| `alarms` | Run checks on a schedule |
| `notifications` | Show change alerts |
| `offscreen` | Parse pages without running their scripts, and play the alert sound |
| `activeTab`, `scripting` | Inject the element picker into the tab you're on when you click it, and read rendered pages |
| Site access (optional, per site) | Requested only for sites you watch |

## Development

```sh
npm test                    # unit tests, no dependencies needed
PLAYWRIGHT=$(npm root -g)/playwright node test/e2e.mjs   # browser tests (needs Playwright + Chromium)
```

## License

[MIT](LICENSE)
