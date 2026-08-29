#!/usr/bin/env python3
"""
TECHCORE CCTV Collector — Dahua NetSDK over P2P (production, self-managed tunnels).
==================================================================================
Monitors Dahua NVRs reachable only through Dahua P2P (viewed via SmartPSS, no LAN
IP, no port-forwarding, spread across provinces) from ONE central machine, and
pushes health to TECHCORE's /api/cctv/ingest.

Proven path: a FRESH `dh-p2p --relay <serial> -p 127.0.0.1:<port>:37777` tunnel is
opened per device, an ordinary Dahua NetSDK TCP login is done to 127.0.0.1:<port>
*immediately* while the tunnel is fresh (dh-p2p's relay is a PoC and degrades if held
open for long, so we don't reuse tunnels between cycles), model + channel count are
read, then logout and the tunnel is torn down. On-site devices with a LAN IP are
logged into directly with no tunnel.

Two ways to reach p2p devices:
  --p2p-bin PATH   (recommended) open a fresh tunnel per device each cycle.
  --map FILE       reuse always-on tunnels from techcore_p2p_supervisor.py instead.

cctv_targets.json (serial -> connection + creds):
{
  "defaults": { "username": "admin", "password": "REDACTED" },
  "targets": {
    "7B06FEEPAZ8E607": { "mode": "p2p" },
    "AA0C276PAZ5B1AC": { "mode": "ip", "host": "192.168.2.11", "password": "..." }
  }
}

Usage:
  set TECHCORE_URL / TECHCORE_KEY, then:
  python techcore_cctv_collector_netsdk.py --once --verbose \
      --devices device.xml --targets cctv_targets.json --p2p-bin ./dh-p2p.exe

Requires: the Dahua Python NetSDK (NetSDK.py/NetSDK package + SDK_*.py + Libs) next
to this script; for p2p devices, the compiled dh-p2p binary (--p2p-bin) or a running
supervisor (--map).
"""
import argparse, json, os, socket, subprocess, sys, threading, time, urllib.request, urllib.error
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
READY_TIMEOUT = 40
READY_MARK = "Ready to connect!"
AUTH_MARKS = ("Authentication is not supported", "DevPwd_InvalidSalt", "403 Forbidden")


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


# --------------------------- fresh dh-p2p tunnel ---------------------------
class ChannelAuthError(RuntimeError):
    """Device requires authentication when creating the P2P channel (dh-p2p PoC
    can't do it). Disable 'P2P encryption/verification' on the NVR, or reach it
    another way."""


class P2PTunnel:
    """Open a FRESH `dh-p2p --relay <serial> -p 127.0.0.1:<port>:37777` tunnel and
    wait until dh-p2p prints 'Ready to connect!' (the local port binds seconds
    earlier, before the P2P path is usable). Tears the tunnel down on exit."""

    def __init__(self, bin_path, serial, local_port, remote_port, relay, extra_args, verbose):
        self.bin_path = bin_path
        self.serial = serial
        self.local_port = int(local_port)
        self.remote_port = int(remote_port)
        self.relay = relay
        self.extra_args = list(extra_args or [])
        self.verbose = verbose
        self.proc = None
        self._ready = threading.Event()
        self._auth = threading.Event()

    def _drain(self, proc):
        try:
            for raw in iter(proc.stdout.readline, b""):
                line = raw.decode("utf-8", "replace")
                if READY_MARK in line:
                    self._ready.set()
                if any(m in line for m in AUTH_MARKS):
                    self._auth.set()
                if self.verbose:
                    sys.stderr.write("[dhp2p:%s] %s" % (self.serial, line))
        except Exception:
            pass

    def __enter__(self):
        cmd = [self.bin_path]
        if self.relay:
            cmd.append("--relay")
        cmd += [self.serial, "-p", f"127.0.0.1:{self.local_port}:{self.remote_port}"] + self.extra_args
        log(self.verbose, "p2p spawn:", " ".join(cmd))
        try:
            self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        except FileNotFoundError as e:
            raise RuntimeError(f"dh-p2p not found: {self.bin_path} ({e})")
        threading.Thread(target=self._drain, args=(self.proc,), daemon=True).start()
        end = time.time() + READY_TIMEOUT
        while time.time() < end:
            if self._auth.is_set():
                raise ChannelAuthError("device requires P2P-channel authentication")
            if self._ready.is_set() and _port_alive(self.local_port):
                return self
            if self.proc.poll() is not None:
                if self._auth.is_set():
                    raise ChannelAuthError("device requires P2P-channel authentication")
                raise RuntimeError("dh-p2p exited before tunnel was ready")
            time.sleep(0.3)
        raise RuntimeError(f"tunnel not ready within {READY_TIMEOUT}s (device offline / relay slow)")

    def __exit__(self, *exc):
        self._terminate()
        return False

    def _terminate(self):
        p = self.proc
        if not p:
            return
        try:
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait(timeout=5)
        except Exception:
            pass
        self.proc = None


def _port_alive(port, timeout=1.5):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


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


def login_once(sdk, host, port, user, pwd):
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
        return 0, None, "UNKNOWN", str(e), 0
    if login_id:
        return login_id, info, "ONLINE", None, 0
    try:
        code = sdk.GetLastError()
    except Exception:
        code = 0
    return 0, None, None, err, code


def login(sdk, host, port, user, pwd, verbose, retries=2):
    """TCP high-level-security login with a short retry (the first connection over a
    fresh relay tunnel occasionally needs a second attempt). Returns (login_id, info,
    status, err)."""
    last_err, last_code = None, 0
    for attempt in range(1, retries + 1):
        login_id, info, status, err, code = login_once(sdk, host, port, user, pwd)
        if login_id:
            return login_id, info, "ONLINE", None
        last_err, last_code = err, code
        # 0x64 = wrong account/password -> don't retry, it won't change
        if code == 0x64:
            return 0, None, "AUTH_ERROR", f"{err} (0x{code:08x})"
        log(verbose, f"login attempt {attempt} failed 0x{code:08x} ({err}); retrying" if attempt < retries else "")
        if attempt < retries:
            time.sleep(2)
    status = "AUTH_ERROR" if last_code == 0x64 else "OFFLINE"
    return 0, None, status, f"{last_err} (0x{last_code:08x})" if isinstance(last_code, int) else str(last_err)


# --------------------------- collection ---------------------------
def _read_device(sdk, rec, host, port, conn, via, verbose):
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
        rec["capabilities"] = {"supports_sdk": True, "via": via}
        for ch in range(1, (n or 0) + 1):
            rec["cameras"].append({"channel": ch, "status": "UNKNOWN"})
    finally:
        try:
            sdk.Logout(login_id)
        except Exception:
            pass
    return rec


def collect_device(sdk, dev, defaults, tmap, tunnel_map, args, slot):
    serial = dev["serial"]
    conn = {**defaults, **tmap.get(serial, {})}
    rec = {"serial": serial, "status": "UNKNOWN", "cameras": [], "storage": []}
    mode = conn.get("mode") or ("ip" if conn.get("host") else "p2p")

    if mode == "ip":
        host = conn.get("host")
        if not host:
            rec["errorMessage"] = "mode:ip but no host set"
            return rec
        return _read_device(sdk, rec, host, int(conn.get("sdkPort") or SDK_PORT), conn, "netsdk-ip", args.verbose)

    # p2p device
    if args.p2p_bin:
        # open a FRESH tunnel and log in immediately (the reliable path)
        extra = conn.get("p2pArgs") or []
        if not isinstance(extra, list):
            extra = [str(extra)]
        local_port = args.p2p_local_base + slot
        try:
            with P2PTunnel(args.p2p_bin, serial, local_port, args.p2p_remote_port,
                           not args.no_relay, [str(a) for a in extra], args.verbose):
                return _read_device(sdk, rec, "127.0.0.1", local_port, conn, "netsdk-p2p", args.verbose)
        except ChannelAuthError:
            rec["status"] = "OFFLINE"
            rec["errorMessage"] = "P2P channel auth required (disable P2P encryption/verification on the NVR)"
            return rec
        except RuntimeError as e:
            rec["status"] = "OFFLINE"
            rec["errorMessage"] = str(e)[:200]
            return rec

    if args.map:
        entry = tunnel_map.get(serial)
        if not entry:
            rec["errorMessage"] = "no tunnel (supervisor not running or serial not in targets)"
            return rec
        if entry.get("status") != "UP":
            rec["status"] = "OFFLINE"
            rec["errorMessage"] = f"tunnel {entry.get('status')}: {entry.get('lastError', '')}".strip()
            return rec
        return _read_device(sdk, rec, "127.0.0.1", int(entry["port"]), conn, "netsdk-p2p", args.verbose)

    rec["errorMessage"] = "p2p device but neither --p2p-bin nor --map set"
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
    ap.add_argument("--p2p-bin", default=os.environ.get("DHP2P_BIN"),
                    help="path to dh-p2p; opens a fresh tunnel per p2p device each cycle (recommended)")
    ap.add_argument("--map", default=None,
                    help="use always-on tunnels from techcore_p2p_supervisor.py instead of --p2p-bin")
    ap.add_argument("--p2p-remote-port", type=int, default=SDK_PORT,
                    help="device-side SDK port to tunnel to (default 37777)")
    ap.add_argument("--p2p-local-base", type=int, default=18080,
                    help="first local port for fresh tunnels (base+index per device)")
    ap.add_argument("--no-relay", action="store_true", help="do not pass --relay to dh-p2p")
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
    mode_desc = "fresh tunnels (--p2p-bin)" if args.p2p_bin else ("supervisor map (--map)" if args.map else "no p2p transport")
    print(f"[netsdk] {len(devices)} devices from {args.devices}; {len(tmap)} targets mapped; p2p via {mode_desc}")

    sdk = NetClient()
    sdk.InitEx(None)
    print("[netsdk] SDK initialised")
    try:
        while True:
            tunnel_map = load_tunnel_map(args.map) if args.map else {}
            payload = []
            slot = 0
            for dev in devices:
                rec = collect_device(sdk, dev, defaults, tmap, tunnel_map, args, slot)
                slot += 1
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
