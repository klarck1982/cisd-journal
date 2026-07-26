import json
import sys
from datetime import datetime, timedelta, timezone


def fail(message, code="bridge_error"):
    print(json.dumps({"ok": False, "error": message, "code": code}))
    raise SystemExit(1)


try:
    import MetaTrader5 as mt5  # type: ignore
except Exception:
    fail(
        "Python package 'MetaTrader5' is not installed on this machine. Install it with: pip install MetaTrader5",
        "mt5_package_missing",
    )


if len(sys.argv) < 2:
    fail("Missing JSON payload for MT5 read-only sync", "mt5_payload_missing")

try:
    payload = json.loads(sys.argv[1])
except Exception as exc:
    fail(f"Invalid JSON payload: {exc}", "mt5_payload_invalid")

login = int(str(payload.get("login") or 0))
server = str(payload.get("server") or "").strip()
password = str(payload.get("password") or "").strip()
terminal_path = str(payload.get("terminalPath") or "").strip()
sync_scope = str(payload.get("syncScope") or "full_readonly").strip()
history_days = int(payload.get("historyDays") or 21)

if not login:
    fail("Investor login is required", "investor_login_required")
if not server:
    fail("Investor server is required", "investor_server_required")
if not password:
    fail("Investor password is required", "investor_password_required")

init_kwargs = {
    "login": login,
    "server": server,
    "password": password,
    "timeout": 60000,
}
if terminal_path.lower().endswith('.exe'):
    init_kwargs["path"] = terminal_path

if not mt5.initialize(**init_kwargs):
    code, description = mt5.last_error()
    fail(f"MetaTrader5 initialize failed: {code} {description}", "mt5_initialize_failed")

try:
    account_info = mt5.account_info()
    if account_info is None:
        code, description = mt5.last_error()
        fail(f"MetaTrader5 account_info failed: {code} {description}", "mt5_account_info_failed")

    positions = []
    if sync_scope in ("account_and_open_positions", "full_readonly"):
      positions = [position._asdict() for position in (mt5.positions_get() or [])]

    deals = []
    if sync_scope == "full_readonly":
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=max(1, history_days))
        deals = [deal._asdict() for deal in (mt5.history_deals_get(start, now) or [])]

    terminal_info = mt5.terminal_info()
    result = {
        "ok": True,
        "account": account_info._asdict(),
        "positions": positions,
        "deals": deals,
        "terminal": terminal_info._asdict() if terminal_info else {},
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }
    print(json.dumps(result, ensure_ascii=False))
finally:
    mt5.shutdown()
