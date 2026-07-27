# Changelog

All notable changes to CISD Journal are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed — data loss and numeric accuracy

- **The daily-loss guard no longer misses evening trades.** `risk.js` resolved
  "today" in the account timezone but bucketed trades with a blind
  `String(x).slice(0, 10)` cut of a UTC timestamp. Any trade closed after
  roughly 20:00 New York carried the next UTC date and dropped out of the
  daily total, so a trader who had already lost 1,500 was shown the full
  2,000 budget as untouched.
- **"Reset account" no longer erases risk limits.** The handler zeroed
  `profitTarget`, `dailyLoss`, `maxDrawdown` and `phase` — none of which the
  confirmation text mentioned. Zeroing `dailyLoss` made the risk engine return
  a `null` limit, silently disarming the guard entirely.
- **Analytics and the calendar now agree on which day a trade belongs to.**
  `analytics.js` had no timezone awareness: day/month buckets, the
  `today`/`month` period filters and the heatmap weekday all ran on UTC.
- **Session classification works for every timestamp format.** `parseHour`
  required a space before the hour, so ISO timestamps and bare dates never
  matched and collapsed into the `After` bucket — every manually logged trade
  landed in one meaningless column.

### Added — entity lifecycles

- Trades can be edited and deleted (`trade:update`, `trade:delete`). Previously
  only add and export existed, so correcting one mistyped R required resetting
  the whole account.
- Accounts can be deleted, with a full cascade over trades, positions,
  backtests, notes, playbooks, import history and per-account signal decisions;
  the folder watcher is closed and the encrypted investor-pass secret removed.
- Accounts can be archived and restored from the UI.
- Playbooks can be edited; the modal previously always cleared its fields.
- Backtest sessions can be finished and archived, and now display their status.
- A first-run welcome wizard (language → account → risk limits → CSV).
  `settings.onboardingComplete` was written by two handlers and read by
  nothing, so "Restart onboarding" reported success and showed no screen.
- A monthly calendar tab, moved out of the analytics page.
- Desktop notifications and a persistent cross-tab banner for risk warnings.
- A ready-to-apply release step publishing `SHA256SUMS.txt`, so an unsigned
  installer can be verified. This was previously documented as done but had
  never been added to the workflow. It is held in
  `docs/PENDING_WORKFLOW_CHANGE.md` because this repository's GitHub App lacks
  the `workflows` permission — a maintainer needs to apply it.

### Changed — design system

- The visual system is now closed: zero raw colour literals outside `:root`
  (down from 218 resolving to 120 distinct values), a six-step type scale
  (from 14), two elevations (from 19).
- **IBM Plex Sans Arabic is bundled** (SIL OFL 1.1), subset by unicode-range.
  The stack previously led with Inter, which carries no Arabic glyphs, so the
  entire Arabic interface silently fell back to Tahoma.
- Explicit `line-height` for Arabic, tabular figures on primary metrics, a
  visible focus ring, `aria-label` on icon-only buttons, and dialog semantics
  on every modal.

### Removed

- Five superseded IPC channels (`funding:url`, `playbook:archive`,
  `signal:result`, `locale:get`, `locale:set`). No orphaned channels remain.

### Testing

- 28 → 31 suites. New: `qa/lifecycle-tests.js` (executes the real IPC handler
  bodies against injected state), `qa/timezone-accuracy-tests.js` (verified to
  fail against the previous implementation), `qa/design-system-tests.js`
  (fails the build if a component reintroduces a hardcoded value).

## [1.0.0]

Initial Windows release. See `docs/RELEASE_NOTES_v1.0.0.md`.
