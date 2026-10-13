# Open Page Watcher for IT teams

This page is for administrators deciding whether to allow Open Page Watcher on
managed Chrome browsers, and how to limit what it can do.

## What it does and doesn't do

- It has no servers, accounts, analytics, telemetry or remote code. The only
  network requests it makes are to the pages a user chose to watch.
- It has no access to any site at install time. Chrome asks the user for access
  to one site at a time, when they add a watch for it. Access is released when
  the last watch on that site is deleted.
- Pages are downloaded and parsed without running their scripts, unless the user
  turns on "render in tab" for a watch.
- Cookies are not sent with checks unless the watch has that turned on, either
  by the user or automatically when a page asks the user to sign in.
  `disableCookies` turns both off.
- All data stays in `chrome.storage.local` on the device. Exports are files the
  user saves themselves, and can be password protected (AES-256-GCM with a
  PBKDF2-SHA-256 key, 600,000 iterations).

The full security model is in [SPEC.md](SPEC.md#security-model). The code has no
build step and no dependencies, so what is in this repository is exactly what
runs.

## Installing for your users

Publish it to your organization from the Chrome Web Store (as a private or
unlisted item), or allow-list or force-install the public item by its ID with
the [`ExtensionSettings`](https://chromeenterprise.google/policies/#ExtensionSettings)
policy. Your users still grant access to each site they watch, unless you also
grant hosts through `ExtensionSettings`.

## Limiting what it can do

The extension reads these settings from Chrome's managed storage
(`managed_schema.json` in the package). They apply to every watch, existing ones
included, at every check. Users see a note in the watch form when options are
set by the organization.

| Setting | Type | Effect |
| --- | --- | --- |
| `allowedSites` | list of strings | Only these sites can be watched. `example.com` also covers its subdomains. |
| `blockedSites` | list of strings | These sites can never be watched. Takes priority over `allowedSites`. |
| `disableCookies` | boolean | Checks never use the user's signed-in session: no cookies are sent, cookies are never turned on automatically for pages that ask for a sign-in, and render-in-tab mode (which loads the page as the user) is off. |
| `disableRenderInTab` | boolean | Pages are only downloaded and parsed; their scripts never run. |
| `disableLiveMode` | boolean | The extension never observes open tabs. |
| `minIntervalMinutes` | integer | Checks run at most this often. Shorter intervals are raised to it. |
| `maxWatches` | integer | Users can't add more watches than this. |

Site entries can be written as `example.com`, `*.example.com`,
`https://example.com/some/path` or with a port; only the host name is used, and
international names match in either form. `*` in `blockedSites` blocks every
site. An entry that isn't a host name matches nothing, so a mistyped allow-list
allows nothing rather than everything. If a watched page redirects, the site it
lands on must be allowed too.

### Google Admin console

Go to **Devices → Chrome → Apps & extensions → Users & browsers**, select the
extension, and paste this into **Policy for extensions**:

```json
{
  "allowedSites": { "Value": ["intranet.example.com", "status.vendor.example"] },
  "blockedSites": { "Value": ["hr.intranet.example.com"] },
  "disableCookies": { "Value": true },
  "disableRenderInTab": { "Value": true },
  "minIntervalMinutes": { "Value": 15 },
  "maxWatches": { "Value": 50 }
}
```

### Windows (registry)

Settings go under the extension's ID:

```
HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome\3rdparty\extensions\<extension-id>\policy
  disableCookies       REG_DWORD  1
  minIntervalMinutes   REG_DWORD  15
HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome\3rdparty\extensions\<extension-id>\policy\allowedSites
  1                    REG_SZ     intranet.example.com
  2                    REG_SZ     status.vendor.example
```

### macOS

Use a configuration profile for the `com.google.Chrome.extensions.<extension-id>`
domain, with the same keys and types as the table above.

### Linux

Create a JSON file in `/etc/opt/chrome/policies/managed/` (or
`/etc/chromium/policies/managed/` for Chromium):

```json
{
  "3rdparty": {
    "extensions": {
      "<extension-id>": {
        "allowedSites": ["intranet.example.com"],
        "disableCookies": true,
        "minIntervalMinutes": 15
      }
    }
  }
}
```

### Checking it worked

Open `chrome://policy` and look for the extension's section, then open the
extension's inbox and click **Add watch**: a note at the top of the form says
some options are set by your organization, and those options are turned off.
