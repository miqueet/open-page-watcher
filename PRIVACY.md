# Privacy policy

_Last updated: 13 October 2026_

Open Page Watcher is an open-source browser extension that checks web pages you
choose for changes. It is built so that your data never leaves your browser.

## What the extension stores

- The watches you create: page addresses, names, the parts of the page to
  watch, schedules and alert settings.
- The text it extracts from those pages each time it checks them, so it can show
  you what changed. It keeps a limited number of versions per watch, which you
  can set.

All of this is stored only in your browser's local extension storage
(`chrome.storage.local`). It is deleted when you delete a watch or remove the
extension.

## What the extension sends

Nothing is sent to the developer or to any third party. There are no servers,
accounts, analytics, telemetry, advertising or crash reporting.

The only network requests the extension makes are to the pages you asked it to
watch, in the same way your browser would load them. Your cookies are not
included in those requests unless you turn on "Send my cookies for this site"
for a specific watch.

## Permissions

Access to a website is requested only when you add a watch for it, and is
released when you delete the last watch for that site. See the
[README](README.md#permissions) for why each permission is needed.

## Exports

If you use **Export**, the extension creates a file on your computer containing
your watches. Where that file goes is up to you.

## Changes and contact

Changes to this policy are tracked in this repository's history. Questions can
be raised as an issue at https://github.com/miqueet/open-page-watcher/issues.
