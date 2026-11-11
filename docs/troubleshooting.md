# Troubleshooting

Start with the watch's **check log** (bottom of the watch page). It says, for
every check, whether it worked, whether the page changed and whether it
alerted.

## Error messages

| Message | What it means | What to do |
| --- | --- | --- |
| Access to this site has not been granted. Open the watch and click Allow. | Chrome hasn't given the extension access to this site (or it was removed) | Click **Allow** on the watch |
| None of the selected elements were found on the page | Your selectors don't match anything any more, usually after a redesign; or the content only appears once scripts run | Use **Reselect on page** in the editor. If the element exists in the browser but not in "View page source", use a [hidden tab](loading-pages.md#hidden-tab) |
| Selector error: … | A CSS selector or XPath expression isn't valid, or the XPath returns something other than elements, text or attributes (like `count()`) | Fix it in the editor; test it in the console as shown in [Selectors](selectors.md#testing-a-selector-before-you-save) |
| None of the JSON paths matched anything | The `json:` paths point at keys that aren't in the response | Open the address in a tab to see the JSON and check the path, including case |
| JSON path "…": … | The path isn't in the supported subset | See [JSON paths](selectors.md#json-paths) |
| JSON paths only work when the page is downloaded, not opened in a tab | `json:` paths with hidden-tab or live mode | Switch to **Download** and turn live mode off |
| The page asked you to sign in… | The check landed on a sign-in page | Sign in to the site in Chrome, then **Check now**. See [Pages behind a sign-in](loading-pages.md#pages-behind-a-sign-in) |
| The page needs its scripts to run to show its content: … | Downloading gave a placeholder or an empty app shell | Answer the question on the watch: hidden tab, cookies, or keep as downloaded |
| The site answered with HTTP 403 / 404 / 500… | The server refused or failed. 404: the page moved. 403: the site blocks automated visits or needs a sign-in. 429: too many requests | 404: update the address. 403: try **Send my cookies** or a hidden tab. 429 or 5xx: check less often |
| The site took longer than 30 seconds to respond | The site is slow or down | Usually temporary. If it keeps happening, check less often |
| The page took longer than 45 seconds to load | Hidden-tab mode: the page never finished loading | Try Download mode, or a shorter wait |
| The page is larger than 5 MB (20 MB for PDFs) | Too big to read safely | Watch a smaller page or a feed/API instead |
| The watched text is over 2 million characters | The selection is enormous | Select part of the page |
| The page redirected to …, which this watch doesn't have access to | The page sends visitors to another site, often a sign-in site | Usually a sign-in; see above. If the page really moved, change the address |
| The page redirected to a different site | Hidden-tab mode ended up on another site | Same as above |
| The tab no longer shows this page | Live mode: you navigated away while the check ran | Nothing; the next check works |
| Your organization doesn't allow watching … | Your IT policy blocks this site | Ask your IT team; see [For IT teams](enterprise.md) |
| Your organization allows at most N watches | IT policy limit | Delete watches you don't need |
| Invalid regular expression: … | The regex filter, a rule or an ignore entry isn't valid | Fix it; see [Regular expressions](regex.md) |
| Wrong password, or the file is damaged | Importing a protected backup | Check the password; it can't be recovered |

## "It changed but I wasn't alerted"

1. **Is it paused?** Paused watches show in the Paused filter.
2. **Did the check see a change?** In the check log, "changed" means a new
   version was saved.
   - Not changed: the [ignore options](ignoring-noise.md) or the
     [regex filter](regex.md#1-keep-only-text-matching) may be hiding it, or
     the change is outside your selected parts.
3. **Changed but not alerted:** your [alert rules](alerts.md) weren't met.
   Remember "all" needs every rule to hold. Number rules read the **first**
   number in the text.
4. **Alerted but no notification appeared:**
   - Quiet hours or "Combine alerts into one summary" are on (Settings).
   - **Desktop notification** is off for the watch.
   - Chrome isn't allowed to show notifications: check your operating
     system's notification settings for Chrome, and Do not disturb/Focus.
5. **The check hasn't run yet:** it may be outside its "only check during
   certain hours" window, or the computer was asleep. Chrome must be running
   for checks to happen.

## "I get alerts for changes I don't care about"

- Select less of the page, or [leave out](selectors.md#leave-out) the noisy
  part.
- Tick **Dates and times** or **Numbers** under "Don't count it as a change".
- Add the noisy lines to [Ignore lines containing](ignoring-noise.md#ignore-lines-containing).
- Add a rule like **Lines changed is more than** `2`.
- If the page alternates between a few versions, use
  ["Doesn't match any earlier version"](alerts.md#doesnt-match-any-earlier-version).
- If the page shows things in a random order, tick **Order of lines**.

## "The text I see in the browser isn't in the watch"

By default pages are read without running their scripts. Press **Ctrl+U** on the
page (View source) and search for the text. If it isn't there, the page builds it
with JavaScript: switch to **Open it in a hidden window** under "How to load the
page".

## "The number alert reads the wrong number"

Number rules and the chart use the first number in the watched text. Make the
price the first thing in the text (select just it, or use the regex filter).
See [Making sure the right number is read](alerts.md#making-sure-the-right-number-is-read).

## "Checks stopped while my computer was asleep"

Checks run inside Chrome. When the computer sleeps or Chrome is closed, no
checks run; due checks run soon after Chrome is back.

## Still stuck?

[Open an issue](https://github.com/miqueet/open-page-watcher/issues/new) with
the watch's settings (Edit, then copy the fields; leave out private
addresses), the error from the check log, and your Chrome version from
`chrome://version`. Security problems go through
[SECURITY.md](../SECURITY.md) instead.
