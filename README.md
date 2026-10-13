# Open Page Watcher

An open-source, security-conscious Chrome extension that watches web pages for
changes and alerts you, similar to Distill Web Monitor.

## Why

Popular page-monitoring extensions ask for access to every site, sync your data
to vendor servers and ship code you can't easily audit, which makes them hard to
approve for use at work. Open Page Watcher aims to give you the same core
features with:

- No servers, accounts, analytics or telemetry. Everything stays in your browser.
- Access to a site only when you add a watch for it, released when you remove it.
- No remote code, no build step and no third-party dependencies, so the code in
  this repository is exactly what runs.

This is a clean-room implementation written from scratch. It contains no code
from Distill or any other proprietary extension.

## Status

Under active development. See [docs/SPEC.md](docs/SPEC.md) for the planned
features and security model.

## License

[MIT](LICENSE)
