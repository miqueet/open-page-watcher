# Reviewing changes

Once a watch has saved a few versions, the inbox shows what changed and lets you
compare any two of them. This page covers the watch page, the comparison views,
the number chart, highlighting changes on the live page, exporting and backups.

## The watch page

Click a watch in the inbox to open it. From top to bottom:

- **Name, labels and address.** Click the address to open the page.
- **A summary line:** when it was last checked and last changed, how often it's
  checked, how the page is loaded (downloaded or in a tab, with cookies or not,
  live), and whether it watches the whole page or some parts.
- **Latest change:** the plain-words summary, such as "Went down from $1,299 to
  $1,199 (−7.7%)".
- **Banners** for problems that need you: a sign-in is needed, the page needs
  its scripts, or the last error.
- **Buttons:**

| Button | Does |
| --- | --- |
| Check now | Checks right away (keyboard: `c`) |
| Open page | Opens the page in a tab with the latest change highlighted |
| Edit | Opens the watch editor (keyboard: `e`) |
| Duplicate | Copies the watch and opens the copy in the editor, e.g. to watch a similar page |
| Pause / Resume | Stops or restarts checks |
| Mark unread | Puts it back in the unread list (keyboard: `u` toggles) |
| Download CSV | Saves every kept version as a spreadsheet file |
| Delete | Deletes the watch and its history (and gives back site access if no other watch uses it) |

- **The number chart**, when the watched text is about a number.
- **The history** with the comparison views.
- **The check log.**

## Comparing versions

Pick an **older** and a **newer** version from the two lists (by default the
last two), then a view:

| View | Shows | Best for |
| --- | --- | --- |
| Text | One column; removed text struck through in red, added text in green, word by word inside changed lines | Most changes |
| Side by side | Old on the left, new on the right, changed lines lined up | Long pages, many changes |
| Formatting | The text with formatting marks (`**bold**`, `# heading`, `[link](address)`…) | Watches with [formatting](formatting.md) on |
| HTML | One line per element, with changed attributes highlighted | Watches with [Also watch the HTML](html-and-visual-changes.md#also-watch-the-html) on |
| Screenshot | The older and newer pictures side by side, changed areas outlined in red | Watches with [Also compare screenshots](html-and-visual-changes.md#also-compare-screenshots) on |
| Visual | A safe snapshot of the selected part of the page as it looked, with changes highlighted | Tables, layouts, seeing context |
| Source | The saved HTML, line by line | Checking what the markup was |

Options:

- **Only show changed lines** (on by default) hides unchanged lines, keeping two
  lines of context around each change. Untick it to see the whole text.
- **Show deleted text** shows or hides removed text.
- **↑ Previous** / **↓ Next** jump between changes.

The visual view shows a cleaned-up copy of the page: scripts, forms, frames,
media, styles and event handlers are removed, it's displayed in a sandbox that
can't run code or load anything from the internet. That's why it looks plainer
than the real page.

**Example:** a watch on a pricing table alerted with "Now: $49 · Was: $39". The
Text view shows that the "Team" row's price changed. Picking an older version
from the first list shows the price was $49 a month ago too, so it's a
reversal of a temporary discount.

## The number chart

When the watch is about a number (a price, a count, a rate) the watch page shows
a chart of the first number in each kept version over time. It appears when at
least two versions contain a number and the watched text is short (up to 300
characters, like a price or a count), or when the watch has a number
[alert rule](alerts.md#number-rules). Hover over the chart, or focus it and use
the left and right arrow keys, to read each point. It's hidden for watches that ignore numbers.

**Use case:** see whether a price has been trending down for weeks before
deciding to buy, or spot that a queue length jumps every Monday.

## Open the page with changes highlighted

**Open page** opens the watched page in a new tab and highlights the text that
the latest change added, using Chrome's built-in highlighting. Nothing on the
page is modified, and the highlight goes away when you reload.

## The check log

The bottom of the watch page lists the last 50 checks: when, how long it took,
whether the page changed, whether it alerted, whether it was a scheduled, manual
or live check, and notes such as:

- "Only the formatting changed"
- "Turned on 'Send my cookies' because the page asked you to sign in"
- "Paused after this alert"
- "New starting point after changing how the page is loaded"
- The error, for failed checks

If you expected an alert and didn't get one, the log tells you whether the page
changed at all (if not, check your [ignore options](ignoring-noise.md)) or
changed but didn't alert (check your [rules](alerts.md)).

## Download CSV

**Download CSV** saves every kept version to a `.csv` file with three columns:
when it was saved, the first number in it, and the full text. Open it in Excel,
Google Sheets or LibreOffice to chart prices, filter, or keep a record. Cells
that a spreadsheet would treat as formulas are escaped so opening the file is
safe.

**Use case:** keep a record of a vendor's published prices for a contract
negotiation, or of a policy page's wording for compliance.

Only the versions still kept are exported. Raise **Versions to keep** (up to
200) if you want a longer record.

## Inbox tools

- **Unread** watches are bold and counted on the toolbar badge.
- **Filters:** All, Unread, Errors, Paused, and a chip per label.
- **Search** by name, address or label (keyboard: `/`).
- **Bulk actions:** tick watches (or tick "select all"), then choose Check now,
  Mark read, Mark unread, Pause, Resume, Add label…, Remove label… or Delete.

### Keyboard shortcuts

| Key | Does |
| --- | --- |
| `j` / `k` | Next / previous watch |
| `e` | Edit the selected watch |
| `c` | Check it now |
| `u` | Mark read or unread |
| `n` | Add a watch |
| `/` | Search |
| `Alt+Shift+W` | Pick parts of the current page to watch (in any tab) |

Change `Alt+Shift+W` at `chrome://extensions/shortcuts`.

## Backups, import and export

Use the **Export** and **Import** buttons at the top of the inbox:

- **Export** saves all your watches and settings to a file. Tick **Protect the
  file with a password** to encrypt it (AES-256-GCM, with a key made from your
  password using PBKDF2 with 600,000 rounds). Without the password the file
  can't be read, and it can't be recovered if you forget the password.
- **Import** adds watches from a file exported earlier, asking for the password
  if the file is protected. Imported watches need site access again: open each
  one and click **Allow**.

The export contains your watches, their settings and your general settings.
Saved versions and logs are not included; they stay on the computer.

**Use case:** move your watches to a new laptop, share a set of watches with a
colleague (without a password, or tell them the password separately), or keep a
copy before reinstalling the extension.
