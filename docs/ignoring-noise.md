# Ignoring noise

Most pages change a little on every visit: a clock, a visitor counter, a
"posted 3 minutes ago", a rotating banner. If those count as changes, you get
alerts all day and stop reading them. This page covers every tool for keeping
noise out, from the most precise to the bluntest.

| Tool | Where | Removes |
| --- | --- | --- |
| [Select less](#1-select-less) | What to watch | Everything outside the parts you pick |
| [Leave out](#2-leave-out) | What to watch | Elements inside your selection |
| [Keep only text matching](#3-keep-only-text-matching) | What to watch | Everything except the matching text |
| [Ignore lines containing](#ignore-lines-containing) | What to watch | Whole lines with some text or matching a regex |
| [Don't count it as a change when only these differ](#dont-count-it-as-a-change-when-only-these-differ) | What to watch | Dates, numbers, case, spacing, line order |
| [Change-size rules](#change-size-rules) | Alerts | Changes that are too small to care about |

The first three change **what is watched**: the saved versions only contain
what's left. The ignore options only change **what counts as a change**: the
saved versions still contain the real text, so the history shows exactly what
the page said.

## 1. Select less

The best fix. Watching `#price` instead of the whole page removes every other
source of noise at once. See [Selectors](selectors.md).

## 2. Leave out

Selectors for parts inside your selection to skip, like ads or timestamps. See
[Selectors: Leave out](selectors.md#leave-out).

## 3. Keep only text matching

A regex that keeps only the pieces you care about. See
[Regular expressions](regex.md#1-keep-only-text-matching).

## Ignore lines containing

One entry per line. Any line of the watched text that matches an entry is left
out of the comparison:

- Plain text matches if the line contains it, in any case.
- `/pattern/` is a regular expression (add `i` after the last slash for any
  case).

```
Last updated
Page generated in
/^\d+ (people|visitors) (are )?(viewing|looking)/i
/^Advertisement$/i
```

Lines you ignore still appear in the history whenever something else changes,
but a change to only those lines is never saved as a change and never alerts.

**Use case:** a team wiki page ends with "Last edited by Sam, 4 minutes ago" and
a "Views: 1,204" counter. Ignore `Last edited by` and `/^Views: [\d,]+$/` and
you only hear about edits to the content.

More examples are in [Regular expressions](regex.md#3-ignore-lines-containing).

## Don't count it as a change when only these differ

Five tick boxes. Each one blanks something out of both versions before they're
compared.

### Dates and times

Dates and times are replaced with a placeholder, so `Updated Nov 11, 2026 at
11:42 pm` and `Updated Nov 12, 2026 at 9:05 am` compare as the same. Recognized
forms:

| Form | Examples |
| --- | --- |
| ISO dates and timestamps | `2026-11-11`, `2026-11-11T11:42:00Z`, `2026-11-11 11:42` |
| Numeric dates | `11/11/2026`, `11.11.26`, `11-11-2026` |
| Month name first | `Nov 11, 2026`, `November 11th 2026`, `Sept. 3, 2026` |
| Day first | `11 November 2026`, `3rd Sep 2026` |
| Times | `11:42`, `3:04:05 pm`, `9:05 a.m.` |
| Relative | `just now`, `5 minutes ago`, `2 hrs ago`, `3 days ago` |

**Use case:** a status page that says "Last checked 11:42" at the top. Tick
**Dates and times** and only real status changes count.

### Numbers

Every number is replaced with a placeholder. Only changes to words count.

**Use case:** you watch a product listing for new or removed products, not
price changes. Or a news page where comment counts keep changing.

With this ticked, number alert rules still work on the real text, but the
watch only reaches the rules when some words changed. The number chart is
hidden for watches that ignore numbers.

### Upper/lower case

`IN STOCK` and `In stock` compare as the same. Useful for sites that restyle
their text with capitals.

### Spacing

All runs of spaces, tabs and line breaks count as one space. Useful when a site
re-wraps its text or adds blank lines. Note that this also means a line that
moves into a neighbouring line (two lines joined into one) isn't a change.

### Order of lines

The lines are sorted before comparing, so the same lines in a different order
compare as the same.

**Use case:** a list of team members, servers or products that the site shows
in a random or "recently updated" order. You only want to know when one is
added or removed.

## Change-size rules

These are alert rules rather than ignore options: the change is saved, but it
only alerts if it is big enough.

- **Lines changed is more than** `3`: small edits are saved silently.
- **Lines changed is more than %** `20`: only changes to a fifth of the text or
  more.

See [Alert rules: change-size rules](alerts.md#change-size-rules).

## The order everything happens in

1. Selectors pick elements; Leave out removes parts of them.
2. The regex filter keeps only matching text. *(This is what's saved.)*
3. Ignored lines are dropped.
4. Lines are sorted (Order of lines).
5. Dates, then numbers, are blanked.
6. Spacing is collapsed and case is lowered.
7. The result is compared with the last saved version, treated the same way.
8. If it differs, the real text from step 2 is saved and the alert rules run on
   it.

## A worked example

Watched text over three checks of a support page:

```
Check 1                         Check 2                         Check 3
Status: All systems normal      Status: All systems normal      Status: Degraded performance
Updated 11:42                   Updated 11:57                   Updated 12:12
3,201 people viewing            3,377 people viewing            3,350 people viewing
```

With no ignore options, check 2 is a change and alerts, even though nothing you
care about changed. With **Dates and times** ticked and
`/people viewing$/` in **Ignore lines containing**:

- Check 2 compares as `Status: All systems normal` / `Updated <date>` both times:
  no change, nothing saved.
- Check 3 differs in the status line: saved and alerted.

One catch: the notification text is written from the real text, and when the
first number on the page changes it leads with that number. Here the first
number is the hour in "Updated 11:42", so the notification reads "Went up from
11 to 12". Selecting only the status line (or leaving out the "Updated" line
with a [Leave out](selectors.md#leave-out) selector) fixes that too: the
notification then reads "Now: Degraded performance · Was: All systems normal".
