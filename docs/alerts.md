# Alert rules and notifications

Every change is saved in the watch's history. **Alert rules** decide which
changes also notify you. This page covers the rules, then how you're notified.

- [How rules work](#how-rules-work)
- [Which text a rule looks at](#which-text-a-rule-looks-at)
- [Text rules](#text-rules)
- [Number rules](#number-rules): "notify me when it's below $1,200"
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

Number rules read the **first number** in the chosen text. Thousands separators
and currency symbols are fine: `$1,299.99` is read as 1299.99, `-4.5%` as -4.5,
`1,204 results` as 1204.

| Rule | Value | Alerts when |
| --- | --- | --- |
| Number is less than | number | The number is below the value |
| Number is more than | number | The number is above the value |
| Number increased | | The new number is higher than the previous one |
| Number decreased | | The new number is lower than the previous one |
| Number increased by more than | number | It went up by more than this amount |
| Number decreased by more than | number | It went down by more than this amount |
| Number increased by more than % | number | It went up by more than this percentage |
| Number decreased by more than % | number | It went down by more than this percentage |

"Less than" and "more than" read the number from the text you choose (usually
*new text*). The increase and decrease rules always compare the first number
of the previous version with the first number of the new one.

### "Notify me when the price is below $1,200"

1. Watch only the price. Use the picker on the price, or a selector such as
   `.price` or `[itemprop="price"]`. (See [Selectors](selectors.md).)
2. Under **Alerts**, add the rule *New text* **Number is less than** `1200`.
3. Save.

| Price goes | Alert? | Notification |
| --- | --- | --- |
| $1,299 → $1,249 | No (still 1200 or more) | |
| $1,249 → $1,199 | **Yes** | "Went down from $1,249 to $1,199 (−4.0%)" |
| $1,199 → $1,150 | **Yes** (still below, and it changed) | "Went down from $1,199 to $1,150 (−4.1%)" |
| $1,150 → $1,150 | No (no change) | |
| $1,150 → $1,250 | No | |

To be told only the first time it drops below, also tick
[Pause after the first alert](#pause-after-the-first-alert). To be told only when
it keeps getting cheaper while below, use **all** of:

- *New text* **Number is less than** `1200`
- *New text* **Number decreased**

The same pattern works the other way: **Number is more than** `100` for "alert
me when the queue has more than 100 tickets", or "when the stock price goes
above 250".

### Making sure the right number is read

The rule uses the **first** number in the text, so the watched text should start
with the number you care about. With the text

```
Only 3 left at $1,299
```

the first number is `3`. Fix it one of these ways:

- **Select just the price** element instead of the whole box.
- **Keep only the price** with the [regex filter](regex.md#1-keep-only-text-matching)
  `\$[\d,.]+`. The watched text becomes `$1,299`.
- **Keep only the number you want** with a group: `at \$([\d,.]+)` keeps
  `1,299`.
- **Read a machine-readable attribute** if the site has one:
  `[itemprop="price"] @content` often gives a clean `1299.00`.

Number formats that use a dot for thousands and a comma for decimals
(`1.299,00 €`) are read up to the comma: `1.299`. Either read a
machine-readable attribute as above, or keep the threshold in the same form
(less than `1.2` means less than 1.200 €) as long as the site always shows
thousands.

### More number examples

| Goal | What to watch | Rule |
| --- | --- | --- |
| Price below $1,200 | `.price` | *New text* number is less than `1200` |
| Price drops at all | `.price` | number decreased |
| Price drops by more than $50 | `.price` | number decreased by more than `50` |
| Price drops by more than 10% | `.price` | number decreased by more than % `10` |
| Stock under 5 | keep only `(\d+) left` | *New text* number is less than `5` |
| Search results above 1,000 | keep only `([\d,]+) results` | *New text* number is more than `1000` |
| API latency jumps 50% | `json:$.p95_ms` | number increased by more than % `50` |
| Exchange rate above 1.10 | `.rate` | *New text* number is more than `1.10` |
| Temperature below freezing | `.temp` | *New text* number is less than `0` |

The watch page also shows a **chart** of the first number in each saved version,
so you can see the trend; see [Reviewing changes](reviewing-changes.md#the-number-chart).

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
| Back in stock and under $100 | all | Watch `.price` then `.stock` (price first, so it's the first number); *new text* contains `in stock`; *new text* number is less than `100` |
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
    "Went up from 12 to 15 (+25.0%)"
  - Text was added: "Added: In stock"
  - Text was removed: "Removed: Size 10"
  - Text was replaced: "Now: Open · Was: Closed"
  - Formatting only: "Formatting changed: bold, color" and so on

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
