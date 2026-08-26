#!/usr/bin/env python3
"""
TECHCORE — Synology collector
=============================
Runs INSIDE your network (a PC/server that can reach the NAS, or the NAS itself
via DSM Task Scheduler). It logs into DSM, reads Storage volume usage and Active
Backup for Business task status, and PUSHes them to the TECHCORE IT Support
Report ingest API. No inbound access to the NAS is required.

Setup
-----
1. In TECHCORE: Settings -> Integrations -> generate an API key (shown once).
2. Set the environment variables below (or edit the CONFIG defaults).
3. Run:  python3 techcore_synology_collector.py
4. Schedule it daily (DSM Control Panel -> Task Scheduler -> User-defined script,
   or a cron job / Windows Task Scheduler).

Only the Python standard library is used — no pip installs needed.

Environment variables
----------------------
  DSM_HOST        e.g. 192.168.2.10       (NAS LAN address)
  DSM_PORT        5000 (http) or 5001 (https)   default 5000
  DSM_HTTPS       "1" to use https              default "0"
  DSM_VERIFY_SSL  "0" to skip cert verify (self-signed)   default "1"
  DSM_USER        a DSM account with read access
  DSM_PASS        its password  (or DSM_OTP for 2FA one-time code)
  DSM_OTP         optional 6-digit 2FA code
  TECHCORE_URL    https://<your-domain>/api/it-report/ingest
  TECHCORE_KEY    the ingest API key (tck_...)
"""

import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

CONFIG = {
    "DSM_HOST": os.environ.get("DSM_HOST", "192.168.1.10"),
    "DSM_PORT": os.environ.get("DSM_PORT", "5000"),
    "DSM_HTTPS": os.environ.get("DSM_HTTPS", "0") == "1",
    "DSM_VERIFY_SSL": os.environ.get("DSM_VERIFY_SSL", "1") == "1",
    "DSM_USER": os.environ.get("DSM_USER", ""),
    "DSM_PASS": os.environ.get("DSM_PASS", ""),
    "DSM_OTP": os.environ.get("DSM_OTP", ""),
    "TECHCORE_URL": os.environ.get("TECHCORE_URL", "https://example.com/api/it-report/ingest"),
    "TECHCORE_KEY": os.environ.get("TECHCORE_KEY", ""),
}

# Storage thresholds (percent used) — must match the app: <70 green, 70-85 amber, >85 red
def storage_status(used_pct):
    if used_pct > 85:
        return "CRITICAL"
    if used_pct >= 70:
        return "WARNING"
    return "NORMAL"


def _ssl_ctx():
    if CONFIG["DSM_HTTPS"] and not CONFIG["DSM_VERIFY_SSL"]:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    return None


def _base():
    scheme = "https" if CONFIG["DSM_HTTPS"] else "http"
    return f"{scheme}://{CONFIG['DSM_HOST']}:{CONFIG['DSM_PORT']}"


def dsm_get(path, params):
    url = f"{_base()}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "techcore-collector"})
    with urllib.request.urlopen(req, timeout=30, context=_ssl_ctx()) as r:
        return json.loads(r.read().decode("utf-8"))


def login():
    params = {
        "api": "SYNO.API.Auth", "version": "6", "method": "login",
        "account": CONFIG["DSM_USER"], "passwd": CONFIG["DSM_PASS"],
        "session": "ActiveBackup", "format": "sid",
    }
    if CONFIG["DSM_OTP"]:
        params["otp_code"] = CONFIG["DSM_OTP"]
    data = dsm_get("/webapi/auth.cgi", params)
    if not data.get("success"):
        raise SystemExit(f"DSM login failed: {data}")
    return data["data"]["sid"]


def logout(sid):
    try:
        dsm_get("/webapi/auth.cgi", {"api": "SYNO.API.Auth", "version": "1", "method": "logout", "session": "ActiveBackup", "_sid": sid})
    except Exception:
        pass


def collect_storage(sid):
    """Volume usage via SYNO.Storage.CGI.Storage.load_info -> STORAGE checks."""
    checks = []
    try:
        data = dsm_get("/webapi/entry.cgi", {"api": "SYNO.Storage.CGI.Storage", "version": "1", "method": "load_info", "_sid": sid})
        vols = (data.get("data") or {}).get("volumes") or []
        for v in vols:
            name = v.get("id") or v.get("display_name") or "Volume"
            total = float(v.get("size", {}).get("total", 0) or 0)
            used = float(v.get("size", {}).get("used", 0) or 0)
            used_pct = round(used / total * 100) if total > 0 else 0
            checks.append({
                "category": "STORAGE",
                "name": f"NAS {name}",
                "status": storage_status(used_pct),
                "mode": "AUTO",
                "healthPercent": used_pct,
                "metrics": {"usedPercent": used_pct, "totalTB": round(total / 1e12, 2), "usedTB": round(used / 1e12, 2)},
                "note": f"{used_pct}% used",
            })
    except Exception as e:
        print(f"[warn] storage collect failed: {e}", file=sys.stderr)
    return checks


def collect_backup(sid):
    """Active Backup for Business task status -> BACKUP checks.

    ABB's API is version-dependent; this uses the common task list endpoint and
    degrades gracefully if unavailable (storage is still reported)."""
    checks = []
    now = datetime.now(timezone.utc)
    try:
        data = dsm_get("/webapi/entry.cgi", {
            "api": "SYNO.ActiveBackup.Task", "version": "1", "method": "list", "_sid": sid,
        })
        tasks = (data.get("data") or {}).get("tasks") or (data.get("data") or {}).get("task") or []
        for t in tasks:
            name = t.get("task_name") or t.get("name") or f"Task {t.get('task_id', '')}"
            last = t.get("last_backup_time") or t.get("last_bkp_end_time") or 0
            result = (t.get("last_result") or t.get("status") or "").lower()
            status = "NORMAL"
            note = ""
            if last:
                age_h = (now.timestamp() - float(last)) / 3600.0
                if age_h > 48:
                    status = "CRITICAL"
                elif age_h > 24:
                    status = "WARNING"
                note = f"last backup {round(age_h)}h ago"
            if any(k in result for k in ("fail", "error")):
                status = "CRITICAL"
                note = (note + " · " if note else "") + f"result={result}"
            checks.append({
                "category": "BACKUP",
                "name": name,
                "status": status,
                "mode": "AUTO",
                "metrics": {"lastBackupEpoch": last, "result": result},
                "note": note,
            })
    except Exception as e:
        print(f"[warn] ABB collect failed (report will still include storage): {e}", file=sys.stderr)
    return checks


def push(checks):
    body = json.dumps({
        "source": "synology",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "checks": checks,
    }).encode("utf-8")
    req = urllib.request.Request(
        CONFIG["TECHCORE_URL"], data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {CONFIG['TECHCORE_KEY']}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    for k in ("DSM_USER", "DSM_PASS", "TECHCORE_KEY"):
        if not CONFIG[k]:
            raise SystemExit(f"Missing required config: {k}")
    sid = login()
    try:
        checks = collect_storage(sid) + collect_backup(sid)
    finally:
        logout(sid)
    if not checks:
        raise SystemExit("No data collected — check DSM permissions/API versions.")
    result = push(checks)
    print(f"Pushed {len(checks)} checks -> ingested ok={result.get('ok')} failed={result.get('failed')}")


if __name__ == "__main__":
    main()
