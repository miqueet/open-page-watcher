# Privacy policy

_Last updated: 13 October 2026_

Open Page Watcher is an open-source browser extension that checks web pages you
choose for changes. It is built so that your data never leaves your browser.

## What the extension stores

- The watches you create: page addresses, names, the parts of the page to
  watch, schedules and alert settings.
- The text it extracts from those pages each time it checks them, so it can show
  you what changed. It keeps a limited number of versions per watch, which you
  can set, and a cleaned-up copy of the page's markup for the five most recent
  versions (for the visual comparison).
- A short log of recent checks (time, result, how long it took).
- Your settings, such as quiet hours.

Text you type into forms on a watched page is never read, and password fields
are always skipped.

All of this is stored only in your browser's local extension storage
(`chrome.storage.local`). It is deleted when you delete a watch or remove the
extension.

## What the extension sends

Nothing is sent to the developer or to any third party. There are no servers,
accounts, analytics, telemetry, advertising or crash reporting.

The only network requests the extension makes are to the pages you asked it to
watch, in the same way your browser would load them. Your cookies are not
included in those requests unless "Send my cookies for this site" is on for that
watch. It is off when you add a watch. If a check finds that the page needs you
to be signed in, the extension tries once more with your cookies for that site,
and turns the setting on for that watch only if that gets past the sign-in page.
You can turn this off for any watch. Cookies are only ever sent to the watched
site itself.

## Permissions

Access to a website is requested only when you add a watch for it, and is
released when you delete the last watch for that site. See the
[README](README.md#permissions) for why each permission is needed.

## Alerts

Notifications are shown by your operating system. If you turn on "Read the
change aloud", only voices installed on your computer are used; Chrome's online
voices are never used, so the text isn't sent to a speech service.

## Exports

If you use **Export**, the extension creates a file on your computer containing
your watches and settings. You can protect it with a password, in which case it
is encrypted on your computer before it is saved. Where that file goes is up to
you.

## Changes and contact

Changes to this policy are tracked in this repository's history. Questions can
be raised as an issue at https://github.com/miqueet/open-page-watcher/issues.
