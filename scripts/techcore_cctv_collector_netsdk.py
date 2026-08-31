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
from ctypes import sizeof, byref, Structure, c_int, c_uint, c_char, c_byte, c_ubyte
from datetime import datetime, timedelta, timezone
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

# --- structs for per-channel recording + disk queries ----------------------
# All of these come from the bundled SDK_Struct so their layout matches the DLL
# exactly (confirmed against the installed NetSDK via inspect). NET_TIME has a
# canonical fallback for a trimmed bundle; the disk struct has no safe fallback
# (its layout is firmware-specific) so we simply skip disk if it is absent.
def _import_sdk(*names):
    try:
        mod = __import__("NetSDK.SDK_Struct", fromlist=list(names))
    except ImportError:
        mod = __import__("SDK_Struct", fromlist=list(names))
    return tuple(getattr(mod, n) for n in names)


try:
    NET_TIME, NET_RECORDFILE_INFO = _import_sdk("NET_TIME", "NET_RECORDFILE_INFO")
except Exception:  # noqa: BLE001
    class NET_TIME(Structure):
        _fields_ = [("dwYear", c_uint), ("dwMonth", c_uint), ("dwDay", c_uint),
                    ("dwHour", c_uint), ("dwMinute", c_uint), ("dwSecond", c_uint)]
    NET_RECORDFILE_INFO = None

try:
    (SDK_HARDDISK_STATE,) = _import_sdk("SDK_HARDDISK_STATE")
except Exception:  # noqa: BLE001
    SDK_HARDDISK_STATE = None

# CLIENT_QueryDevState type code for the hard-disk state (SDK_HARDDISK_STATE).
# Prefer the value from EM_QUERY_DEV_STATE_TYPE (a member whose name mentions
# DISK); fall back to the classic candidates. Confirmed per firmware by --probe.
def _disk_type_candidates():
    codes = []
    try:
        try:
            from NetSDK.SDK_Enum import EM_QUERY_DEV_STATE_TYPE as E
        except ImportError:
            from SDK_Enum import EM_QUERY_DEV_STATE_TYPE as E
        for attr in dir(E):
            if "DISK" in attr.upper():
                v = getattr(E, attr)
                v = getattr(v, "value", v)
                if isinstance(v, int):
                    codes.append(v)
    except Exception:  # noqa: BLE001
        pass
    for v in (4, 3, 26):  # classic DH_DEVSTATE_DISK values seen in the wild
        if v not in codes:
            codes.append(v)
    return tuple(codes)


DISK_TYPE_CANDIDATES = _disk_type_candidates()


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


# Login failures that retrying cannot fix, and where retrying actively harms:
# every extra bad attempt counts toward the NVR's lockout threshold. 0x64 is a
# wrong username/password, 0x68 means the account is ALREADY locked out (we hit
# this for real on one recorder while password-guessing).
CREDENTIAL_ERRORS = {
    0x64: "wrong username or password - do not retry, the NVR locks the account",
    0x68: "account is locked on the NVR - wait for the lockout to expire before trying again",
}


def login(sdk, host, port, user, pwd, verbose, retries=2):
    """TCP high-level-security login with a short retry (the first connection over a
    fresh relay tunnel occasionally needs a second attempt). Credential failures are
    never retried: a second wrong password just pushes the NVR closer to locking the
    account. Returns (login_id, info, status, err)."""
    last_err, last_code = None, 0
    for attempt in range(1, retries + 1):
        login_id, info, status, err, code = login_once(sdk, host, port, user, pwd)
        if login_id:
            return login_id, info, "ONLINE", None
        last_err, last_code = err, code
        if code in CREDENTIAL_ERRORS:
            return 0, None, "AUTH_ERROR", f"{err} (0x{code:08x}) - {CREDENTIAL_ERRORS[code]}"
        if attempt < retries:
            log(verbose, f"login attempt {attempt} failed 0x{code:08x} ({err}); retrying")
            time.sleep(2)
    status = "AUTH_ERROR" if last_code in CREDENTIAL_ERRORS else "OFFLINE"
    return 0, None, status, f"{last_err} (0x{last_code:08x})" if isinstance(last_code, int) else str(last_err)


# --------------------------- per-channel recording + disk ---------------------------
def _mk_nettime(dt):
    t = NET_TIME()
    t.dwYear, t.dwMonth, t.dwDay = dt.year, dt.month, dt.day
    t.dwHour, t.dwMinute, t.dwSecond = dt.hour, dt.minute, dt.second
    return t


def _nettime_to_dt(nt):
    try:
        if not nt.dwYear:
            return None
        return datetime(nt.dwYear, nt.dwMonth, nt.dwDay, nt.dwHour, nt.dwMinute, nt.dwSecond)
    except (ValueError, AttributeError):
        return None


def _iso_local(dt):
    """NVR clocks report local wall-clock time; stamp the collector's local tz
    offset so TECHCORE (running in UTC) stores an unambiguous instant."""
    if dt is None:
        return None
    tz = datetime.now().astimezone().tzinfo
    return dt.replace(tzinfo=tz).isoformat()


def _query_record_raw(sdk, login_id, ch, tm_start, tm_end, wait_ms=4000, by_time=True):
    """CLIENT_QueryRecordFile via the NetClient wrapper. The wrapper allocates the
    record buffer itself and returns (result, file_count, infos); on failure it
    returns just (result, ...). Returns (ok, count, infos)."""
    fn = getattr(sdk, "QueryRecordFile", None)
    if fn is None:
        raise RuntimeError("this NetSDK build has no QueryRecordFile")
    # (login_id, channel, recordfile_type=0(all), start, end, card_id, wait, by_time)
    res = fn(login_id, ch, 0, tm_start, tm_end, b"", wait_ms, by_time)
    if not isinstance(res, tuple):
        return bool(res), 0, None
    ok = bool(res[0])
    count = res[1] if len(res) > 1 else 0
    infos = res[2] if len(res) > 2 else None
    try:
        count = int(count)
    except (TypeError, ValueError):
        count = 0
    return ok, count, infos


def query_recording(sdk, login_id, ch, window_min, verbose):
    """Ask the recorder for this channel's recordings in the last `window_min`.
    A recording present in that window means the camera has signal and is being
    written to disk. Returns a dict of camera fields for the ingest payload."""
    if NET_RECORDFILE_INFO is None:
        return {"status": "UNKNOWN", "recordingStatus": "UNKNOWN"}
    now_local = datetime.now()
    tm_start = _mk_nettime(now_local - timedelta(minutes=window_min))
    tm_end = _mk_nettime(now_local)
    ok, count, infos = _query_record_raw(sdk, login_id, ch, tm_start, tm_end)
    if not ok or count <= 0 or infos is None:
        # The wrapper returns FALSE when it simply finds no files in the window.
        return {"status": "NO_RECORDING", "recordingStatus": "NO_RECORDING_FOUND"}
    latest = None
    for i in range(min(count, 5000)):
        try:
            ri = infos[i]
        except (TypeError, IndexError):
            break
        for field in ("endtime", "starttime"):
            dt = _nettime_to_dt(getattr(ri, field, None))
            if dt and (latest is None or dt > latest):
                latest = dt
    out = {"status": "ONLINE", "recordingStatus": "RECORDING"}
    if latest is not None:
        out["latestRecording"] = _iso_local(latest)
        out["recordingGapSeconds"] = max(0, int((now_local - latest).total_seconds()))
    return out


def _disk_field(d, *names):
    for n in names:
        v = getattr(d, n, None)
        if v is not None:
            try:
                return int(v)
            except (TypeError, ValueError):
                pass
    return None


def query_storage(sdk, login_id, verbose, type_codes=DISK_TYPE_CANDIDATES):
    """HDD state via CLIENT_QueryDevState with SDK_HARDDISK_STATE. The wrapper
    wraps pBuf in a pointer itself, so we pass the struct instance directly and
    read it back after the call. Values that fail a sanity check (wrong type code
    for this firmware) are dropped rather than pushed as garbage."""
    fn = getattr(sdk, "QueryDevState", None)
    if fn is None or SDK_HARDDISK_STATE is None:
        return []
    for tc in type_codes:
        st = SDK_HARDDISK_STATE()
        try:
            result = fn(login_id, tc, st, sizeof(st), 0, 4000)
        except Exception as e:  # noqa: BLE001
            log(verbose, f"QueryDevState type={tc} error: {e}")
            continue
        if not result:
            continue
        ndisk = getattr(st, "dwDiskNum", 0) or 0
        disks = getattr(st, "stDisks", None)
        if disks is None or not (0 < ndisk <= len(disks)):
            continue
        out, sane = [], True
        for i in range(ndisk):
            cap_mb = _disk_field(disks[i], "dwVolume")
            free_mb = _disk_field(disks[i], "dwFreeSpace")
            if cap_mb is None or free_mb is None or cap_mb < 100_000 or cap_mb > 200_000_000 or free_mb > cap_mb:
                sane = False
                break
            out.append({"hddIndex": i, "status": "NORMAL",
                        "capacityBytes": cap_mb * 1024 * 1024,
                        "usedBytes": (cap_mb - free_mb) * 1024 * 1024,
                        "freeBytes": free_mb * 1024 * 1024})
        if sane and out:
            return out
    return []


# EM_QUERY_DEV_STATE_TYPE codes that work over the P2P main connection (unlike
# QueryRecordFile, which opens a second connection the relay tunnel can't carry).
QDS_RECORDING = 3   # per-channel recording state
QDS_ONLINE = 53     # per-channel / device online state


def _querydevstate_bytes(sdk, login_id, ntype, nbytes=1024, wait=4000):
    """QueryDevState into a raw byte buffer (the wrapper wraps pBuf in a pointer
    itself and does not return the length, so we pass a ctypes byte array and
    read it back). Returns the raw bytes on success, else None."""
    fn = getattr(sdk, "QueryDevState", None)
    if fn is None:
        return None
    buf = (c_ubyte * nbytes)()
    try:
        ok = fn(login_id, ntype, buf, sizeof(buf), 0, wait)
    except Exception:  # noqa: BLE001
        return None
    if not ok:
        return None
    return bytes(buf)


def query_channel_state(sdk, login_id, nchan, verbose):
    """Per-channel recording state via QueryDevState(RECORDING). The buffer is a
    byte indexed by channel; a non-zero byte means that channel is recording (so
    it has signal). Falls back to UNKNOWN cameras if the query is unsupported."""
    raw = None
    try:
        raw = _querydevstate_bytes(sdk, login_id, QDS_RECORDING)
    except Exception as e:  # noqa: BLE001
        log(verbose, f"recording-state query failed: {e}")
    cams = []
    for ch in range(1, (nchan or 0) + 1):
        if raw is not None and (ch - 1) < len(raw):
            recording = raw[ch - 1] > 0
            if recording:
                cams.append({"channel": ch, "status": "ONLINE", "recordingStatus": "RECORDING"})
            else:
                cams.append({"channel": ch, "status": "NO_RECORDING", "recordingStatus": "NO_RECORDING_FOUND"})
        else:
            cams.append({"channel": ch, "status": "UNKNOWN"})
    return cams


def probe_device(sdk, login_id, info, verbose):
    """Print raw QueryDevState results for one device so the disk parse and the
    RECORDING/ONLINE byte formats can be confirmed before trusting them. Runs the
    disk query first, while the P2P tunnel is freshest."""
    n = device_channels(info)
    print(f"=== channels reported: {n} ===")

    # 1) DISK (freshest tunnel) via SDK_HARDDISK_STATE
    print("=== disk (QueryDevState DISK=4) ===")
    if getattr(sdk, "QueryDevState", None) and SDK_HARDDISK_STATE:
        print("  parsed query_storage():", query_storage(sdk, login_id, verbose))
    else:
        print("  (QueryDevState or SDK_HARDDISK_STATE missing)")

    # 2) RECORDING + ONLINE: dump raw bytes so the per-channel layout is visible
    for label, ntype in (("RECORDING", QDS_RECORDING), ("ONLINE", QDS_ONLINE)):
        raw = _querydevstate_bytes(sdk, login_id, ntype)
        if raw is None:
            print(f"=== {label}(type {ntype}): query returned no data ===")
            continue
        head = list(raw[: max(40, (n or 0) + 4)])
        print(f"=== {label}(type {ntype}) first {len(head)} bytes ===")
        print("  ", head)
    print("=== parsed query_channel_state() ===")
    cams = query_channel_state(sdk, login_id, n, verbose)
    rec_on = sum(1 for c in cams if c.get("recordingStatus") == "RECORDING")
    print(f"  {rec_on}/{len(cams)} channels RECORDING; first 5: {cams[:5]}")


# --------------------------- collection ---------------------------
def _read_device(sdk, rec, host, port, conn, via, args):
    verbose = args.verbose
    login_id, info, status, err = login(sdk, host, port, conn.get("username"),
                                        conn.get("password"), verbose)
    rec["status"] = status
    if not login_id:
        rec["errorMessage"] = (err or "")[:200]
        return rec
    try:
        if getattr(args, "probe", None):
            probe_device(sdk, login_id, info, verbose)
            rec["errorMessage"] = "probe complete (see stdout)"
            return rec
        n = device_channels(info)
        model = device_model(info)
        if model:
            rec["model"] = model
        rec["channelCount"] = n or None
        rec["capabilities"] = {"supports_sdk": True, "via": via}
        # Disk first, while the tunnel is freshest (dh-p2p relays degrade the
        # longer they are held open). Both queries use QueryDevState on the main
        # connection, which the relay carries; QueryRecordFile does not work over
        # P2P (it opens a second connection), so recording state comes from the
        # RECORDING device-state query instead - one call for all channels.
        if not args.no_storage:
            try:
                rec["storage"] = query_storage(sdk, login_id, verbose)
            except Exception as e:  # noqa: BLE001
                log(verbose, f"storage query failed: {e}")
        if args.no_recinfo:
            rec["cameras"] = [{"channel": ch, "status": "UNKNOWN"} for ch in range(1, (n or 0) + 1)]
        else:
            try:
                rec["cameras"] = query_channel_state(sdk, login_id, n, verbose)
            except Exception as e:  # noqa: BLE001
                log(verbose, f"channel-state query failed: {e}")
                rec["cameras"] = [{"channel": ch, "status": "UNKNOWN"} for ch in range(1, (n or 0) + 1)]
    finally:
        try:
            sdk.Logout(login_id)
        except Exception:
            pass
    return rec


def collect_device(sdk, dev, defaults, tmap, tunnel_map, args, slot):
    serial = dev["serial"]
    rec = {"serial": serial, "status": "UNKNOWN", "cameras": [], "storage": []}

    # Only ever touch recorders explicitly listed in cctv_targets.json. device.xml
    # is just the fleet inventory; a device missing from targets has no known-good
    # credentials, and trying defaults on it is how you lock out admin accounts
    # across the whole fleet at once. Report the gap instead of guessing.
    entry = tmap.get(serial)
    if entry is None:
        rec["errorMessage"] = "not listed in cctv_targets.json - skipped (credentials never guessed)"
        return rec

    conn = {**defaults, **entry}
    mode = conn.get("mode") or ("ip" if conn.get("host") else "p2p")

    if mode == "ip":
        host = conn.get("host")
        if not host:
            rec["errorMessage"] = "mode:ip but no host set"
            return rec
        return _read_device(sdk, rec, host, int(conn.get("sdkPort") or SDK_PORT), conn, "netsdk-ip", args)

    # p2p device
    if args.p2p_bin:
        extra = conn.get("p2pArgs") or []
        if not isinstance(extra, list):
            extra = [str(extra)]

        # dh-p2p's relay is flaky: roughly one attempt in three either never
        # reaches "Ready to connect!" or comes up too degraded to carry the login
        # (0x66 login timeout / 0x6b main connection failed). Retrying the login
        # on the SAME sick tunnel does not help - the tunnel is what failed. So on
        # a transport failure we tear it down and build a completely fresh one.
        # Credential failures are never retried: a second wrong password moves the
        # NVR closer to locking the account.
        last = rec
        for attempt in range(1, args.p2p_attempts + 1):
            # a different local port each time, so a socket still in TIME_WAIT
            # from the previous attempt cannot collide with the new tunnel
            local_port = args.p2p_local_base + slot * args.p2p_attempts + (attempt - 1)
            try:
                with P2PTunnel(args.p2p_bin, serial, local_port, args.p2p_remote_port,
                               not args.no_relay, [str(a) for a in extra], args.verbose):
                    got = _read_device(sdk, dict(rec), "127.0.0.1", local_port, conn,
                                       "netsdk-p2p", args)
                if got["status"] in ("ONLINE", "AUTH_ERROR"):
                    return got
                last = got
            except ChannelAuthError:
                rec["status"] = "OFFLINE"
                rec["errorMessage"] = "P2P channel auth required (disable P2P encryption/verification on the NVR)"
                return rec
            except RuntimeError as e:
                last = {**rec, "status": "OFFLINE", "errorMessage": str(e)[:200]}
            if attempt < args.p2p_attempts:
                log(args.verbose, f"{serial}: attempt {attempt} failed, rebuilding the tunnel")
                time.sleep(3)
        return last

    if args.map:
        entry = tunnel_map.get(serial)
        if not entry:
            rec["errorMessage"] = "no tunnel (supervisor not running or serial not in targets)"
            return rec
        if entry.get("status") != "UP":
            rec["status"] = "OFFLINE"
            rec["errorMessage"] = f"tunnel {entry.get('status')}: {entry.get('lastError', '')}".strip()
            return rec
        return _read_device(sdk, rec, "127.0.0.1", int(entry["port"]), conn, "netsdk-p2p", args)

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
    ap.add_argument("--p2p-attempts", type=int, default=3,
                    help="tunnel+login attempts per p2p device, each with a fresh tunnel "
                         "(default 3; the dh-p2p relay fails intermittently). Credential "
                         "failures are never retried.")
    ap.add_argument("--no-relay", action="store_true", help="do not pass --relay to dh-p2p")
    ap.add_argument("--rec-window-min", type=int, default=15,
                    help="per-channel recording lookback window in minutes (default 15); "
                         "a recording in this window means the camera has signal and is recording")
    ap.add_argument("--no-recinfo", action="store_true",
                    help="skip per-channel recording queries (cameras stay UNKNOWN, faster)")
    ap.add_argument("--no-storage", action="store_true",
                    help="skip the HDD/disk query")
    ap.add_argument("--probe", metavar="SERIAL",
                    help="dump the NetSDK API surface + raw query results for ONE device "
                         "(confirms the disk type code before trusting it) and exit")
    ap.add_argument("--interval", type=int, default=int(os.environ.get("INTERVAL_SECONDS", "300")))
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    # --probe only inspects one device and prints to stdout; it never pushes, so
    # it does not need TECHCORE_URL/KEY.
    url = os.environ.get("TECHCORE_URL")
    key = os.environ.get("TECHCORE_KEY")
    if not args.probe and (not url or not key):
        print("ERROR: set TECHCORE_URL and TECHCORE_KEY", file=sys.stderr)
        sys.exit(1)

    devices = parse_device_list(args.devices)
    if args.probe:
        devices = [d for d in devices if d["serial"] == args.probe]
        if not devices:
            print(f"ERROR: serial {args.probe} not found in {args.devices}", file=sys.stderr)
            sys.exit(1)
        args.once = True

    # A missing targets file used to fall back to "no targets", so every run
    # skipped every recorder and still reported success - monitoring nothing,
    # quietly. Fail loudly instead; the same goes for a file with no entries.
    if not os.path.exists(args.targets):
        print(f"ERROR: targets file not found: {args.targets}", file=sys.stderr)
        print("Nothing would be monitored. Create it, or pass --targets <path>.", file=sys.stderr)
        sys.exit(1)
    defaults, tmap = load_targets(args.targets)
    if not tmap:
        print(f"ERROR: {args.targets} lists no recorders under \"targets\".", file=sys.stderr)
        print("Nothing would be monitored - add at least one serial.", file=sys.stderr)
        sys.exit(1)
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
            if not args.probe:
                push(url, key, payload, args.verbose)
            if args.once:
                break
            time.sleep(args.interval)
    finally:
        sdk.Cleanup()


if __name__ == "__main__":
    main()
