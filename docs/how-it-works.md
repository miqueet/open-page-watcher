# How it works

This page follows one check from start to finish. Knowing the order of the
steps explains most of the "why did (or didn't) it alert me?" questions.

```
 schedule ──► load the page ──► pick the parts ──► regex filter ──► compare
                                                                       │
     inbox ◄── notification ◄── alert rules ◄── save new version ◄─────┘
```

## 1. When a check happens

A background timer ticks once a minute and runs every watch that is due.

- **Interval.** Each watch is checked every N minutes, hours or days, from
  1 minute to 7 days. Drag the slider or type an exact value. The default is
  every hour.
- **Random interval.** "Randomly between 30 minutes and 2 hours" picks a new
  time after each check. Useful for sites that dislike requests at exact
  intervals.
- **Only during certain hours.** Tick the days and the time range, for example
  Monday to Friday, 09:00 to 17:00. A range that ends before it starts runs
  overnight: 22:00 to 06:00 means "from 10 pm until 6 am the next morning".
- **Live mode.** "Also check instantly while the page is open in a tab" re-reads
  the page in your tab the moment its content changes, in addition to the
  schedule. See [Loading pages](loading-pages.md#live-mode).
- **Check now.** The button on a watch (or `c` in the inbox) runs a check
  immediately.
- **Paused** watches are never checked until you resume them.

Your organization can set a minimum interval; shorter ones are raised to it.

**Example:** a stock-status page that only updates during business hours:
every 10 minutes, only Monday to Friday 08:00 to 18:00. That's about 60
checks a day instead of 144, and none at night.

## 2. Loading the page

There are three ways to read a page; see [Loading pages](loading-pages.md) for
details.

| Mode | How | Use it for |
| --- | --- | --- |
| Download (default) | Downloads the page and reads its HTML without running any of its scripts | Most pages, PDFs, feeds, JSON, plain text |
| Hidden tab | Opens the page in a hidden window, waits a few seconds for scripts to fill it in, reads it, closes it | Pages built by JavaScript (single-page apps, dashboards) |
| Live | Reads the tab you already have open, the moment it changes | Pages you keep open anyway, such as a queue or a ticket board |

If the page asks you to sign in, nothing is saved; see
[Pages behind a sign-in](loading-pages.md#pages-behind-a-sign-in).

## 3. Picking the parts

If the watch has no selectors, the whole page's text is used. Otherwise each
[selector](selectors.md) line finds its elements, "Leave out" selectors remove
parts inside them, and the text of everything found is joined, one element
after another.

Text is read the way you see it: each block (paragraph, heading, list item,
table row) on its own line, spaces tidied, and scripts, styles and hidden form
fields skipped. Password, hidden and file fields are never read.

If none of the selected elements are found, the check fails with "None of the
selected elements were found on the page" instead of saving an empty version.
That usually means the site changed its layout; see
[Troubleshooting](troubleshooting.md).

## 4. The regex filter

If the watch has "Keep only text matching this regular expression", only the
matching pieces of text are kept, one per line. Everything after this point,
including the comparison, the alert rules and the saved version, only sees the
filtered text. See [Regular expressions](regex.md#1-keep-only-text-matching).

## 5. Comparing with the last version

The new text is compared with the last **saved** version (not the last check:
a version is saved only when something changed).

Before comparing, both texts go through the [ignore options](ignoring-noise.md):
lines you ignore are dropped, dates or numbers are blanked, and so on. This is
only for the comparison. The saved version always keeps the real text, so the
history shows what the page actually said.

If the texts are the same after that, the check ends here: "no change", nothing
saved, no alert. If "Also watch formatting" is on, the
[formatting](formatting.md) is compared too, and a formatting-only change counts.

The very first check of a watch has nothing to compare with, so it just saves
the starting version.

## 6. Saving the new version

When something changed, the new text is saved as a version, together with a
cleaned-up copy of the HTML (for the visual view) and, if formatting is watched,
the formatting. Old versions are dropped beyond "Versions to keep" (20 by
default, up to 200).

A version is saved even if the alert rules below say not to alert, so the
history is always complete.

## 7. Alert rules

With no rules, every change alerts. With rules, the change alerts only if the
rules are met: **all** of them, or **any** of them, as you choose. Rules can look
at the new text, only the added text, only the removed text, or the previous
text. See [Alert rules and notifications](alerts.md).

**Example:** "alert when **all** of: *new text* **number is less than** 1200,
and *new text* **contains** `in stock`".

## 8. The notification

When a change alerts:

- The watch is marked unread and the toolbar badge counts it.
- A desktop notification says what changed in plain words, for example
  "Went down from $1,299 to $1,199 (−7.7%)", "Added: In stock" or
  "Now: Open · Was: Closed". Clicking it opens the watch in the inbox.
- Optionally a sound plays and the change is read aloud.
- If quiet hours are on, or alerts are combined into a summary, the notification
  waits; the change itself is still recorded right away.
- If "Pause after the first alert" is on, the watch pauses.

## 9. When a check fails

A failed check (site down, timeout, selection not found) is logged and shown on
the watch, and nothing is saved. After 5 failures in a row (you can change the
number in Settings) you get one "keeps failing" notification, at most every
15 minutes. Sign-in pages and script-only placeholder pages are handled
separately; see [Loading pages](loading-pages.md).

## Limits

To keep checks fast and safe:

- A request gives up after 30 seconds.
- Pages over 5 MB and PDFs over 20 MB are refused.
- The watched text can't be over 2 million characters; select part of the page.
- Only `http://` and `https://` addresses can be watched.
- A redirect must stay on the same site or on a site you allowed.
- The check log keeps the last 50 checks per watch.

## Where to look when something surprises you

Every watch has a **check log** at the bottom of its page: time, how long it
took, whether it changed, whether it alerted, and notes such as "Only the
formatting changed" or "Turned on 'Send my cookies' because the page asked you
to sign in". It's the quickest way to see which step stopped an alert.
