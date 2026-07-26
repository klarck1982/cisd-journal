# Windows Live Validation Checklist

## Goal
Validate that the packaged CISD Journal Windows EXE behaves correctly in real-world usage.

---

## Build & packaging
- [ ] `npm ci`
- [ ] `npm run build:bridge:win`
- [ ] Confirm file exists: `bridges/mt5_readonly_sync.exe`
- [ ] `npm test`
- [ ] `npm run dist:win`
- [ ] Install generated Windows EXE / installer

---

## Packaging validation
- [ ] App launches normally after installation
- [ ] `docs` resources are available in packaged app
- [ ] `bridges/mt5_readonly_sync.exe` is present in packaged `resources`
- [ ] Runtime readiness inside app reports bundled bridge as available

---

## FundingPips Shared Dashboard validation
- [ ] Configure Funding Access mode = Shared Dashboard URL
- [ ] Save settings
- [ ] Click Sync funding data
- [ ] Verify app updates:
  - [ ] balance
  - [ ] equity
  - [ ] account owner
  - [ ] score
  - [ ] win ratio
  - [ ] profit factor
- [ ] Verify no security checkpoint blocks sync in packaged runtime

---

## FundedNext Investor Pass validation
- [ ] Configure Funding Access mode = Investor Pass
- [ ] Enter:
  - [ ] login / account number
  - [ ] server
  - [ ] investor password
- [ ] Save settings
- [ ] Choose MT5 terminal shortcut / executable
- [ ] Click Sync funding data
- [ ] Verify app updates:
  - [ ] current balance
  - [ ] synced equity
  - [ ] open positions
  - [ ] recent imported deals
- [ ] Verify duplicate closed deals are not re-imported on second sync

---

## UX validation
- [ ] Status messages are understandable
- [ ] Sync failure messages are understandable
- [ ] Disabled sync/open buttons behave correctly
- [ ] Overview reflects synced funding data clearly enough for trader workflow

---

## Regression checks
- [ ] CSV live signal watcher still works
- [ ] Manual journaling still works without signal link
- [ ] Backtest creation still works from same CSV
- [ ] Analytics still load after funding sync
- [ ] Backup / restore still work after funding sync

---

## Exit criteria
The Windows packaged app can be considered ready for a real private alpha when:
- all packaging checks pass
- FundingPips shared sync works
- FundedNext Investor Pass sync works on real MT5 terminal
- no critical regressions appear in signals / journal / analytics / backtest
