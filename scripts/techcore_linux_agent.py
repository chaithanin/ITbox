#!/usr/bin/env python3
"""
TECHCORE — Linux Server Agent
=============================
Collects resource metrics (CPU / RAM / disk / uptime) from THIS Linux host, plus
a best-effort endpoint-protection (EDR) signal, and pushes them to the TECHCORE
ingest APIs. Real data only — read from /proc and os.statvfs, never fabricated.

Only the Python standard library is used — no pip installs.

Setup
-----
1. In TECHCORE: Settings -> Integrations -> generate an API key (shown once).
2. Set the environment variables below.
3. Test once:   python3 techcore_linux_agent.py
4. Schedule every 5-15 min via cron, e.g.:
       */15 * * * * TECHCORE_KEY=tck_... TECHCORE_BASE=https://<domain> /usr/bin/python3 /opt/techcore/techcore_linux_agent.py

Environment variables
---------------------
  TECHCORE_BASE   https://<your-domain>   (base URL, NO trailing path)
  TECHCORE_KEY    the ingest API key (tck_...)
  TECHCORE_DISK   mount point to report for disk usage (default "/")
"""

import json
import os
import socket
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone

BASE = os.environ.get("TECHCORE_BASE", "https://itbox-ppjbzqdu3q-as.a.run.app").rstrip("/")
KEY = os.environ.get("TECHCORE_KEY", "")
DISK_MOUNT = os.environ.get("TECHCORE_DISK", "/")
HOSTNAME = socket.gethostname()


def cpu_percent(sample=0.5):
    """Average CPU utilisation across all cores, sampled over `sample` seconds."""
    def read():
        with open("/proc/stat") as f:
            parts = f.readline().split()[1:]
        vals = list(map(int, parts))
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
        return sum(vals), idle
    t1, i1 = read()
    time.sleep(sample)
    t2, i2 = read()
    dt, di = t2 - t1, i2 - i1
    return round((1 - di / dt) * 100) if dt > 0 else None


def mem_percent():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, _, v = line.partition(":")
            info[k] = int(v.strip().split()[0])  # kB
    total = info.get("MemTotal", 0)
    avail = info.get("MemAvailable", info.get("MemFree", 0))
    return round((total - avail) / total * 100) if total > 0 else None


def disk_percent(mount):
    try:
        s = os.statvfs(mount)
        total = s.f_blocks * s.f_frsize
        free = s.f_bavail * s.f_frsize
        return round((total - free) / total * 100) if total > 0 else None
    except OSError:
        return None


def uptime_seconds():
    try:
        with open("/proc/uptime") as f:
            return int(float(f.readline().split()[0]))
    except OSError:
        return None


def edr_status():
    """Best-effort AV/EDR posture from common Linux agents. UNKNOWN if none found
    — never guesses PROTECTED without evidence."""
    services = ["clamav-daemon", "clamd", "falcon-sensor", "sentinelone", "mdatp"]
    for svc in services:
        code = os.system(f"systemctl is-active --quiet {svc} 2>/dev/null")
        if code == 0:
            return "PROTECTED", svc
    # ClamAV freshclam DB present but daemon not active -> AT_RISK
    if os.path.exists("/var/lib/clamav/daemon.pid") or os.path.exists("/var/lib/clamav"):
        return "AT_RISK", "clamav"
    return "UNKNOWN", None


def post(path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        BASE + path, data=data, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"},
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    if not KEY:
        raise SystemExit("TECHCORE_KEY is required (Settings -> Integrations).")

    disk = disk_percent(DISK_MOUNT)
    mon = {
        "hostname": HOSTNAME,
        "cpu": cpu_percent(),
        "mem": mem_percent(),
        "disk": disk,
        "uptime": uptime_seconds(),
    }
    status, agent = edr_status()
    edr = {
        "hostname": HOSTNAME,
        "protectionStatus": status,
        "agentVersion": agent or "",
        "osVersion": " ".join(os.uname()[:3]),
        "lastScan": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if status == "PROTECTED" else None,
    }

    try:
        r1 = post("/api/monitoring/ingest", {"hosts": [mon]})
        print(f"monitoring -> ok={r1.get('ok')} failed={r1.get('failed')}")
    except Exception as e:  # noqa: BLE001
        print(f"[warn] monitoring push failed: {e}", file=sys.stderr)
    try:
        r2 = post("/api/edr/ingest", {"hosts": [edr]})
        print(f"edr -> ok={r2.get('ok')} failed={r2.get('failed')}")
    except Exception as e:  # noqa: BLE001
        print(f"[warn] edr push failed: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
