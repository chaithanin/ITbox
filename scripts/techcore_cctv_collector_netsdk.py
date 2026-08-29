#!/usr/bin/env python3
"""
TECHCORE CCTV Collector — Dahua NetSDK over P2P (production).
============================================================
Monitors Dahua NVRs that are reachable only through Dahua P2P (viewed via SmartPSS,
no LAN IP, no port-forwarding, spread across provinces) from ONE central machine,
and pushes health to TECHCORE's /api/cctv/ingest.

How it works (proven path):
  techcore_p2p_supervisor.py holds a `dh-p2p --relay <serial> -p 127.0.0.1:<port>:37777`
  tunnel open per remote device and writes p2p_tunnels.json (serial -> local port +
  health). This collector reads that map and, for each device with an UP tunnel, does
  an ordinary Dahua NetSDK TCP login to 127.0.0.1:<port> (the tunnel forwards the SDK
  service port 37777 over P2P), reads model + channel count, then logs out and pushes.
  Devices that also have a LAN IP can be logged into directly (no tunnel).

Credentials + how to reach each device come from cctv_targets.json:
{
  "defaults": { "username": "admin", "password": "REDACTED" },
  "targets": {
    "7B06FEEPAZ8E607": { "mode": "p2p" },                         // remote, via tunnel map
    "AA0C276PAZ5B1AC": { "mode": "ip", "host": "192.168.2.11" }   // on-site, direct SDK
  }
}

Usage:
  set TECHCORE_URL / TECHCORE_KEY, then:
  python techcore_cctv_collector_netsdk.py --once --verbose \
      --devices device.xml --targets cctv_targets.json --map p2p_tunnels.json

Requires: the Dahua Python NetSDK (NetSDK.py/NetSDK package + SDK_*.py + Libs) next
to this script, and (for p2p devices) the supervisor running with dh-p2p.
"""
import argparse, json, os, sys, time, urllib.request, urllib.error
from ctypes import sizeof
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

# --- Dahua NetSDK imports (tolerate both package layouts) -------------------
try:
    try:
        from NetSDK.NetClient import NetClient
        from NetSDK.SDK_Struct import (
            NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY,
            NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY,
        )
        from NetSDK.SDK_Enum import EM_LOGIN_SPAC_CAP_TYPE
    except ImportError:
        from NetSDK import NetClient
        from SDK_Struct import (
            NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY,
            NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY,
        )
        from SDK_Enum import EM_LOGIN_SPAC_CAP_TYPE
except Exception as e:  # noqa: BLE001
    print("ERROR: Dahua Python NetSDK not found next to this script.", file=sys.stderr)
    print("Put NetSDK.py + SDK_Struct.py + SDK_Enum.py + SDK_Callback.py + Libs\\win64\\ here.", file=sys.stderr)
    print("Import error:", e, file=sys.stderr)
    sys.exit(2)

SDK_PORT = 37777


def log(v, *a):
    if v:
        print("[netsdk]", *a, file=sys.stderr, flush=True)


def cstr(v):
    if isinstance(v, bytes):
        return v.split(b"\x00", 1)[0].decode("latin-1", "replace")
    try:
        return bytes(v).split(b"\x00", 1)[0].decode("latin-1", "replace")
    except Exception:
        return str(v)


# --------------------------- inputs ---------------------------
def parse_device_list(path):
    out = []
    for d in ET.parse(path).getroot().iter("Device"):
        out.append({"name": (d.get("name") or "").strip(),
                    "serial": (d.get("domain") or "").strip()})
    return out


def load_json(path, default):
    if not path or not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            text = f.read().strip()
        return json.loads(text) if text else default
    except (json.JSONDecodeError, OSError) as e:
        raise SystemExit(f"ERROR: {path} is not valid JSON ({e}).")


def load_targets(path):
    data = load_json(path, {"defaults": {}, "targets": {}})
    return data.get("defaults", {}) or {}, data.get("targets", {}) or {}


def load_tunnel_map(path):
    return (load_json(path, {}) or {}).get("tunnels", {}) or {}


# --------------------------- NetSDK login ---------------------------
def device_channels(info):
    for attr in ("nChanNum", "byChanNum", "nChannelNum"):
        n = getattr(info, attr, None)
        if isinstance(n, int) and n > 0:
            return n
    return 0


def device_model(info):
    for attr in ("sDVRType", "byDVRType", "sSoftWareVersion"):
        v = getattr(info, attr, None)
        if v:
            s = cstr(v)
            if s:
                return s
    return None


def login(sdk, host, port, user, pwd, verbose):
    """TCP high-level-security login. Returns (login_id, info, status, err)."""
    inp = NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY()
    inp.dwSize = sizeof(NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY)
    inp.szIP = host.encode()
    inp.nPort = int(port)
    inp.szUserName = (user or "admin").encode()
    inp.szPassword = (pwd or "").encode()
    inp.emSpecCap = EM_LOGIN_SPAC_CAP_TYPE.TCP
    inp.pCapParam = None
    outp = NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY()
    outp.dwSize = sizeof(NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY)
    try:
        login_id, info, err = sdk.LoginWithHighLevelSecurity(inp, outp)
    except Exception as e:  # noqa: BLE001
        return 0, None, "UNKNOWN", str(e)
    if login_id:
        return login_id, info, "ONLINE", None
    try:
        code = sdk.GetLastError()
    except Exception:
        code = 0
    # 0x64 wrong account/password, 0x66 login timeout, 0x6b main connection failed
    msg = (err or "").lower()
    if code == 0x64 or "密码" in (err or "") or "password" in msg:
        status = "AUTH_ERROR"
    elif code in (0x66, 0x6b, 0x6c):
        status = "OFFLINE"
    else:
        status = "OFFLINE"
    return 0, None, status, f"{err} (0x{code:08x})" if isinstance(code, int) else str(err)


# --------------------------- collection ---------------------------
def resolve_conn(dev, defaults, tmap, tunnel_map, verbose):
    """Decide how to reach a device. Returns (host, port, conn, note) or
    (None, None, conn, reason) when it cannot be reached."""
    serial = dev["serial"]
    conn = {**defaults, **tmap.get(serial, {})}
    mode = conn.get("mode") or ("ip" if conn.get("host") else "p2p")
    if mode == "ip":
        host = conn.get("host")
        if not host:
            return None, None, conn, "mode:ip but no host set"
        return host, int(conn.get("sdkPort") or SDK_PORT), conn, "direct"
    # p2p: use the supervisor's live tunnel
    entry = tunnel_map.get(serial)
    if not entry:
        return None, None, conn, "no tunnel (supervisor not running or serial not in targets)"
    st = entry.get("status")
    if st != "UP":
        return None, None, conn, f"tunnel {st}: {entry.get('lastError', '')}".strip()
    return "127.0.0.1", int(entry["port"]), conn, "p2p-tunnel"


def collect_device(sdk, dev, defaults, tmap, tunnel_map, verbose):
    serial = dev["serial"]
    rec = {"serial": serial, "status": "UNKNOWN", "cameras": [], "storage": []}
    host, port, conn, note = resolve_conn(dev, defaults, tmap, tunnel_map, verbose)
    if not host:
        # a channel-auth tunnel is a real, nameable state; everything else is unknown/offline
        rec["status"] = "OFFLINE" if "tunnel" in note else "UNKNOWN"
        rec["errorMessage"] = note[:200]
        return rec

    login_id, info, status, err = login(sdk, host, port, conn.get("username"),
                                        conn.get("password"), verbose)
    rec["status"] = status
    if not login_id:
        rec["errorMessage"] = (err or "")[:200]
        return rec

    try:
        n = device_channels(info)
        model = device_model(info)
        if model:
            rec["model"] = model
        rec["channelCount"] = n or None
        rec["capabilities"] = {"supports_sdk": True, "via": "netsdk-p2p" if host == "127.0.0.1" else "netsdk-ip"}
        # Phase 1: create the channels so they appear online under the recorder.
        # Per-channel video-loss / recording / HDD come next once this baseline is live.
        for ch in range(1, (n or 0) + 1):
            rec["cameras"].append({"channel": ch, "status": "UNKNOWN"})
    finally:
        try:
            sdk.Logout(login_id)
        except Exception:
            pass
    return rec


# --------------------------- push ---------------------------
def push(url, key, recorders, verbose):
    body = json.dumps({"recorders": recorders}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("[netsdk] pushed:", r.read().decode("utf-8"))
            return True
    except urllib.error.HTTPError as e:
        print("[netsdk] push HTTP", e.code, e.read().decode("utf-8", "replace")[:300], file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print("[netsdk] push failed:", e, file=sys.stderr)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--devices", default="device.xml")
    ap.add_argument("--targets", default="cctv_targets.json")
    ap.add_argument("--map", default="p2p_tunnels.json",
                    help="tunnel map written by techcore_p2p_supervisor.py")
    ap.add_argument("--interval", type=int, default=int(os.environ.get("INTERVAL_SECONDS", "300")))
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    url = os.environ.get("TECHCORE_URL")
    key = os.environ.get("TECHCORE_KEY")
    if not url or not key:
        print("ERROR: set TECHCORE_URL and TECHCORE_KEY", file=sys.stderr)
        sys.exit(1)

    devices = parse_device_list(args.devices)
    defaults, tmap = load_targets(args.targets)
    print(f"[netsdk] {len(devices)} devices from {args.devices}; {len(tmap)} targets mapped")

    sdk = NetClient()
    sdk.InitEx(None)
    print("[netsdk] SDK initialised")
    try:
        while True:
            tunnel_map = load_tunnel_map(args.map)  # re-read each cycle (supervisor updates it live)
            payload = []
            for dev in devices:
                rec = collect_device(sdk, dev, defaults, tmap, tunnel_map, args.verbose)
                payload.append(rec)
                print(f"[netsdk] {dev['serial']} {dev['name']}: {rec['status']} "
                      f"({len(rec['cameras'])} ch)"
                      + (f" [{rec['errorMessage']}]" if rec.get("errorMessage") else ""))
            push(url, key, payload, args.verbose)
            if args.once:
                break
            time.sleep(args.interval)
    finally:
        sdk.Cleanup()


if __name__ == "__main__":
    main()
