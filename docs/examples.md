# Examples and use cases

Step-by-step recipes for common jobs. Each one lists what to put in the watch
editor; anything not mentioned stays at its default. The addresses are
placeholders: use the page you actually want to watch, and adjust the
selectors to match it (the picker can write them for you; see
[Selectors](selectors.md)).

**Shopping and prices**
1. [Price drops below a target](#1-price-drops-below-a-target)
2. [Back in stock](#2-back-in-stock)
3. [Price history for a product](#3-price-history-for-a-product)

**Work and IT**
4. [A vendor's status page](#4-a-vendors-status-page)
5. [New software releases](#5-new-software-releases)
6. [Security advisories mentioning your products](#6-security-advisories-mentioning-your-products)
7. [A JSON health or metrics endpoint](#7-a-json-health-or-metrics-endpoint)
8. [An internal dashboard that needs sign-in](#8-an-internal-dashboard-that-needs-sign-in)
9. [A queue you keep open all day](#9-a-queue-you-keep-open-all-day)
10. [Terms, policies and contracts](#10-terms-policies-and-contracts)
11. [Documentation pages your team relies on](#11-documentation-pages-your-team-relies-on)
12. [Competitors' pricing pages](#12-competitors-pricing-pages)
13. [New pages on a site, via its sitemap](#13-new-pages-on-a-site-via-its-sitemap)
14. [SEO: titles, descriptions and canonical links](#14-seo-titles-descriptions-and-canonical-links)

**Everything else**
15. [Job postings matching a keyword](#15-job-postings-matching-a-keyword)
16. [Appointment or ticket availability](#16-appointment-or-ticket-availability)
17. [Results or grades being published](#17-results-or-grades-being-published)
18. [A blog or news site without a feed](#18-a-blog-or-news-site-without-a-feed)
19. [Government notices and forms](#19-government-notices-and-forms)
20. [A PDF that's replaced at the same address](#20-a-pdf-thats-replaced-at-the-same-address)

---

## 1. Price drops below a target

*You want a laptop, but only below $1,200.*

| Field | Value |
| --- | --- |
| Page address | `https://store.example/laptops/model-x` |
| Parts of the page | The price only, e.g. `.price` or `[itemprop="price"]` (or use the picker) |
| Keep only text matching | `\$[\d,.]+` (if the price element contains other text) |
| When to check | Every 1 hour |
| Alert rule | *New text* **Number is less than** `1200` |
| Pause after the first alert | On, if you only want to hear once |
| Play a sound | On, pick **Rising** |

Notification when it happens: **"Went down from $1,249 to $1,199 (−4.0%)"**.

Variations:

- Any drop at all: rule **Number decreased** instead.
- Only big drops: **Number decreased by more than %** `10`.
- Price *rises* above a level (selling, or budget alarms): **Number is more
  than**.
- The page shows several numbers ("Only 3 left at $1,299"): make sure the price
  is the first number; see [Making sure the right number is read](alerts.md#making-sure-the-right-number-is-read).

## 2. Back in stock

*A sold-out item; you want to know the moment it's back.*

| Field | Value |
| --- | --- |
| Parts of the page | The availability text, e.g. `.availability` or `xpath://*[contains(., "stock")][not(*)]` |
| When to check | Every 5 minutes, only 07:00 to 23:00 |
| Alert rule | *New text* **contains** `in stock` (or **doesn't contain** `sold out`) |
| Pause after the first alert | On |
| Desktop notification + sound | On, sound **Alarm** |
| Read the change aloud | On, if you're away from the screen |

If the store builds the page with JavaScript, you'll be asked to read it in a
hidden tab the first time; say yes. See [Loading pages](loading-pages.md#pages-that-only-work-with-scripts).

Variation, **a specific size**: watch the size selector's entry with XPath,
`xpath://li[.//span[.="10"]]`, and alert when it **doesn't contain**
`unavailable`.

## 3. Price history for a product

*You aren't buying yet, but want to know the usual price.*

| Field | Value |
| --- | --- |
| Parts of the page | The price |
| When to check | Every 6 hours |
| Desktop notification | Off (just collect) |
| Versions to keep | 200 |

After a few weeks the watch page shows a [chart](reviewing-changes.md#the-number-chart)
of the price, and **Download CSV** gives you the data for a spreadsheet.

## 4. A vendor's status page

*Your team depends on a vendor's service and you want to know about incidents
before users report them.*

| Field | Value |
| --- | --- |
| Page address | `https://status.vendor.example` |
| Parts of the page | The component list or overall status, e.g. `.components-section` |
| Ignore | **Dates and times** ticked; Ignore lines containing `Last updated` |
| When to check | Every 5 minutes |
| Alert rules | **Any** of: *new text* **matches regex** `degraded\|outage\|maintenance\|investigating`; *new text* **doesn't contain** `operational` |
| Sound | **Alarm** |
| Doesn't match any earlier version | Optional, to avoid alerts when it flips back and forth |

Many status pages also offer a feed (`/history.rss`) or JSON
(`/api/v2/status.json`); watching those is lighter. For the JSON:
`json:$.status.indicator` gives `none`, `minor`, `major` or `critical`; alert when
*new text* **doesn't contain** `none`.

## 5. New software releases

*Know when a new version of a tool you deploy is out.*

Option A, the download page:

| Field | Value |
| --- | --- |
| Page address | `https://vendor.example/downloads` |
| Parts of the page | `a[href$=".msi"] @href` (or `.exe`, `.dmg`, `.tar.gz`) |
| When to check | Every day |

Notification: **"Now: https://vendor.example/dl/tool-4.3.0.msi · Was: …tool-4.2.1.msi"**.

Option B, release notes:

| Field | Value |
| --- | --- |
| Parts of the page | The newest entry, e.g. `.release:first-of-type h2` |
| Keep only text matching | `\d+\.\d+\.\d+` |
| Alert rule | *Added text* **matches regex** `^(4\|5)\.` for major versions 4 and 5 only |

Option C, a feed: many projects publish releases as Atom feeds (for a GitHub
project: `https://github.com/OWNER/REPO/releases.atom`). Watch the feed address
with no selectors and the rule *Added text* **is not empty**.

## 6. Security advisories mentioning your products

| Field | Value |
| --- | --- |
| Page address | The vendor's advisory list or its RSS feed |
| Alert rules | **All** of: *added text* **is not empty**; *added text* **matches regex** `\b(ProductA\|ProductB\|Gateway 9)\b` |
| When to check | Every 1 hour |
| Sound | **Three beeps** |

Only new advisories that name your products alert; everything else is saved
silently in the history.

## 7. A JSON health or metrics endpoint

*An API that returns `{"status":"ok","queue":{"depth":12},"p95_ms":180}`.*

| Field | Value |
| --- | --- |
| Page address | `https://api.example.internal/health` |
| Parts of the page | `json:$.status` |
| When to check | Every 2 minutes |
| Alert rule | *New text* **doesn't contain** `ok` |

A second watch on the same address for the queue:

| Field | Value |
| --- | --- |
| Parts of the page | `json:$.queue.depth` |
| Alert rule | *New text* **Number is more than** `100` |

`json:` paths need **Download** mode. See [JSON paths](selectors.md#json-paths).

## 8. An internal dashboard that needs sign-in

| Field | Value |
| --- | --- |
| Page address | `https://dashboards.intranet.example/team/42` |
| How to load the page | Open it in a hidden window, wait 5 seconds |
| Parts of the page | The panel you care about (use the picker) |
| If the page asks me to sign in | Open the page in a new tab so I can sign in |

When your single sign-on session expires, a tab opens for you to sign in once,
and the watch carries on. See [Pages behind a sign-in](loading-pages.md#pages-behind-a-sign-in).

If your organization doesn't allow hidden tabs, try **Download** with **Send my
cookies** on.

## 9. A queue you keep open all day

| Field | Value |
| --- | --- |
| Page address | Your support or review queue |
| Parts of the page | The list of items, e.g. `table.queue tbody` |
| Also check instantly while the page is open in a tab | On |
| Alert rule | *Added text* **is not empty** |
| Sound | **Doorbell** |

You're told within seconds of a new item while the tab is open, and on the
normal schedule while it isn't.

## 10. Terms, policies and contracts

*Track wording changes in a supplier's terms of service or data processing
agreement.*

| Field | Value |
| --- | --- |
| Parts of the page | The document body, e.g. `main article` |
| Leave out | `.last-updated, nav, footer` |
| Ignore | **Spacing** ticked |
| Also watch formatting | On, if headings and emphasis matter |
| When to check | Every 1 day |
| Versions to keep | 200 |
| Alert rule | **Lines changed is more than** `0` (any real change); or more than `2` to skip typo fixes |

Review in **Side by side** view. **Download CSV** keeps a dated record of each
version.

## 11. Documentation pages your team relies on

*An API's rate limits, a cloud provider's quotas, an "end of support" date.*

| Field | Value |
| --- | --- |
| Parts of the page | The table or section, e.g. `xpath://h2[contains(., "Rate limits")]/following-sibling::table[1]` |
| When to check | Every 1 day |
| Labels | `docs` |

XPath with the heading text keeps working when the page is rearranged.

## 12. Competitors' pricing pages

Use **Add several** with all the addresses, label `competitors`, check daily.
Then edit each watch:

| Field | Value |
| --- | --- |
| Parts of the page | The plans table |
| Ignore lines containing | `/^Save \d+%/i` (rotating promo badges) |
| Alert rule | **Lines changed is more than** `1` |
| Combine alerts into one summary | On (in Settings), every day |

## 13. New pages on a site, via its sitemap

| Field | Value |
| --- | --- |
| Page address | `https://competitor.example/sitemap.xml` |
| Parts of the page | (empty) |
| Ignore | **Order of lines** ticked |
| Alert rule | *Added text* **is not empty** |
| When to check | Every 1 day |

Each address is one line, so the alert says **"Added: https://competitor.example/products/new-thing"**.
Add *added text* **contains** `/blog/` to be told only about new blog posts.

## 14. SEO: titles, descriptions and canonical links

| Field | Value |
| --- | --- |
| Parts of the page | `title`<br>`meta[name="description"] @content`<br>`link[rel="canonical"] @href`<br>`meta[name="robots"] @content`<br>`h1` |
| When to check | Every 1 day |

Catches accidental `noindex`, lost canonical tags and edited titles after a
deployment.

## 15. Job postings matching a keyword

| Field | Value |
| --- | --- |
| Page address | The careers page, filtered to your department if it has a filter |
| Parts of the page | The list of job titles, e.g. `.job-listing .title` |
| Ignore | **Order of lines** ticked |
| Alert rules | **All** of: *added text* **is not empty**; *added text* **matches regex** `engineer\|developer` |
| When to check | Every 3 hours |

Removed jobs are recorded without alerting; new ones matching your words alert.

## 16. Appointment or ticket availability

| Field | Value |
| --- | --- |
| Parts of the page | The availability area, e.g. `#calendar` |
| When to check | Every 2 minutes (or **random between 2 and 5 minutes**) |
| Only check during certain hours | Office hours, if bookings only open then |
| Alert rule | *New text* **doesn't contain** `no appointments available` |
| Pause after the first alert | On |
| Sound and read aloud | On |

## 17. Results or grades being published

| Field | Value |
| --- | --- |
| Parts of the page | The results section, or the whole page |
| Ignore | **Dates and times** |
| When to check | Every 15 minutes |
| Pause after the first alert | On |

If the results page needs a sign-in, see [Pages behind a sign-in](loading-pages.md#pages-behind-a-sign-in).

## 18. A blog or news site without a feed

| Field | Value |
| --- | --- |
| Parts of the page | The headlines, e.g. `article h2 a` |
| Alert rule | *Added text* **is not empty** |
| Labels | `reading` |

For links instead of titles, use `article h2 a @href`.

## 19. Government notices and forms

*A visa fee page, a regulation that's being updated, a form version.*

| Field | Value |
| --- | --- |
| Parts of the page | The fee table or "Edition date" line |
| Keep only text matching | `Edition (\d{2}/\d{2}/\d{2})` for a form's edition date |
| When to check | Every 1 day |

## 20. A PDF that's replaced at the same address

| Field | Value |
| --- | --- |
| Page address | `https://example.org/files/price-list.pdf` |
| Parts of the page | (empty; selectors don't apply to PDFs) |
| Keep only text matching | Optional, e.g. `Part \d+\s+\$[\d,.]+` for prices |
| When to check | Every 1 day |

The PDF's text is compared line by line. PDFs up to 20 MB are supported. Scanned
PDFs (images of text) have no text to read.

---

Have a use case that isn't covered?
[Open a feature request](https://github.com/miqueet/open-page-watcher/issues/new?template=feature_request.yml)
or [an issue](https://github.com/miqueet/open-page-watcher/issues/new).
