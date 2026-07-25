# CISD Journal v1.0.0 — Release Checklist

> لا يتم إصدار النسخة النهائية قبل إكمال البنود الإلزامية أدناه.

## Code & QA
- [x] JavaScript syntax checks.
- [x] Importer tests: FundedNext / MT5 CSV / MT5 HTML.
- [x] Duplicate ticket and open-position tests.
- [x] Store migration / corrupt-recovery tests.
- [x] News-provider normalization tests.
- [ ] Runtime smoke test على Windows.
- [ ] Manual UI navigation test على Windows.

## Data Sources
- [x] JForex CSV architecture.
- [x] FundedNext CSV parser validated using a real sample.
- [ ] FundedNext folder watcher test على Windows.
- [x] FundedNext / MT5-style CSV validated using a real CSV sample.
- [ ] Optional MT5 HTML report validation if a broker export becomes available (not required for v1.0.0).
- [x] FMP Free API key obtained by user (kept private; not shared in chat/GitHub).
- [ ] FMP Free key live request test inside the final Windows application.
- [ ] FundingPips Shared Dashboard policy confirmation.

## Safety & Data
- [x] Atomic local save.
- [x] Data schema migration.
- [x] Backup / Restore flow.
- [x] Account-level reset confirmation.
- [ ] Backup / Restore manual test on Windows.
- [ ] Account isolation manual test on Windows.

## UX & Documentation
- [x] Arabic Help Center foundation.
- [x] Full HTML User Guide.
- [x] First-launch onboarding.
- [x] Premium UI final visual pass.
- [x] Full HTML User Guide and Installation Guide.
- [ ] PDF export of User Guide (available through browser Print → Save as PDF until bundled PDF is generated).

## Windows Release
- [x] Windows unpacked package test.
- [x] NSIS configuration.
- [x] App icon and shortcut configuration.
- [ ] NSIS installer build on Windows GitHub Runner.
- [ ] Install / Desktop shortcut / Start Menu test.
- [ ] Uninstall test.
- [ ] Release notes and version tag.
