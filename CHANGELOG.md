# Changelog

All notable changes to CISD Journal are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — backtest replay workspace

- **Live capture during JForex Replay.** Active sessions now poll their
  signals CSV like the live-signals file: a CISD written by the indicator
  appears in the review list ~2s after it prints on the chart, so signals are
  graded as the replay unfolds instead of in a batch afterwards.
- **Two-way indicator bridge.** Backtest reviews and live signal decisions are
  exported to `CISD_Journal_Decisions.csv` next to the signals file. The
  indicator watches that file and draws `✓ ENTERED / × SKIPPED / — IGNORED`
  beside each signal — including inside a running replay. The vocabulary
  matches the indicator source: graded R results map to ENTERED, SKIPPED to
  SKIPPED, MISSED to IGNORED; backtest reviews win over stale live decisions.
- **Filter attribution panel ("best 4 conditions").** Per-filter pass/fail/
  inactive outcome splits (Trend, Fib, MS, HTF, MomVol, Confirmed), grade
  breakdown, an interactive combination comparator, and auto-ranked combo
  leaders by average R.
- **Session lifecycle: edit, delete, capture toggle.** Sessions are editable
  (name, CSV link, filters — re-import prunes out-of-range occurrences while
  preserving reviews), deletable with an explicit confirmation, and the
  creation form is now an on-demand modal instead of a permanent page section.
- **New review vocabulary + equity curve.** SKIPPED is now distinct from
  MISSED (declining a signal is not missing it), every occurrence can be sent
  to the manual journal prefilled, and the session spotlight renders a
  cumulative R equity curve ordered by signal time.
- **Session filter aligned with the indicator.** Asia is now an option and
  "NY"/"Closed" rows normalize to "New York"/"After".

### Fixed — backtest time & identity integrity

- **`SignalTimeNY` was parsed in the machine's local timezone.** The indicator
  stamps signals with a New York wall clock; `new Date()` read it as PC-local
  time, so `signalAt` and the de-dup `occurrenceKey` both baked in the
  trader's timezone (a Singapore PC shifted every signal +12h). Parsing is now
  zone-aware with DST-correct EST/EDT conversion, and date-range filters use
  New York calendar days — identical results on any machine.
- **Symbol filter failed against real indicator files.** The indicator writes
  `XAU/USD` but the filter compared strings literally against `XAUUSD`.
  Symbols are normalized (slashes/dots/case stripped) on both sides.
- **Backtest analytics events were dated by import instant.** Every occurrence
  of a session shared the same `importedAt` timestamp, destroying equity-curve
  chronology. Events now use `signalAt`.
- **Review input validation.** Unknown statuses were persisted verbatim and
  `Number(null)` stored `0` for unscored reviews; statuses are now whitelisted
  (`WIN/LOSS/BE/MISSED/SKIPPED/NEW`), non-scored statuses null the R value,
  and non-finite R is rejected.
- **Archived sessions never disappeared.** The library filtered an
  `item.archived` flag that nothing set; archiving sets `status`, which the
  filter now checks.

### Added — regression coverage

- `qa/backtest-upgrade-tests.js`: NY-time parsing stability across machine
  timezones (incl. DST), symbol/session normalization, decisions-bridge
  vocabulary and priority, factor attribution, `signalAt`-ordered analytics
  events.

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
