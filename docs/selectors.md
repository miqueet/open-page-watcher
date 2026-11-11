# Choosing what to watch: selectors

A watch can look at a whole page or only some parts of it. The parts are chosen
with **selectors**: short patterns that point at elements on the page. You
don't have to write them yourself (the picker does it for you), but knowing how
they work lets you make a watch that survives the site's next redesign.

This page covers:

- [The picker](#the-picker)
- [The "Parts of the page" box](#the-parts-of-the-page-box)
- [CSS selectors](#css-selectors), with a cheat sheet
- [XPath](#xpath)
- [Watching an attribute instead of the text](#watching-an-attribute-instead-of-the-text)
- ["Leave out"](#leave-out)
- [Quick fills](#quick-fills)
- [JSON paths](#json-paths)
- [Tips for selectors that keep working](#tips-for-selectors-that-keep-working)
- [Testing a selector before you save](#testing-a-selector-before-you-save)

All examples below use this sample product page:

```html
<html>
<head>
  <title>Trail Runner 3 – Example Outdoor</title>
  <meta name="description" content="Lightweight trail running shoe.">
</head>
<body>
  <nav><a href="/">Home</a> <a href="/shoes">Shoes</a></nav>
  <main id="product">
    <h1 class="product-title">Trail Runner 3</h1>
    <div class="price-box" data-testid="price">
      <span class="price">$1,299.00</span>
      <span class="was">$1,499.00</span>
      <span class="viewers">12 people are looking at this</span>
    </div>
    <p class="stock in-stock">In stock</p>
    <a class="manual" href="/files/trail-runner-3-manual.pdf">Manual (PDF)</a>
    <img class="hero" src="/img/tr3.jpg" alt="Trail Runner 3, side view">
    <table id="sizes">
      <tr><th>Size</th><th>Available</th></tr>
      <tr><td>9</td><td>Yes</td></tr>
      <tr><td>10</td><td>No</td></tr>
    </table>
    <ul class="reviews">
      <li>Great grip. <time>2 days ago</time></li>
      <li>Runs small. <time>1 week ago</time></li>
    </ul>
  </main>
  <footer>© 2026 Example Outdoor · Updated 11:42</footer>
</body>
</html>
```

## The picker

Click the toolbar icon and **Select parts of page**, press **Alt+Shift+W**, or
use **Reselect on page** in the editor.

- Hover to outline an element, click to select it, click again to remove it.
- Click *inside* a selected element to leave that part out (it turns into a
  "Leave out" selector). Click it again to put it back.
- **Enter** saves, **Esc** cancels.

The picker writes the shortest selector it can find that matches only what you
clicked, preferring an `id` that looks hand-written (`#product`) over long paths.
Ids that look generated (`#ember123`, `#react-select-4-option`) are avoided
because they change on every visit.

**Example:** on the sample page you click the price box, then the "12 people
are looking at this" line inside it. The editor gets something like:

```
Parts of the page:   .price-box
Leave out:           .viewers
```

and the watched text is:

```
$1,299.00
$1,499.00
```

## The "Parts of the page" box

Open a watch and click **Edit**. Under **What to watch**:

- **One selector per line.** Each line is looked up separately and the text of
  every element found is joined in order, each element starting on a new line.
  Inside an element, paragraphs, list items, table cells and line breaks in the
  page also start new lines.
- A plain line is a **CSS selector**.
- A line starting with `xpath:` is an **XPath** expression.
- A line starting with `json:` is a **JSON path** (for JSON responses only).
- A line ending in a space and `@name` reads the **attribute** `name` instead of
  the text: `a.manual @href`.
- **Empty** means the whole page.

```
.price
.stock
xpath://table[@id="sizes"]//tr[td[2]="Yes"]/td[1]
a.manual @href
```

Watched text for the sample page:

```
$1,299.00
In stock
9
https://example-outdoor.example/files/trail-runner-3-manual.pdf
```

Relative addresses (`/files/...`) are turned into full ones, so a change of
domain or path shows up clearly.

## CSS selectors

CSS selectors are the same patterns web developers use for styling. Chrome's
own engine evaluates them, so anything Chrome supports works, including `:has()`
and `:not()`.

### Cheat sheet

| Selector | Matches | On the sample page |
| --- | --- | --- |
| `h1` | Every element of that tag | `Trail Runner 3` |
| `.price` | Elements with class `price` | `$1,299.00` |
| `#sizes` | The element with id `sizes` | The whole size table |
| `.stock.in-stock` | Elements with **both** classes | `In stock` |
| `h1, .price` | Either selector (a list) | `Trail Runner 3` and `$1,299.00` |
| `#product .price` | `.price` anywhere **inside** `#product` | `$1,299.00` |
| `.price-box > span` | `span` that is a **direct child** of `.price-box` | All three spans |
| `h1 + div` | The `div` **right after** an `h1` | The price box |
| `[data-testid="price"]` | Attribute equals | The price box |
| `[class^="price"]` | Attribute **starts with** | `.price-box` and `.price` (so the price appears twice: be specific) |
| `[href$=".pdf"]` | Attribute **ends with** | The manual link |
| `[href*="manual"]` | Attribute **contains** | The manual link |
| `.reviews li:first-child` | The first item | `Great grip. 2 days ago` |
| `.reviews li:nth-child(2)` | The second item | `Runs small. 1 week ago` |
| `#sizes tr:nth-child(n+2)` | Every row from the second on | The two size rows |
| `.reviews li:last-of-type` | The last `li` | `Runs small. 1 week ago` |
| `.price-box span:not(.viewers)` | Spans except `.viewers` | `$1,299.00`, `$1,499.00` |
| `li:has(time)` | `li` elements that **contain** a `time` | Both reviews |
| `title` | The page title in the browser tab | `Trail Runner 3 – Example Outdoor` |

### Examples

**Just the price:** `.price`

**Price and stock together, one per line:**

```
.price
.stock
```

**Every row of a table except the header row:** `#sizes tr:nth-child(n+2)`
gives

```
9
Yes
10
No
```

(Each table cell is on its own line, so a change to one cell shows as one
changed line.)

**The newest item in a list:** `.reviews li:first-child`. Useful on news and
release pages where the newest entry is on top. If you want to know about *any*
new entry, watch the whole list instead and use the alert rule "Added text is
not empty".

**An element by its visible label**, when the site has no useful classes:
`div:has(> h2#shipping)` picks the box that contains the "Shipping" heading.
XPath is often easier for this; see below.

## XPath

Start the line with `xpath:`. XPath can do two things CSS can't: match elements
**by their text**, and step **up** to a parent.

### Cheat sheet

| XPath | Matches | On the sample page |
| --- | --- | --- |
| `//h1` | Every `h1` | `Trail Runner 3` |
| `//*[@id="sizes"]` | Element with that id | The size table |
| `//span[@class="price"]` | Exact class attribute | `$1,299.00` |
| `//span[contains(@class,"price")]` | Class contains the word | Price box spans |
| `//p[contains(., "stock")]` | Element whose **text** contains "stock" | `In stock` |
| `//th[.="Available"]` | Element whose text **is** "Available" | That header cell |
| `//td[.="10"]/following-sibling::td[1]` | The cell **next to** the one saying 10 | `No` |
| `//tr[td[1]="9"]` | The row whose first cell is 9 | `9` and `Yes` |
| `//time/..` | The **parent** of each `time` | Both review `li`s |
| `(//ul[@class="reviews"]/li)[1]` | The first review | `Great grip. 2 days ago` |
| `(//ul[@class="reviews"]/li)[last()]` | The last review | `Runs small. 1 week ago` |
| `//a[@class="manual"]/@href` | The **attribute** itself, exactly as written | `/files/trail-runner-3-manual.pdf` |
| `//li/text()` | Only the text directly inside, not in children | `Great grip.`, `Runs small.` |
| `count(//li)` | Not supported: expressions must return elements, text or attributes | |

### Examples

**"Is size 10 available?"**

```
xpath://td[.="10"]/following-sibling::td[1]
```

Watched text: `No`. Add the alert rule *New text* **contains** `Yes` and you're
told the moment size 10 comes back.

**A value next to a label**, such as a definition list or a "Status: Open" line
whose markup has no classes:

```html
<dl><dt>Status</dt><dd>Open</dd><dt>Deadline</dt><dd>March 3</dd></dl>
```

```
xpath://dt[.="Deadline"]/following-sibling::dd[1]
```

Watched text: `March 3`.

**A whole section by its heading:**

```
xpath://h2[contains(., "Release notes")]/following-sibling::*[1]
```

## Watching an attribute instead of the text

End a line with a space and `@name` to watch the value of that attribute. Use
this when what matters isn't visible text.

| Line | Watches | Use case |
| --- | --- | --- |
| `a.manual @href` | Where the link points | A download link whose file name has the version in it |
| `a[href] @href` | Every link's address | New or removed pages, new documents in a folder listing |
| `img.hero @src` | The image file | A product photo, a webcam still, a banner |
| `img.hero @currentSrc` | The image actually shown (with `srcset`); only in a hidden tab or live mode, since a downloaded page loads no images | Responsive images |
| `meta[name="description"] @content` | The page description | SEO monitoring |
| `link[rel="canonical"] @href` | The canonical address | SEO monitoring |
| `[data-testid="price"] @data-price` | A data attribute | Sites that put the raw number in a data attribute |
| `input#version @value` | A field's value from the page's HTML | Version numbers shown in read-only fields |

**Example: alert when a new installer is published.**

```
a[href$=".msi"] @href
```

Watched text: `https://vendor.example/downloads/tool-4.2.1.msi`. When it becomes
`tool-4.3.0.msi`, the alert says
"Now: https://vendor.example/downloads/tool-4.3.0.msi · Was: …tool-4.2.1.msi".

**Example: alert when the Buy button changes.** Watch the button's text,
`button.buy`, which goes from `Sold out` to `Add to cart`, and add the rule *New
text* **contains** `add to cart`.

Notes:

- Attribute names are case-insensitive in HTML (`@HREF` = `@href`).
- An attribute that is missing or empty gives no text. Attributes with no
  value, such as `disabled`, always read as empty, so watch the element's text
  instead.
- With the `@name` ending, relative addresses in `href`, `src` and similar are
  made into full addresses. XPath's own `/@href` returns the attribute exactly
  as written.
- Password, hidden and file inputs are never read, and in live mode no form
  field at all is read (it might contain what you typed).
- Attribute values are compared as they are; "Also watch formatting" doesn't
  apply to them.

## Leave out

"Leave out" takes selectors (CSS or `xpath:`, one per line) for parts to remove
from *inside* what you selected. Use it for things that change on every visit.

```
Parts of the page:   #product
Leave out:           .viewers
                     .reviews time
                     xpath://span[contains(., "people are looking")]
```

Common things to leave out: `.ad`, `[class*="banner"]`, `time`,
`.timestamp`, `[aria-live]`, `.carousel`, `.recommendations`, `iframe`.

If you watch the whole page, "Leave out" still works: it removes those parts
from the whole page.

Leaving out is about *elements*. To ignore *lines of text* wherever they appear,
use [Ignore lines containing](ignoring-noise.md#ignore-lines-containing).

## Quick fills

The buttons above the box fill it with a ready-made selector:

| Button | Fills in | Use case |
| --- | --- | --- |
| Whole page | (empty) | Back to the whole page |
| All links | `a[href] @href` | New pages or documents appear in a listing |
| Page title | `title` | Title changes, e.g. a version number in the title |
| Headings | `h1, h2, h3` | The structure of a long document changes |
| Description | `meta[name="description"] @content` | The search-engine description changes |

## JSON paths

When the address returns JSON (an API, a `status.json`), start a line with
`json:` to watch only some values. Paths are a safe subset of JSONPath: they are
parsed, never run as code.

Sample response from `https://api.example/v1/products/42`:

```json
{
  "name": "Trail Runner 3",
  "price": { "amount": 1299, "currency": "USD" },
  "stock": 14,
  "variants": [
    { "size": "9",  "available": true,  "price": 1299 },
    { "size": "10", "available": false, "price": 1299 }
  ],
  "meta": { "last-updated": "2026-11-11T11:42:00Z" }
}
```

| Path | Watched text |
| --- | --- |
| `json:$.price.amount` | `1299` |
| `json:price.amount` | `1299` (the leading `$.` is optional) |
| `json:$.variants[0].available` | `true` |
| `json:$.variants[-1].size` | `10` (negative counts from the end) |
| `json:$.variants[*].available` | `true` and `false`, one per line |
| `json:$.variants[*]` | Each variant, pretty-printed |
| `json:$.price` | `{ "amount": 1299, "currency": "USD" }`, pretty-printed |
| `json:$.meta['last-updated']` | `2026-11-11T11:42:00Z` (brackets for names with `-`, spaces or dots) |
| `json:$.*` | Every top-level value |

Several lines are allowed:

```
json:$.price.amount
json:$.stock
```

Not supported, on purpose: `..` (search at any depth), filters like
`[?(@.price < 100)]` and scripts. Use `[*]` and an alert rule instead.

Rules:

- JSON paths can't be mixed with CSS or XPath lines in the same watch.
- They only work when the page is downloaded (not in a hidden tab or live
  mode), because they read the response itself.
- With no `json:` lines, a JSON response is watched as a whole, pretty-printed.

**Example: alert when stock drops below 5.** `json:$.stock` plus the rule *New
text* **number is less than** `5`.

## Tips for selectors that keep working

Sites change their markup. A selector that relies on less is less likely to
break.

1. **Prefer meaningful names.** `#price`, `[data-testid="price"]`,
   `[itemprop="price"]` and `.product-price` are chosen by people and rarely
   change. Classes like `.css-1x2y3z` or `.sc-AxjAm` are generated by build
   tools and change with every release.
2. **Avoid long paths.** `body > div:nth-child(3) > div > div:nth-child(2) > span`
   breaks the day a banner is added. `#product .price` doesn't.
3. **Use text when there's nothing else.**
   `xpath://*[.="Availability"]/following-sibling::*[1]` keeps working through a
   redesign as long as the label says "Availability".
4. **Select a bit more than you need, then filter.** Watch `.price-box` and use
   the [regex filter](regex.md) `\$[\d,.]+` to keep the first price, rather than
   a fragile path to one `span`.
5. **Check the log.** "None of the selected elements were found" means the
   selector no longer matches. Use **Reselect on page** to fix it.

## Testing a selector before you save

Open the page in Chrome, press **F12** to open the developer tools, and in the
**Console** type:

```js
document.querySelectorAll('.price-box span:not(.viewers)')
```

for CSS, or

```js
$x('//td[.="10"]/following-sibling::td[1]')
```

for XPath. The console lists what matches. Hovering a result highlights it on the
page.

Keep in mind that by default the extension reads the page **without running its
scripts**. If an element only appears after scripts run, it exists in the
console but not in the downloaded page. To check, press **Ctrl+U** (view
source) and search for the text. If it isn't there, switch the watch to
[a hidden tab](loading-pages.md#hidden-tab).
