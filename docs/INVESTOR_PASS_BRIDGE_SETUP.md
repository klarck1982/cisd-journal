# Investor Pass Bridge Setup

## Purpose
The Investor Pass sync path is designed for **read-only MT5 account synchronization**.

It can pull:
- account balance
- equity
- floating profit
- open positions
- recent deal history

without placing orders.

## Current implementation
CISD Journal is intended to ship as a **Windows EXE product**.

At runtime the packaged app should prefer:
- `bridges/mt5_readonly_sync.exe`

The Python file:
- `bridges/mt5_readonly_sync.py`

is primarily a **development/build source** and fallback path.

To build the packaged helper on Windows, the machine used for building needs:
1. **Python installed**
2. the Python package **MetaTrader5** installed
3. a working MT5 terminal on the machine
4. read-only access credentials:
   - investor login / account number
   - server
   - investor password

## Install command
On the target Windows machine:

```bash
pip install MetaTrader5
```

## Notes
- Credentials are intended to stay **local and encrypted** in the app.
- This path is for **read-only sync only**.
- Shared Dashboard URL remains the easier connector when available.

## Practical status
- FundingPips Shared Dashboard sync has a parser path ready.
- Investor Pass bridge is now scaffolded and mapped into account sync.
- Final real-world validation must be done on a Windows machine with MT5 installed.
