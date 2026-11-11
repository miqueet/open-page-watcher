# HTML and visual changes

By default a watch compares the **text** of the parts you picked. Some changes
don't touch the text at all: a button gets greyed out, a badge changes color,
a product photo is swapped. Two optional settings catch those. Both are off
until you turn them on, in the watch editor under **What to watch**.

| Setting | Notices | Works with | Extra permission |
| --- | --- | --- | --- |
| Also watch formatting | Bold, headings, lists, links, inline colors and sizes | Any page read as HTML | None |
| Also watch the HTML | Elements and attributes: classes, `disabled`, image and link addresses, added or removed elements | Any page read as HTML | None |
| Also compare screenshots | Anything you can see: colors from stylesheets, images, layout, hidden or moved elements | Pages opened in a hidden window | Access to all sites (see below) |

You can turn on any combination. A check counts as a change when the text
changed, or when any of the settings you turned on finds a difference. Your
alert rules still decide whether you're notified.

## Also watch the HTML

Each check keeps a cleaned copy of the watched part's HTML (scripts, styles,
event handlers and private form fields are never kept). With this on, the
elements and their attributes are compared, not only the words.

- Attribute order never counts: `<a class="x" href="/y">` is the same as
  `<a href="/y" class="x">`.
- Text is left to the normal text comparison, so "ignore numbers" and "ignore
  dates" still work.
- The `nonce` attribute, which some sites change on every visit, is always
  ignored.

The notification says what changed, for example:

- `HTML changed: <button> gained disabled`
- `HTML changed: <img> src changed`
- `HTML changed: <div> class changed, 2 <li> added`

Open the watch and pick the **HTML** tab to see one line per element, with the
changed attributes highlighted.

### Example: a "Sold out" state that only shows as a class

The store page's button always says "Add to cart", but when stock runs out the
site adds a class and disables it:

```html
<!-- before -->
<button class="buy">Add to cart</button>
<!-- after -->
<button class="buy sold-out" disabled>Add to cart</button>
```

1. Pick the button (or its container) with **Select parts of page**.
2. Edit the watch and tick **Also watch the HTML**.
3. When the button changes you get `HTML changed: <button> gained disabled and
   class changed`.

### Example: a new download link

Watching `a.download @href` already tracks one link's address. To be told when
any link in a release list is added, removed or repointed, pick the list and
turn on **Also watch the HTML**.

### Ignoring noisy attributes

Some sites stamp elements with values that change on every load, such as
`data-timestamp="1731340000"` or a generated `style`. List them under
**Attributes to ignore**, separated by commas:

| You write | It ignores |
| --- | --- |
| `style` | The `style` attribute only |
| `data-*` | Every attribute starting with `data-` |
| `aria-*, data-reactid` | Every `aria-` attribute, and `data-reactid` |

The list is used when comparing, so changing it applies to the versions you
already have too.

## Also compare screenshots

With this on, every check also takes a picture of the watched parts and
compares it with the previous one.

- It needs **How to load the page** set to "Open it in a hidden window". Ticking
  the box picks that for you.
- The picture covers the parts you picked (or the top of the page, for a
  whole-page watch). Parts are scrolled into view first.
- **Count it as a change when at least this much of the picture differs**
  sets the sensitivity. 1% (the default) catches a changed price or a button
  changing color. Raise it for areas with small moving parts, like a clock or a
  rotating banner.
- If the watched area changes size, that always counts.

The notification reads like `Looks different: 4% of the screenshot changed.`
The **Screenshot** tab shows the older and newer pictures side by side, with
the changed areas outlined in red on the newer one. Screenshots are kept for
the ten most recent versions.

### Why it asks for access to all sites

Chrome only lets an extension take a screenshot of a tab when it has access to
all sites (or when you've just clicked it, which a timer can't do). So the
first time you turn screenshots on, Chrome asks for that, in the same prompt as
the site itself. What the extension does with it is limited:

- It only takes pictures of the hidden window it opened for the watched page.
- Checks, redirects and frames still only go to sites you added watches for.
  Access to all sites never counts as permission for a site.
- It's given back as soon as no watch takes screenshots (when you turn them off
  or delete the watch). This is checked again whenever Chrome starts.
- IT teams can turn screenshots off with the `disableScreenshots` policy (see
  [enterprise.md](enterprise.md)).

On some computers Chrome doesn't draw minimized windows. There, the hidden
window is shown for a moment, without taking focus, while the picture is taken.

### Example: a status light

A status page shows a colored dot whose color comes from the site's
stylesheet, and the text next to it doesn't always change. Text, formatting and
HTML comparison can't see a stylesheet color, but a screenshot can:

1. Add the status page and pick the dot and its label.
2. Edit the watch, tick **Also compare screenshots**, and allow the prompt.
3. Leave the sensitivity at 1%.

### Example: a product photo

The product name and price stay the same but the photo is replaced. Either
setting catches it: **Also watch the HTML** reports `<img> src changed` if the
address changes, and a screenshot catches a new picture at the same address.

## Which one should I use?

- Text changes only: leave all three off. It's the quietest.
- The page marks state with classes, `disabled`, `hidden`, `aria-` attributes or
  image addresses: **Also watch the HTML**.
- The change is only visible through the site's stylesheets or pictures, or
  you want to see it: **Also compare screenshots**.
- Emphasis matters (a line turning red or bold in the page's own markup):
  **Also watch formatting**.
