# GitHub Publish & Test Guide

## When to publish for testing
You can publish a GitHub test build when all of the following are true:

- `npm test` passes locally
- GitHub Windows workflow can build:
  - app EXE / installer
  - `bridges/mt5_readonly_sync.exe`
- `npm run validate:release:exe` passes on Windows

## Recommended sequence
### 1) Push current branch to GitHub
### 2) Run one of these workflows
- `Build CISD Journal EXE`
- or `CISD Journal Quality Gate`

### 3) Download artifacts
You should see:
- `CISD-Journal-Windows-EXE` or installer artifact
- `CISD-Journal-MT5-Bridge`

### 4) Install and test on Windows
Use:
- `docs/WINDOWS_LIVE_VALIDATION_CHECKLIST.md`

## What must pass before wider testing
### Required
- App launches after install
- FundingPips Shared Dashboard sync works
- FundedNext Investor Pass sync works with the bundled bridge
- No regressions in signals, journal, analytics, or backtest

### After that
The project is ready for:
- private GitHub testing
- limited real-user validation
- closed alpha feedback

## Practical status today
The repository is very close, but real Windows validation is still the decisive step before saying “publish now and test it.”
