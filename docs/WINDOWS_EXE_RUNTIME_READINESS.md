# Windows EXE Runtime Readiness

## Goal
Ensure CISD Journal behaves as a **Windows EXE product** for the end user, even when internal helper tooling exists.

## Final delivery expectation
The user should install and run:
- `CISD Journal` Windows installer / EXE

They should **not** be required to manually run Python scripts.

## MT5 Investor Pass runtime model
### Preferred packaged runtime
The app expects this bundled helper when packaged:
- `bridges/mt5_readonly_sync.exe`

### Development fallback only
During development, the app may fall back to:
- `bridges/mt5_readonly_sync.py`

This fallback is for development convenience only and is **not** the intended end-user runtime path.

## Packaging requirements
1. Build the helper EXE on Windows.
2. Keep it in:
   - `bridges/mt5_readonly_sync.exe`
3. Ship the `bridges` folder using Electron `extraResources`.
4. Validate packaged runtime can detect the helper EXE.

## Current project state
Implemented:
- packaged bridge path resolution
- Python fallback for development
- runtime readiness checks
- UI handling for bridge-missing packaged state

## Remaining real-world validation
Still required on Windows:
- build helper EXE
- package CISD Journal installer
- verify Investor Pass sync works against MT5 terminal
- verify error handling when bridge or terminal is missing
