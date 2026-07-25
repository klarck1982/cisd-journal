# CISD Journal

Private Windows desktop Trading Performance & Discipline OS for CISD signals, prop-firm accounts, manual trades, FundedNext reports, MT5 reports, Backtest Replay, and analytics.

## Highlights
- FundingPips / FundedNext account separation and challenge tracking.
- JForex CISD CSV watcher.
- Manual trade journal with notes, tags, signal links, and before/after chart images.
- FundedNext CSV importer, folder watcher, open positions, and duplicate Ticket protection.
- MT5 detailed report importer (HTML/CSV).
- Backtest Capture and Replay.
- Risk, drawdown, calendar, heatmap, session, source, instrument, and monthly analytics.
- Local backup / restore / reset, user guide, onboarding, and Windows installer configuration.

## Important privacy rules
- Do not commit API keys, MT5 credentials, report files, account URLs, or local journal data.
- News API keys are entered locally by the user after installation.
- The application never opens, modifies, closes, or copies a trade.

## Development
```bash
npm ci
npm test
npm run dist:win
```

See `docs/INSTALLATION.md`, `docs/CISD_Journal_User_Guide.html`, `QA_REPORT.md`, and `RELEASE_CHECKLIST.md`.
