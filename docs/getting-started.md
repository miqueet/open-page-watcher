# Getting started

This page walks through installing Open Page Watcher, adding your first watch,
and finding your way around. For how the pieces work underneath, see
[How it works](how-it-works.md).

## Install

1. Download the latest `open-page-watcher-vX.Y.Z.zip` from
   [Releases](https://github.com/miqueet/open-page-watcher/releases/latest) and
   unzip it.
2. Optional: check the download with the `.sha256` file from the same release.
   On macOS or Linux run `shasum -a 256 open-page-watcher-vX.Y.Z.zip`; on
   Windows run `certutil -hashfile open-page-watcher-vX.Y.Z.zip SHA256`. The
   result must match the file's contents.
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder, the one that contains
   `manifest.json`.
5. Pin the extension: click the puzzle-piece icon in Chrome's toolbar and the
   pin next to Open Page Watcher.

On a managed work computer, unpacked extensions may be blocked. Your IT team can
review this repository and publish it internally; point them at
[For IT teams](enterprise.md).

## Your first watch: a whole page

1. Go to the page you want to watch, for example a product page.
2. Click the Open Page Watcher icon in the toolbar.
3. Click **Watch whole page**.
4. Chrome asks whether the extension may read this site. Click **Allow**. This
   is asked once per site, and the access is given back when you delete the
   last watch on that site.

That's it. The page is checked every hour by default. The first check saves a
starting version; from then on, every check compares the page with the last
saved version and, if it changed, you get a notification and the watch shows
as unread in the inbox.

**Use case:** you're waiting for a conference's speaker list to be published,
and you don't know which part of the page will change. Watch the whole page.

## Your first watch: just part of a page

Watching a whole page alerts you about every banner, date and "people also
bought" box. Usually you want one part.

1. Go to the page and click the toolbar icon.
2. Click **Select parts of page**. A bar appears at the top of the page.
3. Move the mouse: the element under it is outlined. Click to select it. Click
   more elements to add them. Click a selected element again to remove it.
4. To leave part of a selection out (an ad inside the box you picked, a "last
   updated" line), click on that part *inside* the selection. It's shown as
   left out. Click it again to put it back.
5. Press **Enter** or click **Save**. **Esc** cancels.

Behind the scenes the picker writes [CSS selectors](selectors.md) for what you
clicked, so you can fine-tune them later in the editor.

You can also press **Alt+Shift+W** on any page to start the picker, or
right-click a page and choose **Watch part of this page…**. Right-clicking a
link offers **Watch the linked page for changes**.

**Use case:** watch only the price box on a product page, leaving out the
"12 people are looking at this" counter inside it.

## The popup

Clicking the toolbar icon shows:

- The current page's title and address, and whether you already watch it.
- **Watch whole page** and **Select parts of page**.
- **Recent changes**: unread changes, newest first. Click one to open it.
- **Open inbox**: the full app.

## The inbox

The inbox is where everything else happens. It has:

- **The watch list** on the left, with unread watches in bold, a short summary
  of the latest change ("Went down from $1,299 to $1,199"), and any error.
- **Filters and search**: all, unread, errors, paused, and your labels. Search
  matches names, addresses and labels.
- **Bulk actions**: tick several watches to check, pause, resume, mark read,
  add or remove a label, or delete them together.
- **Add watch** and **Add several** buttons. See [Adding several pages at
  once](#adding-several-pages-at-once).
- **Settings**: alert summaries, quiet hours, failure alerts, backups and the
  About section.

Clicking a watch shows its history and comparison views. See
[Reviewing changes](reviewing-changes.md).

## The watch editor

Click **Edit** on a watch (or press `e`) to change anything about it. The
editor has four sections, each with its own guide:

| Section | What it controls | Guide |
| --- | --- | --- |
| What to watch | Selectors, leave-out selectors, regex filter, ignore options, formatting | [Selectors](selectors.md), [Regex](regex.md), [Ignoring noise](ignoring-noise.md), [Formatting](formatting.md) |
| When to check | Interval, random interval, hours and days, live mode | [How it works](how-it-works.md#1-when-a-check-happens) |
| How to load the page | Download vs. hidden tab, cookies, sign-in handling | [Loading pages](loading-pages.md) |
| Alerts | Rules, notification, sound, spoken alert, pause after alert, versions kept | [Alerts](alerts.md) |

Nothing changes until you click **Save**. If something you typed isn't valid (a
broken regex, a bad JSON path), the editor says what's wrong and doesn't save.

**Reselect on page** in the editor opens the page with your current selection
already highlighted, so you can add or remove parts by clicking. Press Enter
and you're taken back to the editor with the fields filled in.

## Adding several pages at once

**Add several** takes a list of addresses, one per line, and creates a watch for
each with the same labels, schedule and notification setting.

```
https://vendor-a.example/pricing
https://vendor-b.example/pricing
https://vendor-c.example/plans
```

**Use case:** you track pricing pages of five competitors. Paste all five, give
them the label `competitors`, and check them daily. Afterwards, edit each one to
pick just the pricing table.

## Labels

Labels group watches. Type them comma-separated in the editor
(`work, prices`). The inbox shows a chip per label; click it to show only those
watches.

## Where your data lives

Everything (watches, saved versions, logs and settings) is in Chrome's local
extension storage on your computer. Nothing is sent anywhere except the
requests to the pages you watch. Removing the extension deletes all of it, so
make a [backup](reviewing-changes.md#backups-import-and-export) first if you
want to keep it.

## Next steps

- Copy a recipe from [Examples and use cases](examples.md).
- Learn the [selector](selectors.md) and [regex](regex.md) syntax.
- Set an alert rule like "only tell me when the price is below $1,200" in
  [Alerts](alerts.md#number-rules).
