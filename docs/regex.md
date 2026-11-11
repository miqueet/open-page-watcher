# Regular expressions

A regular expression ("regex") is a pattern for text: `\$[\d,.]+` means "a
dollar sign followed by digits, commas and dots", which matches `$1,299.00`.
Open Page Watcher uses regex in four places, and each behaves a little
differently:

| Where | What it does | Case | `^` and `$` mean |
| --- | --- | --- | --- |
| [1. Keep only text matching](#1-keep-only-text-matching) (What to watch) | Keeps only the matching pieces; everything else is thrown away before comparing | **Case-sensitive** | Start and end of the **whole text** |
| [2. Matches regex rule](#2-the-matches-regex-alert-rules) (Alerts) | Alerts only if the text matches (or doesn't) | Any case | Start and end of **each line** |
| [3. Ignore lines containing](#3-ignore-lines-containing) (What to watch) | Lines that match never count as a change | As you write it: add `i` for any case | Start and end of the **line** |
| [4. Which number](#4-which-number) (number alert rules) | Says which number a number rule reads | Any case | Start and end of **each line** |

The syntax is JavaScript's, the same as in Chrome's developer tools. If a
pattern isn't valid, the editor shows the error and won't save.

## Cheat sheet

| Pattern | Matches | Example match |
| --- | --- | --- |
| `abc` | The letters `abc` | `abc` in `xabcx` |
| `.` | Any one character (not a line break) | |
| `\d` | A digit 0–9 | `7` |
| `\D` | Anything but a digit | |
| `\w` | A letter, digit or `_` | |
| `\s` | A space, tab or line break | |
| `[abc]` | One of a, b or c | |
| `[^abc]` | Anything except a, b or c | |
| `[0-9,.]` | A digit, comma or dot | |
| `a*` | Zero or more `a` | |
| `a+` | One or more `a` | |
| `a?` | Zero or one `a` | |
| `a{3}` / `a{2,4}` | Exactly 3 / between 2 and 4 | |
| `.*?` | As few characters as possible | |
| `cat\|dog` | Either | |
| `(…)` | A group; the **first group** is what "Keep only" keeps | |
| `(?:…)` | A group that isn't captured | |
| `^` / `$` | Start / end (see the table above) | |
| `\b` | A word boundary | `\bstock\b` doesn't match `stocking` |
| `\.` `\$` `\(` `\[` `\?` `\+` `\*` `\|` | The character itself | `\$` matches `$` |
| `(?=…)` / `(?!…)` | Followed / not followed by | `\d+(?= left)` |
| `(?<=…)` | Preceded by | `(?<=Total: )\d+` |

Characters with a special meaning, `. $ ^ * + ? ( ) [ ] { } | \ /`, need a `\`
in front to match themselves. `$1,299.00` is matched by `\$1,299\.00`.

## 1. Keep only text matching

Under **What to watch**, "Keep only text matching this regular expression"
runs after the selectors. It finds every match in the watched text and keeps
only those, one per line. Everything after it (comparing, alert rules, the
saved versions and the notification) only sees what's kept.

- If the pattern has a **group** `( )`, only what the **first group** matched is
  kept. Use `(?: )` for groups you don't want kept.
- It is **case-sensitive**: `In stock` doesn't match `IN STOCK`. Write
  `[Ii]n [Ss]tock`, or `(?i:in stock)` (Chrome 125 and later).
- `^` and `$` mean the start and end of the whole watched text, not of each
  line.
- `.` doesn't match line breaks. Use `[\s\S]` to match across lines.
- Up to 1,000 matches are kept.
- If nothing matches, the watched text is empty. That counts as a change (from
  something to nothing), which is often what you want ("the sale banner is
  gone"). Add the rule "New text **is not empty**" if it isn't.

### Examples

Watched text (from a product page, before filtering):

```
Trail Runner 3
$1,299.00
Was $1,499.00
12 people are looking at this
In stock: 14 left
Ships in 2–3 days
```

| Keep only | Kept | Use case |
| --- | --- | --- |
| `\$[\d,.]+` | `$1,299.00` and `$1,499.00` | Every price on the page |
| `^\$[\d,.]+` | Nothing: `^` is the start of the whole text, which is `Trail…` | (A common mistake) |
| `\n(\$[\d,.]+)` | `$1,299.00` | The first price that starts a line |
| `(?<!Was )\$[\d,.]+` | `$1,299.00` | Prices not after "Was " |
| `Was (\$[\d,.]+)` | `$1,499.00` | Only the old price |
| `(\d+) left` | `14` | Stock count, for a "number is less than" rule |
| `In stock\|Out of stock\|Sold out` | `In stock` | Availability only, ignoring everything else |
| `Ships in [^\n]+` | `Ships in 2–3 days` | The whole rest of the line |

More patterns:

| Need | Pattern | Keeps |
| --- | --- | --- |
| Version numbers | `\d+\.\d+(?:\.\d+)?` | `4.2.1` |
| Version after a word | `Version:? (\d+(?:\.\d+)+)` | `4.2.1` from `Version: 4.2.1` |
| Dates like 2026-11-11 | `\d{4}-\d{2}-\d{2}` | `2026-11-11` |
| Percentages | `-?\d+(?:\.\d+)?%` | `7.8%` |
| Euro prices like 1.299,00 € | `[\d.]+,\d{2} ?€` | `1.299,00 €` |
| An email address | `[\w.+-]+@[\w-]+\.[\w.]+` | |
| A ticket or order id | `\b[A-Z]{2,5}-\d+\b` | `OPS-1432` |
| A status word | `\b(Operational\|Degraded\|Outage)\b` | `Degraded` |
| Everything between two labels | `Status:([\s\S]*?)Last updated` | What's between them |
| The number of results | `(\d[\d,]*) results` | `1,204` |

**Example: watch a price, ignore everything else in the box.** Selector
`.price-box`, keep only `\$[\d,.]+`. The box can be redesigned, gain badges or
lose its strikethrough price, and you'll only hear about it when a price
changes.

**Example: watch a version on a download page.** Selector `main`, keep only
`Version (\d+\.\d+\.\d+)`. The watched text is just `4.2.1`, so the
notification reads "Now: 4.3.0 · Was: 4.2.1".

Notes:

- "Also watch formatting" isn't used together with this filter, because the
  filter keeps only bare text.
- The filter runs on the text, after "Leave out" removed elements, and before
  the [ignore options](ignoring-noise.md).

## 2. The "Matches regex" alert rules

Under **Alerts**, the rules **Matches regex** and **Doesn't match regex** decide
whether a change alerts. They don't change what's saved.

- They're **case-insensitive**: `in stock` matches `IN STOCK`.
- `^` and `$` match at the start and end of **each line**.
- The pattern is tested on the text you choose: the new text, only the added
  text, only the removed text, or the previous text. See
  [Alert rules](alerts.md#which-text-a-rule-looks-at).

### Examples

| Rule | Alerts when | Use case |
| --- | --- | --- |
| *New text* matches `\bin stock\b` | The page says "in stock" anywhere | Restock |
| *New text* doesn't match `sold out\|unavailable` | Neither phrase is on the page | Restock, on pages that don't say "in stock" |
| *Added text* matches `^Senior .*Engineer` | A new line starts with "Senior … Engineer" | Job board |
| *Added text* matches `remote\|hybrid` | The new part mentions remote or hybrid | Job board |
| *Added text* matches `\b(CVE-\d{4}-\d+)\b` | A CVE number appears | Security advisories |
| *New text* matches `^Status: (degraded\|outage)` | A line starts with those statuses | Status page |
| *Added text* matches `\b(?:4\|5)\.\d+\.\d+\b` | A new version 4.x or 5.x is listed | Release notes |
| *Removed text* matches `\S` | Anything at all was removed | Spotting deletions from a policy page |
| *New text* doesn't match `^\s*$` | The text isn't blank | Same as "is not empty" |

If you only need plain words, the **contains** rule is simpler and also ignores
case: *Added text* **contains** `remote`.

## 3. Ignore lines containing

Under **What to watch**, "Ignore lines containing" takes one entry per line. A
line of the watched text that matches any entry is left out of the comparison,
so changing it never counts as a change on its own. (It still shows in the
history whenever something else changes.)

- A plain entry matches if the line **contains** it, in any case: `last updated`
  ignores `Last Updated: 11:42`.
- An entry written as `/pattern/` is a regex. Add flags after the closing slash:
  `i` for any case, `m`, `s` or `u`. Without `i` it is case-sensitive.
- Each line is tested on its own, so `^` and `$` are the start and end of that
  line.

### Examples

```
Last updated
/^\d+ (people|visitors) (are )?(looking|viewing)/i
/^Page generated in [\d.]+ ?ms$/
/^(Advertisement|Sponsored)$/i
/^© \d{4}/
/\b\d+ (seconds?|minutes?|hours?) ago\b/i
```

| Entry | Ignores | Keeps |
| --- | --- | --- |
| `Last updated` | `Last updated 11:42`, `LAST UPDATED: today` | |
| `/^Views: \d+$/` | `Views: 1204` | `Views: many`, `Total views: 3` |
| `/^\d+ people are looking at this$/i` | `12 people are looking at this` | `In stock` |
| `/sponsored/i` | Any line mentioning sponsored | |
| `/^\s*$/` | Blank lines (they're already removed) | |

## 4. Which number

Every number rule under **Alerts** (less than, more than, dropped below, rose
above, increased, decreased…) has an optional **Which number** box. Empty means
"the first number in the text". A regex there says where the number is:

- If the pattern has a group `( )`, the number is read from what the **first
  group** matched; otherwise from the whole match.
- It ignores case, and `^` and `$` match at each line.
- Only the first match is used.
- A currency sign just before the group still shows in the notification:
  `\$(\S+)` gives "$1,199", not "1,199".

With the watched text `Only 3 left · Price: $1,299 · Was $1,499`:

| Which number | Reads |
| --- | --- |
| (empty) | 3 |
| `Price:\s*(\S+)` | 1299 |
| `\$(\S+)` | 1299 (the first `$` amount) |
| `was\s*(\S+)` | 1499 |
| `(\d+) left` | 3 |
| `^Total:\s*(.+)$` | The number on the line starting with "Total:" |
| `([\d.,]+[KM]?) followers` | 12400 from `12.4K followers` |

Unlike the regex filter, this doesn't change what's saved or compared: the
whole text is still watched, and only the rule (plus the notification and the
number chart) looks at that one number. See
[Alert rules: Which number](alerts.md#which-number).

## Testing a pattern

Open any page, press **F12**, and in the **Console** try it on sample text.
For "Keep only" (case-sensitive, whole text):

```js
[..."Trail Runner 3\n$1,299.00\nWas $1,499.00".matchAll(/\$[\d,.]+/g)].map(m => m[1] ?? m[0])
// ['$1,299.00', '$1,499.00']
```

For a "Matches regex" rule (any case, per line):

```js
/^status: (degraded|outage)/im.test("Region A\nStatus: Degraded")
// true
```

For an "Ignore lines" entry, test one line at a time:

```js
/^Views: \d+$/.test("Views: 1204")
// true
```

Remember to double any `\` only if you type the pattern inside quotes, as in
`new RegExp("\\d+")`. In the extension's boxes and between `/ /`, write it once:
`\d+`.
