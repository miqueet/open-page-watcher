# Alert rules and notifications

Every change is saved in the watch's history. **Alert rules** decide which
changes also notify you. This page covers the rules, then how you're notified.

- [How rules work](#how-rules-work)
- [Which text a rule looks at](#which-text-a-rule-looks-at)
- [Text rules](#text-rules)
- [Number rules](#number-rules): "notify me when it's below $1,200", and
  [Which number](#which-number)
- [Change-size rules](#change-size-rules)
- ["Doesn't match any earlier version"](#doesnt-match-any-earlier-version)
- [Recipes](#recipes)
- [Notifications](#notifications), [sounds](#sounds), [read aloud](#read-aloud)
- [Pause after the first alert](#pause-after-the-first-alert)
- [Quiet hours and combined summaries](#quiet-hours-and-combined-summaries)
- [Alerts when a watch keeps failing](#alerts-when-a-watch-keeps-failing)

## How rules work

Rules are only looked at when the page **changed** (after the
[ignore options](ignoring-noise.md)). They never cause an alert on a check where
nothing changed.

- **No rules:** every change alerts.
- **Alert when all of these are true:** every rule must hold.
- **Alert when any of these is true:** one rule is enough.

Add a rule with **+ Add rule**. Each rule has three parts: which text it looks
at, the test, and a value. Up to 20 rules per watch.

When the rules aren't met, the new version is still saved and the watch's
"latest change" line still updates. You just aren't notified and the watch
isn't marked unread.

## Which text a rule looks at

| Choice | Means | Typical use |
| --- | --- | --- |
| New text | The whole watched text after the change | "The price is now below 1200", "the page says in stock" |
| Added text | Only what's new: added lines, and the changed words in edited lines | "A new job mentions remote", "a new release is 5.x" |
| Deleted text | Only what was removed | "A product was taken off the list" |
| Previous text | The whole watched text before the change | "It used to say sold out" |

Example. The previous text was:

```
Price is 10 dollars today
Senior Engineer, London
```

and the new text is:

```
Price is 12 dollars now
Senior Engineer, London
Staff Engineer, Remote
```

Then *added text* is `12`, `now` and `Staff Engineer, Remote` (one per line),
and *deleted text* is `10` and `today`.

## Text rules

Text rules ignore upper and lower case.

| Rule | Value | Alerts when |
| --- | --- | --- |
| Contains | text | The text contains the value anywhere |
| Doesn't contain | text | It doesn't |
| Starts with | text | The text, ignoring leading spaces, starts with the value |
| Ends with | text | It ends with the value |
| Is empty | | The text is blank |
| Is not empty | | The text has anything in it |
| Length is less than / more than | number | Its number of characters is below / above |
| Matches regex / Doesn't match regex | regex | See [Regular expressions](regex.md#2-the-matches-regex-alert-rules) |

Examples:

- *New text* **contains** `in stock`: restock alerts.
- *New text* **doesn't contain** `sold out`: also restock, for pages that never
  say "in stock".
- *Added text* **is not empty**: alert only when something was added, not when
  something was only removed. Great for lists of jobs, posts or files.
- *Deleted text* **is not empty**: the opposite, for "tell me when something
  disappears".
- *Previous text* **contains** `closed` with *new text* **contains** `open`
  (all): only the transition from closed to open, not every edit while open.
- *New text* **length is less than** `50`: the page shrank to an error message.

## Number rules

Number rules read a number from the chosen text: the **first** number, or the
one you point at with [Which number](#which-number). Prices, counts and scores
in everyday formats are understood:

| Text | Read as |
| --- | --- |
| `$1,299.99` | 1299.99 |
| `1.299,00 €` | 1299 |
| `12,50 €` | 12.5 |
| `-4.5%` | -4.5 |
| `1.2K followers` | 1200 |
| `3.5M views` | 3500000 |
| `1,204 results` | 1204 |

| Rule | Value | Alerts when |
| --- | --- | --- |
| Number is less than | limit | The number is below the limit (every change while it's below) |
| Number is more than | limit | The number is above the limit (every change while it's above) |
| Number dropped below | limit | The number **crosses** below the limit: it was at or above it, and now it's below. Once. |
| Number rose above | limit | The number crosses above the limit. Once. |
| Number increased | | The new number is higher than the previous one |
| Number decreased | | The new number is lower than the previous one |
| Number increased by more than | amount | It went up by more than this amount |
| Number decreased by more than | amount | It went down by more than this amount |
| Number increased by more than % | percent | It went up by more than this percentage |
| Number decreased by more than % | percent | It went down by more than this percentage |

**Typing a limit.** Write it the way you'd say it: `1200`, `$1,200`,
`1200 dollars`, `1,200.50` and `1.2k` all work. Whatever you type is also
used in the notification, so `$1,200` reads "now below $1,200".

"Less than", "more than" and the crossing rules read the number from the text
you choose (usually *new text*). The crossing, increase and decrease rules
compare the previous version's number with the new one's.

### "Notify me when the price is below $1,200"

1. Watch the price. Use the picker on the price, or a selector such as
   `.price` or `[itemprop="price"]`. (See [Selectors](selectors.md).)
2. Under **Alerts**, click **+ Add rule** and choose *New text* **Number
   dropped below**, value `$1,200`.
3. Save.

| Price goes | Number dropped below `$1,200` | Number is less than `$1,200` |
| --- | --- | --- |
| $1,299 → $1,249 | No | No |
| $1,249 → $1,199 | **Yes**: "Went down from $1,249 to $1,199 (−4.0%), now below $1,200" | **Yes** |
| $1,199 → $1,150 | No (it was already below) | **Yes** (still below, and it changed) |
| $1,150 → $1,250 | No | No |
| $1,250 → $1,180 | **Yes** (it crossed again) | **Yes** |

So:

- **Number dropped below** tells you once each time it goes under your limit.
  Best for "tell me when it's cheap enough".
- **Number is less than** tells you about every change while it's under the
  limit. Best when you also want to hear about further drops.
- Tick [Pause after the first alert](#pause-after-the-first-alert) too if you
  only ever want to hear once.

The same pattern works the other way: **Number rose above** `100` for "alert me
when the queue goes over 100 tickets", or "when the share price rises above
250".

### Which number

Every number rule has an optional **Which number** box. Leave it empty to use
the first number in the text. Or type a [regular expression](regex.md#4-which-number)
that finds the number you want: the first group `( )` is read, or the whole
match if it has no group. It ignores case, and `^`/`$` match each line.

With the watched text

```
Only 3 left
Price: $1,299
Was $1,499
```

| Which number | Reads | Why |
| --- | --- | --- |
| (empty) | 3 | The first number in the text |
| `Price:\s*(\S+)` | 1299 | What follows "Price:" |
| `\$(\S+)` | 1299 | The first amount after a `$` |
| `was\s*(\S+)` | 1499 | The old price (any case) |
| `(\d+) left` | 3 | The stock count |

The notification follows the same number: "Went down from $1,299 to $1,199
(−7.7%), now below $1,200", not a change in the stock count. If several rules
have a Which number, the notification and the chart use the first one.

### Making sure the right number is read

If the number rule reads the wrong number, any of these fixes it:

- **Which number:** point the rule at it, as above. Easiest.
- **Select just the number** on the page instead of the whole box.
- **Keep only the number** with the [regex filter](regex.md#1-keep-only-text-matching),
  for example `\$[\d,.]+`. This also changes what's saved.
- **Read a machine-readable attribute**, if the site has one:
  `[itemprop="price"] @content` often gives a clean `1299.00`.

Things to know:

- Dates and times are numbers too: in "Updated 11:42 · $1,299" the first
  number is 11. Use Which number or leave the date out.
- Thousands separated by spaces (`1 299 €`) read as 1. Use Which number with
  a regex that skips the space, or read a machine-readable attribute.
- Version numbers read as their first two parts: `4.2.1` is 4.2.

### More number examples

| Goal | What to watch | Rule |
| --- | --- | --- |
| Price under $1,200, once | `.price` | number dropped below `$1,200` |
| Price drops at all | `.price` | number decreased |
| Price drops by more than $50 | `.price` | number decreased by more than `50` |
| Price drops by more than 10% | `.price` | number decreased by more than % `10` |
| Stock under 5 | the product box | number dropped below `5`, which number `(\d+) left` |
| Search results above 1,000 | the results header | number rose above `1k`, which number `([\d,]+) results` |
| Followers pass 10,000 | the profile header | number rose above `10k`, which number `([\d.,]+[KM]?) followers` |
| API latency jumps 50% | `json:$.p95_ms` | number increased by more than % `50` |
| Exchange rate above 1.10 | `.rate` | number rose above `1.10` |
| Temperature below freezing | `.temp` | number dropped below `0` |

The watch page also shows a **chart** of the number in each saved version (the
one Which number points at, if set), so you can see the trend; see
[Reviewing changes](reviewing-changes.md#the-number-chart).

## Change-size rules

| Rule | Value | Alerts when |
| --- | --- | --- |
| Lines changed is more than | number | More than this many lines were added, removed or edited |
| Lines changed is more than % | number | Changed lines are more than this percentage of the longer version |

Use these on long pages where tiny edits don't matter.

- A 200-line policy page with **Lines changed is more than** `3`: a typo fix
  (1 line) is saved but doesn't alert; a new section does.
- A pricing page with **Lines changed is more than %** `20`: a full redesign or
  new price table alerts, a changed footer doesn't.

These rules count lines regardless of which text you choose. See also
[Ignoring noise](ignoring-noise.md).

## "Doesn't match any earlier version"

Alerts only when the new text is different from **every** version still kept in
the history, not just the last one. Use it for pages that flip back and forth:

- A status that toggles between "Operational" and "Degraded" every few
  minutes: you're alerted the first time each state appears, not every flip.
- An A/B-tested banner that alternates between two versions.

It only remembers as many versions as "Versions to keep" (20 by default, up
to 200).

## Recipes

| Goal | Match | Rules |
| --- | --- | --- |
| Restock | all | *New text* contains `in stock` |
| Back in stock and under $100 | all | Watch the product box; *new text* contains `in stock`; *new text* number is less than `$100`, which number `\$(\S+)` |
| New job mentioning remote | all | *Added text* is not empty; *added text* contains `remote` |
| Any new job in London or Remote | all | *Added text* matches regex `london\|remote` |
| Something removed from a list | all | *Deleted text* is not empty |
| Big change only | all | Lines changed is more than `5` |
| Closed → open | all | *Previous text* contains `closed`; *new text* contains `open` |
| Price dropped or went out of stock | any | Number decreased; *new text* contains `out of stock` |
| Status page not green | any | *New text* doesn't contain `operational`; *new text* matches regex `degraded\|outage` |

## Notifications

Under **Alerts** in the editor:

- **Desktop notification** (on by default). The title is the watch's name, and
  the message says what changed, in plain words:
  - A number changed: "Went down from $1,299 to $1,199 (−7.7%)" or
    "Went up from 12 to 15 (+25.0%)", plus ", now below $1,200" when a limit in
    your rules was passed
  - Text was added: "Added: In stock"
  - Text was removed: "Removed: Size 10"
  - Text was replaced: "Now: Open · Was: Closed"
  - Formatting only: "Formatting changed: bold, color" and so on
  - HTML only: "HTML changed: <button> gained disabled"
  - Screenshot only: "Looks different: 4% of the screenshot changed."

  Clicking the notification opens the watch in the inbox.
- The toolbar icon shows a **badge** with the number of unread watches.

Notifications go through Chrome. If you don't see them, check that Chrome is
allowed to show notifications in your operating system's settings, and that
"Do not disturb" or Focus is off.

## Sounds

Tick **Play a sound** and pick one of six sounds: Chime (default), Bell,
Doorbell, Three beeps, Rising or Alarm. Click **▶ Preview** to hear it. The sounds
are generated on your computer; nothing is downloaded. Use different sounds for
different watches so you can tell them apart without looking: an alarm for
"server down", a chime for "new blog post".

## Read aloud

Tick **Read the change aloud** to hear the watch's name and the summary, for
example "Trail Runner 3 changed. Went down from $1,299 to $1,199". When more
than three watches alert at once you hear "5 watches changed." instead. Only voices installed
on your computer are used, never online voices, so the text doesn't leave your
computer. If no on-device voice is installed, nothing is read. Useful when
you're away from the screen or for accessibility.

## Pause after the first alert

Tick **Pause after the first alert** for one-off events: the watch pauses itself
after it alerts, so you aren't alerted again. Resume it from the inbox when you
want it back.

Use cases: a restock, exam results being published, a visa appointment slot,
a ticket sale opening, a price dropping below your target.

## Quiet hours and combined summaries

In **Settings** (these apply to all watches):

- **Quiet hours:** no notifications or sounds between two times on the days you
  choose, for example 22:00 to 07:00 every day. Watches keep checking. When
  quiet hours end, you get one summary of what changed.
- **Combine alerts into one summary:** instead of a notification per change, at
  most one every 30 minutes, hour, 3, 6 or 12 hours, or day, listing everything that
  changed. Changes are still recorded right away; only notifications are
  bundled.

Example: a team lead with 40 watches on vendor pages turns on summaries every
hour, and quiet hours on weekends.

## Alerts when a watch keeps failing

In **Settings**, **Notify me when a watch keeps failing** (on by default) sends
one notification after a watch fails a number of checks in a row (5 by
default), at most once every 15 minutes. Failing means the site is down, the
check timed out, or the selected parts weren't found (often a redesign). Pages
asking you to sign in are handled differently; see
[Loading pages](loading-pages.md#pages-behind-a-sign-in).
