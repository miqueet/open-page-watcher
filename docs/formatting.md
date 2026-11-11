# Formatting changes

Normally a watch compares **text**: if the words stay the same, nothing
changed. Sometimes the words stay the same but what matters is how they look:
a menu item turns bold to mark the current option, a line gets struck through
when a product is discontinued, a status turns red, or a link now points
somewhere else.

Tick **Also watch formatting** under **What to watch** to count those too. It's
off by default, per watch.

## What counts

The text is read a second time with simple marks for its formatting, and those
marks are compared too.

| On the page | Written as | Example |
| --- | --- | --- |
| Headings `h1`–`h6` | `# `, `## `… at the start of the line | `## Pricing` |
| List items | `- ` or `1. ` | `- Basic plan` |
| Quotes | `> ` | `> Note: …` |
| Table cells | `\| ` | `\| 10` |
| Bold (`b`, `strong`, `th`, `font-weight: bold`) | `**…**` | `**$9**` |
| Italic (`i`, `em`, `cite`, `font-style: italic`) | `_…_` | `_beta_` |
| Strikethrough (`s`, `del`, `line-through`) | `~~…~~` | `~~$12~~` |
| Code (`code`, `kbd`, `samp`) | `` `…` `` | `` `v4.2` `` |
| Links | `[text](address)` | `[Download](https://example.com/v4.2.zip)` |
| Underline, highlight (`mark`), superscript, subscript, small, big | `{underline}…{/underline}` and so on | `{highlight}New{/highlight}` |
| Hidden (`hidden`, `display: none`, `visibility: hidden`) | `{hidden}…{/hidden}` | `{hidden}Sold out{/hidden}` |
| Colors, background colors and sizes written in the page's HTML (`style="color: red"`, `<font color>`) | `{color: red}…{/color}`, `{background: …}`, `{size: …}` | `{color: #c00}Delayed{/color}` |

## What doesn't count, on purpose

- **Stylesheets and class names.** A site that turns text red with
  `class="text-danger"` and a stylesheet isn't seen, only inline styles and
  formatting tags are. Sites rename their classes and change their themes all
  the time, so watching them would mean constant false alerts. Also, a
  downloaded page has no styles applied.
- **Pixel-level appearance.** This isn't a screenshot comparison. Fonts,
  layout, images and positions aren't compared.
- It isn't used together with the regex filter or `@attribute` selectors (they
  produce bare values), or for PDFs, JSON and feeds (they have no formatting).
- Versions saved before you turned it on have no formatting, so the first
  check after turning it on never counts as a formatting change.

## How it shows up

- A change where only the formatting changed is saved like any other change,
  and its check log entry says "Only the formatting changed".
- The notification says what kind of formatting changed: "Formatting changed:
  bold, color" or "Formatting changed: link".
- The watch's history gets a **Formatting** view showing the marked-up text of
  the two versions you compare, with the changes highlighted.
- Alert rules still look at the plain text. With rules set, a formatting-only
  change alerts only if the rules hold for the text, so for formatting watches
  use no rules, or rules that are true anyway.

## Use cases

**Which plan is "recommended".** A pricing page shows three plans, and the one
marked as recommended is bold. The words don't change when the recommendation
moves, but the bold does: `**Pro**` → `Pro`, `Team` → `**Team**`.

**Discontinued items.** A parts catalog strikes through discontinued parts
instead of removing them: `Bracket A-14` → `~~Bracket A-14~~`.

**Status colors.** An internal status page writes
`<span style="color: green">Running</span>` and switches to `color: orange`
when degraded, keeping the word "Running". The watch sees
`{color: green}Running{/color}` → `{color: orange}Running{/color}`.

**Links that move.** A "Download latest" button keeps its text but its address
changes with every release: `[Download latest](…/tool-4.2.zip)` →
`[Download latest](…/tool-4.3.zip)`. (Watching `a.download @href` does this
too, without formatting.)

**Hidden notices.** A store keeps a "Sold out" label in the page and hides it
with `style="display:none"` when in stock. With formatting on you see
`{hidden}Sold out{/hidden}` appear or disappear.

**Document structure.** A policy document where a paragraph is promoted to a
heading or a list item is added.
