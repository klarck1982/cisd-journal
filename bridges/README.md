# MT5 Readonly Bridge

This folder contains the helper used by the Electron EXE to read MT5 accounts in **read-only** mode.

## Runtime strategy
The desktop app prefers this file when packaged:
- `bridges/mt5_readonly_sync.exe`

If it is not present, development mode can fall back to:
- `bridges/mt5_readonly_sync.py`

## Build the helper EXE on Windows
From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\bridges\build_mt5_bridge.ps1
```

This will:
1. install `PyInstaller` and `MetaTrader5`
2. compile `mt5_readonly_sync.py`
3. copy the resulting EXE back into `bridges/`

## Packaging
`package.json` already includes the `bridges` directory in `extraResources`, so once `bridges/mt5_readonly_sync.exe` exists it can ship with the final Electron installer.
