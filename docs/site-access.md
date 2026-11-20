# Site access

Open Page Watcher can only read the sites you allow. Chrome keeps the list, and
the extension asks for one site at a time. The **Site access** page in the
inbox shows that list, which watches depend on each site, and lets you take
access away or give it ahead of time.

Open it with the **Site access** button at the top of the inbox.

## What the page shows

The table has one row per site:

| Column | What it means |
| --- | --- |
| **Site** | The site's address. `https://` is left out; a site reached over plain `http://` shows it, because Chrome treats the two as different sites |
| **Access** | **Allowed by you**: you allowed it on this page, and it stays until you revoke it. **Allowed for watches**: access was asked for when you added a watch; it's given back when no watch uses the site. **Needs access**: a watch uses this site but Chrome doesn't allow it (yet, or any more). **Not used**: allowed, but nothing uses it; it's given back the next time Chrome starts |
| **Watches that use it** | Every watch on that site, as links. Paused watches say so. Long lists fold away after the first five |
| (button) | **Revoke** for sites the extension can read, **Allow** for sites that need access |

When more than one site needs access, **Allow all N sites that need access**
asks for all of them in one Chrome prompt and checks their watches right after.

## Allowing a site before you watch it

Type the site in **Allow a new site** and click **Allow**. Chrome shows its
usual prompt; once you accept, the site stays allowed until you revoke it here,
even while no watch uses it.

You can type the address in any of these forms; they all allow the same site:

| You type | Site allowed |
| --- | --- |
| `example.com` | `https://example.com` (every page on it) |
| `https://example.com/news/today?x=1` | `https://example.com` |
| `http://intranet.local:8080/status` | `http://intranet.local` |

What you can't type: other schemes (`ftp://`, `file://`, `javascript:`),
wildcards like `*.example.com`, or "all sites". Each subdomain is its own site,
so `shop.example.com` and `www.example.com` are allowed separately.

If your organization limits which sites can be watched (see
[For IT teams](enterprise.md)), a blocked site is refused before Chrome is
asked, and a site you allowed earlier is given back at the next browser start
once the policy blocks it.

**Use case: a site behind a sign-in.** Your company's wiki needs you to sign in
and you want to pick an element on a page there with the picker. Allow
`wiki.contoso.com` here first, sign in, then use **Watch part of this page** on
the page you want. The picker no longer stops to ask for access, and the site
stays allowed if you later delete that watch and make a new one.

**Use case: setting up several watches later.** You know you'll be adding watches
for release notes on `docs.vendor.io` next week. Allow it now, while you're
reviewing what the extension can read, so the watches start checking as soon
as you add them.

## Revoking a site

Click **Revoke** on the site's row. A confirmation lists every watch that uses
the site, so you know what stops working:

- The watches stay saved, with all their history. Nothing is deleted.
- Until you allow the site again, their checks fail with "Access to this site
  has not been granted", and each watch shows an **Allow** button.
- **Pause them too** (ticked when any of them are running) pauses those watches
  so they don't keep failing and send you an error alert. Resume them after
  allowing the site again.

Revoking takes effect straight away; Chrome removes the extension's access to
that site. If you remove a site on `chrome://extensions` instead, the page
updates to match.

**Use case: a project ended.** You were watching three pages on a client's
portal. Revoke the portal on this page, leave **Pause them too** ticked, and the
watches keep their history in case the project comes back, while the extension
can no longer read the site.

**Use case: auditing before a security review.** Open **Site access** to see
every site the extension can read, and which watch needs each one. Revoke the
**Not used** ones (they would also go away by themselves at the next browser
start) and anything you no longer want watched.

## Access to all sites (screenshots)

Chrome only lets an extension take a screenshot of a page if it has access to
all sites, so that access is asked for when you turn on screenshot comparison
for a watch (see [HTML and visual changes](html-and-visual-changes.md)). While
it's on, a notice at the top of the page says so, lists how many watches take
screenshots, and has its own **Revoke** button.

While it's on:

- The extension still only reads the sites in the table. Access to all sites
  never counts as access to a site on its own.
- Chrome counts every site as allowed, so a site with watches can't be revoked
  by itself (its **Revoke** button is greyed out). Revoke access to all sites
  first, or turn screenshots off on those watches.
- Revoking it stops screenshots for the listed watches. Sites you allowed while
  it was on may then show **Needs access**, because Chrome didn't record them
  separately; allow them again from this page.

It's given back by itself once no watch takes screenshots.

## Where this is stored

The list of sites you allowed on this page is kept in the extension's local
storage (`keptSites`), on your computer only, next to your watches. It isn't
included in exports, because Chrome only grants access through its own prompt:
after importing watches on another computer, open **Site access** and use
**Allow all** to grant what they need.
