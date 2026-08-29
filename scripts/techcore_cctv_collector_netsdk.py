#!/usr/bin/env python3
"""
TECHCORE CCTV Collector — Dahua NetSDK edition (P2P + direct IP).
================================================================
For fleets where the recorders are reachable only via Dahua P2P (viewed through
SmartPSS), not by LAN IP. Runs on ONE machine (e.g. the head-office PC that runs
SmartPSS) and reaches every recorder — including remote-province sites — through
the same P2P channel SmartPSS uses, then pushes health to TECHCORE.

Requires the official Dahua Python NetSDK ("General_NetSDK_Eng_Python...") on
this machine, with its native libs (dhnetsdk.dll / .so) on the library path.
    from NetSDK.NetClient import NetClient
    from NetSDK.SDK_Struct import *
    from NetSDK.SDK_Enum import *

This is PHASE 1: it proves login (recorder ONLINE/OFFLINE/AUTH_ERROR) and reads
device info (model, serial, channel count) per recorder, creates the channels,
and pushes to /api/cctv/ingest. HDD / recording-search / snapshot come next once
login is confirmed working against your devices.

Credentials + how to reach each device come from cctv_targets.json:
{
  "defaults": { "username": "admin", "password": "REDACTED" },
  "targets": {
    "AA0C276PAZ5B1AC": { "mode": "ip",  "host": "192.168.2.11", "port": 37777 },
    "7B06FEEPAZ8E607": { "mode": "p2p" }                        // remote site, by serial
  }
}
mode defaults to "p2p" when no host is given, "ip" when a host is present.

Usage:
  set TECHCORE_URL / TECHCORE_KEY, then:
  python techcore_cctv_collector_netsdk.py --once --verbose \
      --devices device.xml --targets cctv_targets.json
"""
import argparse, json, os, sys, time, urllib.request, urllib.error
from ctypes import sizeof, POINTER, cast, c_char
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

# --- Dahua NetSDK imports (fail loudly with install guidance) ---------------
try:
    from NetSDK.NetClient import NetClient
    from NetSDK.SDK_Struct import (
        NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY,
        NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY,
    )
    from NetSDK.SDK_Enum import EM_LOGIN_SPAC_CAP_TYPE
except Exception as e:  # noqa: BLE001
    print("ERROR: Dahua Python NetSDK not found on this machine.", file=sys.stderr)
    print("Install the 'General_NetSDK_Eng_Python' package and put its native libs on PATH.", file=sys.stderr)
    print("Import error:", e, file=sys.stderr)
    sys.exit(2)


def log(v, *a):
    if v:
        print("[netsdk]", *a, file=sys.stderr)


def cstr(v):
    """Decode a ctypes char buffer / bytes to str."""
    if isinstance(v, bytes):
        return v.split(b"\x00", 1)[0].decode("latin-1", "replace")
    try:
        return bytes(v).split(b"\x00", 1)[0].decode("latin-1", "replace")
    except Exception:
        return str(v)


# --------------------------- device.xml (list) ---------------------------
def parse_device_list(path):
    out = []
    for d in ET.parse(path).getroot().iter("Device"):
        out.append({"name": (d.get("name") or "").strip(), "serial": (d.get("domain") or "").strip()})
    return out


def load_targets(path):
    if not path or not os.path.exists(path):
        return {"defaults": {}, "targets": {}}
    with open(path, "r", encoding="utf-8-sig") as f:
        text = f.read().strip()
    if not text:
        return {"defaults": {}, "targets": {}}
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise SystemExit(f"ERROR: {path} is not valid JSON ({e}).")


# --------------------------- NetSDK login ---------------------------
def _p2p_cap():
    """Return the enum member for P2P login, tolerating naming differences
    across NetSDK versions (P2P / PROXY). Falls back to TCP if none exists."""
    for name in ("P2P", "P2P_LOGIN", "PROXY", "TCP"):
        if hasattr(EM_LOGIN_SPAC_CAP_TYPE, name):
            return getattr(EM_LOGIN_SPAC_CAP_TYPE, name)
    return list(EM_LOGIN_SPAC_CAP_TYPE)[0]


def login_device(sdk, serial, conn, verbose):
    """Return (loginID, device_info, status, error). status in ONLINE/OFFLINE/AUTH_ERROR/UNKNOWN."""
    mode = conn.get("mode") or ("ip" if conn.get("host") else "p2p")
    user = (conn.get("username") or "admin").encode()
    pwd = (conn.get("password") or "").encode()

    inp = NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY()
    inp.dwSize = sizeof(NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY)
    inp.szUserName = user
    inp.szPassword = pwd
    inp.pCapParam = None
    if mode == "ip":
        inp.szIP = (conn.get("host") or "").encode()
        inp.nPort = int(conn.get("port") or 37777)
        inp.emSpecCap = EM_LOGIN_SPAC_CAP_TYPE.TCP
    else:
        # P2P: the device serial goes in szIP and the P2P cap type is used;
        # the SDK routes the connection through Dahua's P2P relay by serial.
        inp.szIP = serial.encode()
        inp.nPort = int(conn.get("port") or 0)
        inp.emSpecCap = _p2p_cap()

    outp = NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY()
    outp.dwSize = sizeof(NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY)
    try:
        login_id, device_info, err = sdk.LoginWithHighLevelSecurity(inp, outp)
    except Exception as e:  # noqa: BLE001
        log(verbose, serial, "login exception:", e)
        return 0, None, "UNKNOWN", str(e)
    if login_id:
        return login_id, device_info, "ONLINE", None
    msg = (err or "").lower()
    status = "AUTH_ERROR" if ("password" in msg or "user" in msg or "locked" in msg) else "OFFLINE"
    return 0, None, status, err


def device_channels(device_info):
    """Best-effort channel count from the login's NET_DEVICEINFO_Ex."""
    for attr in ("nChanNum", "byChanNum", "nChannelNum"):
        n = getattr(device_info, attr, None)
        if isinstance(n, int) and n > 0:
            return n
    return 0


def device_model_serial(device_info):
    model = ""
    for attr in ("sDVRType", "byDVRType", "sSoftWareVersion"):
        v = getattr(device_info, attr, None)
        if v:
            model = cstr(v); break
    serial = ""
    for attr in ("sSerialNumber", "sSerial"):
        v = getattr(device_info, attr, None)
        if v:
            serial = cstr(v); break
    return model, serial


# --------------------------- push ---------------------------
def push(url, key, recorders, verbose):
    body = json.dumps({"recorders": recorders}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("[netsdk] pushed:", r.read().decode("utf-8"))
            return True
    except urllib.error.HTTPError as e:
        print("[netsdk] push HTTP", e.code, e.read().decode("utf-8", "replace")[:300], file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print("[netsdk] push failed:", e, file=sys.stderr)
    return False


def collect_once(sdk, devices, defaults, tmap, verbose):
    payload = []
    for dev in devices:
        serial = dev["serial"]
        conn = {**defaults, **tmap.get(serial, {})}
        login_id, info, status, err = login_device(sdk, serial, conn, verbose)
        rec = {"serial": serial, "status": status, "cameras": [], "storage": []}
        if login_id and info:
            n = device_channels(info)
            model, sn = device_model_serial(info)
            if model:
                rec["model"] = model
            rec["channelCount"] = n or None
            rec["capabilities"] = {"supports_sdk": True, "via": "netsdk-p2p"}
            # Phase 1: create the channels so they appear; per-channel live status
            # (video loss / recording / snapshot) is added once login is confirmed.
            for ch in range(1, (n or 0) + 1):
                rec["cameras"].append({"channel": ch, "status": "UNKNOWN"})
            sdk.Logout(login_id)
        else:
            rec["errorMessage"] = (err or "")[:200]
        print(f"[netsdk] {serial} {dev['name']}: {status} ({len(rec['cameras'])} ch)")
        payload.append(rec)
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--devices", default="device.xml")
    ap.add_argument("--targets", default="cctv_targets.json")
    ap.add_argument("--interval", type=int, default=int(os.environ.get("INTERVAL_SECONDS", "300")))
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    url = os.environ.get("TECHCORE_URL")
    key = os.environ.get("TECHCORE_KEY")
    if not url or not key:
        print("ERROR: set TECHCORE_URL and TECHCORE_KEY", file=sys.stderr); sys.exit(1)

    devices = parse_device_list(args.devices)
    targets = load_targets(args.targets)
    defaults, tmap = targets.get("defaults", {}), targets.get("targets", {})

    sdk = NetClient()
    sdk.InitEx(None)  # no disconnect callback for phase 1
    print(f"[netsdk] SDK initialised; {len(devices)} devices from {args.devices}")
    try:
        while True:
            payload = collect_once(sdk, devices, defaults, tmap, args.verbose)
            push(url, key, payload, args.verbose)
            if args.once:
                break
            time.sleep(args.interval)
    finally:
        sdk.Cleanup()


if __name__ == "__main__":
    main()
