# Loading pages

Before a page can be compared, it has to be read. This page explains the three
ways Open Page Watcher reads pages, which one to pick, what happens with pages
behind a sign-in, and how PDFs, feeds, JSON and plain text are handled.

All of these settings are under **How to load the page** in the watch editor.

## Download (the default)

"Download the page without running its scripts (safer, faster)."

The page is downloaded like a browser would, and its HTML is read without
running any of its scripts and without loading its images, styles or ads.

- **Fast and light:** no window opens, no scripts run, nothing else is
  downloaded.
- **Safe:** the page's code never runs, so it can't do anything.
- **Private by default:** your cookies are not sent (see below), so the site
  sees an anonymous visitor.

**Works for:** most news, blog, documentation, store, government and status
pages; anything where "View page source" (Ctrl+U) shows the text you want.

**Doesn't work for:** pages that build their content with JavaScript after
loading, such as many dashboards, single-page apps and some stores. For those,
use a hidden tab.

## Hidden tab

"Open it in a hidden window so its scripts run (for dynamic pages)."

The page opens in a hidden, minimized window, its scripts run, the extension
waits a few seconds, reads the page, and closes the window.

- **Wait after load (seconds):** how long to wait after the page loads before
  reading it, 0 to 60 (default 3). Raise it for slow apps that keep loading
  after the page itself has loaded.
- **Include content inside frames on the page:** also read embedded frames
  (only from sites you allowed). Useful for pages that embed a widget or
  report from another address.
- The hidden tab uses your normal Chrome profile, so you're **signed in** as
  you would be in a normal tab.

**Works for:** pages built with JavaScript; pages that need you to be signed
in; pages that show the content only after a script checks your browser.

**Costs:** slower, uses more memory, and runs the site's own code (as visiting it
would). Your organization can turn this mode off.

**Example:** an internal dashboard at `https://grafana.intranet.example/d/abc`
shows "Loading…" when downloaded. Switch to a hidden tab with a 5-second wait
and select the panel's value.

## Live mode

"Also check instantly while the page is open in a tab."

When this is on and you have the page open in a tab, the extension notices the
moment the tab's content changes and reads it straight away, as well as on the
normal schedule.

- It reads the tab you already have open; nothing extra is loaded.
- It never reads form fields or editable areas (they might contain what you
  typed), and never reads incognito tabs.
- If the tab moves to a different page, the check is dropped.

**Use case:** a support queue, an auction, a build status or a booking page you
keep open anyway. You hear about changes within seconds instead of at the next
scheduled check.

## Which one should I use?

| Situation | Use |
| --- | --- |
| The text you want is in "View page source" | Download |
| "View page source" shows `<div id="root"></div>` and lots of scripts | Hidden tab |
| The page needs you to be signed in, and Download with cookies doesn't work | Hidden tab |
| You have the page open all day and want instant alerts | Either, plus Live mode |
| You watch a JSON API with `json:` paths | Download (required) |
| Your organization forbids running page scripts | Download |

## Pages that only work with scripts

Every watch starts with Download. If the downloaded page is only a placeholder
("Your browser is not supported", "Please enable JavaScript"), an empty app
shell (`#root`, `#app` and similar empty), or the parts you selected are missing
from a near-empty page full of scripts, **nothing is saved**. Instead you're
asked once, for that watch, what to do:

- **Read it in a hidden tab** (switches the watch to hidden-tab mode),
- **Try with my cookies** (some sites only send the real page to signed-in
  users),
- **Keep it as downloaded** (save what downloading gives and stop asking).

The first version read the new way is a new starting point and doesn't alert.
Untick **Ask me before using a hidden tab if the page needs its scripts** to
turn the question off for a watch.

## Pages behind a sign-in

### Cookies

"Send my cookies for this site" is **off** by default, so checks don't carry your
signed-in session. When it's on, your cookies for that site are sent with the
check, exactly as when you visit the page yourself. Cookies only ever go to the
watched page's own site.

"Turn this on by itself if the page asks me to sign in" (on by default): when a
check without cookies lands on a sign-in page, it's tried once more with your
cookies. If that gets past the sign-in page, cookies stay on for that watch and
the check log says so. If not, nothing changes.

### How a sign-in page is spotted

A check counts as "sign in needed" when:

- the site answers **401 Unauthorized**,
- it redirects to an address that looks like a sign-in page (`/login`,
  `/sign-in`, `/oauth/authorize`, `accounts.…`, `….okta.com` and so on),
- it redirects to a single sign-on site you haven't allowed, or
- a password or username field shows up where the watched content should be.

Sign-in pages are **never saved as a version**, so you don't get a "change"
that's really just a login form.

### If the page asks me to sign in

Choose what happens, once, until a check gets through again:

| Choice | What happens |
| --- | --- |
| Send me a notification (default) | A notification; click it to open the page and sign in |
| Open the page in a new tab so I can sign in | The page opens; once you're signed in, it's checked again |
| Pause the watch until I sign in | The watch pauses, and resumes after the next successful check |
| Do nothing | It only shows in the inbox |

The watch shows a banner with buttons to sign in, try with cookies, or read the
page in a hidden tab.

**Example:** you watch a ticket in your company's issue tracker. Checks run
without cookies, hit the single sign-on page, and are retried with cookies,
which works because you're signed in to the tracker in Chrome. From then on the
watch sends cookies. When your session expires on Monday morning you get one
notification; you sign in, and the watch carries on by itself.

## Site access

Chrome only lets the extension read sites you allow. When you add a watch,
Chrome asks for access to that site (for example `https://example.com/*`).

- Watches on sites you haven't allowed show an **Allow** button.
- Access is given back when you delete the last watch on that site, and unused
  access is cleaned up when Chrome starts.
- A redirect must stay on the same site or go to a site you allowed.
- Your organization may allow or block sites; see [For IT teams](enterprise.md).

## What kinds of addresses work

| Content | How it's read | Example |
| --- | --- | --- |
| Web pages (HTML) | Text as shown, one block per line | `https://example.com/pricing` |
| JSON | Pretty-printed, or only the values you pick with [`json:` paths](selectors.md#json-paths) | `https://api.example.com/v1/status` |
| Plain text | As is | `https://example.com/robots.txt`, `…/CHANGELOG.txt` |
| PDF | The text of the document, page by page (up to 20 MB) | `https://example.com/policy.pdf` |
| RSS and Atom feeds | One line per entry: title and link | `https://example.com/blog/feed.xml` |
| XML sitemaps | One line per address | `https://example.com/sitemap.xml` |

Feeds and sitemaps are turned into one line per entry so that a new entry shows
as an added line: combine with the rule *Added text* **is not empty** to be told
only about new posts or new pages.

**Use case:** watch a competitor's `sitemap.xml` to learn when they publish new
pages, before they're linked anywhere.

**Use case:** watch a PDF price list or terms of service that's replaced at the
same address; you see which lines of the PDF changed.

Only `http://` and `https://` addresses can be watched (not `file://`, `ftp://`
or `chrome://`).
