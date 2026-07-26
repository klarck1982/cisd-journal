# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
rather than opening a public issue.

## Threat model

CISD Journal is a local-first desktop application. It has no server, no
account system and no telemetry.

- **Trading data never leaves the machine.** The journal is a JSON file in the
  Electron `userData` directory.
- **Secrets are encrypted at rest** with Electron `safeStorage`, which is
  backed by the OS keychain (DPAPI on Windows). This covers the news API key
  and the MT5 investor-pass password.
- **The app is strictly read-only against a broker.** It never opens, modifies,
  closes or copies a trade. The MT5 bridge is a read-only sync helper.
- **Outbound network access** is limited to the configured news provider and,
  when the user enables it, a prop-firm shared dashboard URL over HTTPS.

## Renderer hardening

- `contextIsolation: true`, with all IPC funnelled through a narrow `preload.js`
  bridge — no `nodeIntegration`.
- A Content-Security-Policy of `default-src 'self'` with `font-src 'self'`;
  fonts are bundled rather than fetched.
- Navigation away from the bundled UI is blocked, and `window.open` is denied;
  external HTTPS links are handed to the system browser.

## Known gaps

- **The Windows installer is unsigned.** A commercial certificate requires a
  registered entity; see `docs/CODE_SIGNING.md`. Until then every release
  publishes `SHA256SUMS.txt` so downloads can be verified.
- **Automatic updates are disabled**, because `electron-updater` will not apply
  unsigned updates.
- **Electron is behind the current major.** Tracked as a pending upgrade;
  `npm audit` reports advisories against the pinned version.

## Never commit

API keys, MT5 credentials, broker reports, account URLs, or any local journal
data. `.gitignore` covers the known filenames, but review diffs before pushing.
