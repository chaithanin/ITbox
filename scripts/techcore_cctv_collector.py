#!/usr/bin/env python3
"""
TECHCORE CCTV Collector (Phase 1) — Dahua, read-only.
=====================================================
Runs INSIDE your network (the recorders are reachable only on the LAN / via P2P,
never from the cloud). It connects to each Dahua NVR/XVR over the HTTP CGI API,
gathers health/recording/storage, and PUSHES the result to TECHCORE's ingest
endpoint. It never changes any device setting, never deletes recordings, and only
issues read/query CGI calls.

WHY A SEPARATE CREDENTIAL FILE
------------------------------
The passwords inside a Dahua ConfigTool/SmartPSS `device.xml` export are encrypted
with SmartPSS's own key — they are NOT the plaintext admin password and cannot be
used to authenticate CGI/RTSP/ONVIF. So this collector reads `device.xml` only for
the DEVICE LIST (name, serial, port) and takes the real credentials + LAN address
from a separate `cctv_targets.json` you control. Best practice: create a read-only
`cctv_monitor` account on each NVR and put THAT here.

cctv_targets.json  (serial -> connection):
{
  "defaults": { "username": "cctv_monitor", "password": "REDACTED", "httpPort": 80 },
  "targets": {
    "AA0C276PAZ5B1AC": { "host": "192.168.2.11" },
    "9J05936PAZC710E": { "host": "192.168.10.5", "username": "admin", "password": "..." }
  }
}
A serial with no entry (or no host) is reported to TECHCORE as UNKNOWN/unreachable
so you can see coverage gaps — it is never guessed.

REMOTE-PROVINCE SITES WITH NO LAN IP (Dahua P2P)
------------------------------------------------
Recorders you can only see through SmartPSS/gDMSS (no reachable LAN IP, no port
forwarding) can be reached from this one machine over Dahua P2P — the same cloud
path SmartPSS uses — by tunnelling their HTTP CGI port with the third-party Rust
`dh-p2p` tool. Give `--p2p-bin /path/to/dh-p2p` and mark those devices "p2p" in
cctv_targets.json (or just leave them host-less and pass --p2p-default). For each
one the collector spins up `dh-p2p <serial> -p 127.0.0.1:<port>:80`, points the
CGI client at that local port, collects, then tears the tunnel down. dh-p2p is an
experimental PoC and can be unstable — the collector degrades gracefully if a
tunnel won't come up, reporting that recorder as unreachable rather than aborting.

  "targets": {
    "7B06FEEPAZ8E607": { "mode": "p2p" },                          // remote site, by serial
    "9J05936PAZC710E": { "mode": "p2p", "p2pArgs": ["-c","amcrest"] }
  }

Usage:
  TECHCORE_URL=https://<techcore>/api/cctv/ingest \
  TECHCORE_KEY=tck_xxx \
  python3 techcore_cctv_collector.py --devices device.xml --targets cctv_targets.json \
    [--snapshot-dir ./snapshots] [--once] [--verbose] \
    [--p2p-bin ./dh-p2p] [--p2p-default] [--p2p-remote-port 80]

Requires: Python 3.8+ (standard library only). P2P mode additionally needs the
compiled `dh-p2p` binary on this machine (not bundled).
"""
import argparse, base64, json, os, socket, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone
from urllib.parse import quote
from xml.etree import ElementTree as ET

HTTP_TIMEOUT = 10
RETRIES = 3
RETRY_WAIT = 10  # seconds between recorder retries (per spec §6)
MIN_SNAPSHOT_BYTES = 3000
P2P_LOCAL_BASE = 18080      # first local port used for P2P tunnels (incremented per device)
P2P_READY_TIMEOUT = 25      # seconds to wait for a tunnel's local port to accept connections


# --------------------------- Dahua P2P tunnel (dh-p2p) ---------------------------
def _wait_for_port(host, port, timeout):
    """Block until (host, port) accepts a TCP connection, or timeout. Returns bool."""
    end = time.time() + timeout
    while time.time() < end:
        try:
            with socket.create_connection((host, port), timeout=1.5):
                return True
        except OSError:
            time.sleep(0.5)
    return False


class P2PTunnel:
    """Context manager that spawns the third-party `dh-p2p` binary to forward a
    local TCP port to a remote Dahua device's HTTP CGI port *over Dahua P2P*, keyed
    by the device serial — the same cloud path SmartPSS/gDMSS use. This lets ONE
    central machine reach remote-province NVRs that have no reachable LAN IP and no
    port-forwarding, with nothing installed at the sites.

    Requires the Rust `dh-p2p` build (github.com/…/dh-p2p): it is the only variant
    whose `-p [bind:]local:remote` maps an arbitrary remote port (80), whereas the
    Python PoC hardcodes RTSP 554. dh-p2p is an experimental reverse-engineered PoC
    and can be unstable; the collector degrades gracefully if a tunnel won't come up.

        dh-p2p <SERIAL> -p 127.0.0.1:<local>:<remote>
    """

    def __init__(self, bin_path, serial, local_port, remote_port=80, extra_args=None, verbose=False):
        self.bin_path = bin_path
        self.serial = serial
        self.local_port = int(local_port)
        self.remote_port = int(remote_port)
        self.extra_args = list(extra_args or [])
        self.verbose = verbose
        self.proc = None

    def __enter__(self):
        cmd = [self.bin_path, self.serial, "-p",
               f"127.0.0.1:{self.local_port}:{self.remote_port}"] + self.extra_args
        log(self.verbose, "p2p spawn:", " ".join(cmd))
        try:
            self.proc = subprocess.Popen(
                cmd,
                stdout=(None if self.verbose else subprocess.DEVNULL),
                stderr=(None if self.verbose else subprocess.DEVNULL),
            )
        except FileNotFoundError as e:
            raise RuntimeError(f"dh-p2p binary not found: {self.bin_path} ({e})")
        if not _wait_for_port("127.0.0.1", self.local_port, P2P_READY_TIMEOUT):
            self._terminate()
            raise RuntimeError(
                f"P2P tunnel for {self.serial} did not open 127.0.0.1:{self.local_port} "
                f"within {P2P_READY_TIMEOUT}s (device offline, wrong serial, or dh-p2p failed)")
        log(self.verbose, "p2p ready:", self.serial, "->127.0.0.1:%d" % self.local_port)
        return self

    def __exit__(self, *exc):
        self._terminate()
        return False

    def _terminate(self):
        if not self.proc:
            return
        try:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)
        except Exception as e:  # noqa: BLE001
            log(self.verbose, "p2p terminate error:", e)
        finally:
            self.proc = None


def log(verbose, *a):
    if verbose:
        print("[collector]", *a, file=sys.stderr)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# --------------------------- device.xml (list only) ---------------------------
def parse_device_list(path):
    tree = ET.parse(path)
    out = []
    for d in tree.getroot().iter("Device"):
        out.append({
            "name": (d.get("name") or "").strip(),
            "serial": (d.get("domain") or "").strip(),
            "httpPort": None,  # 37777 in the file is the SDK port, not HTTP; CGI uses 80/443
        })
    return out


def load_targets(path):
    if not path or not os.path.exists(path):
        return {"defaults": {}, "targets": {}}
    # utf-8-sig tolerates a UTF-8 BOM (Windows Notepad adds one), which plain
    # json.load would reject with "Expecting value: line 1 column 1".
    with open(path, "r", encoding="utf-8-sig") as f:
        text = f.read().strip()
    if not text:
        return {"defaults": {}, "targets": {}}
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise SystemExit(f"ERROR: {path} is not valid JSON ({e}). Fix it and re-run.")


# --------------------------- Dahua CGI client ---------------------------
class Dahua:
    """Minimal read-only Dahua CGI client using HTTP Digest auth (stdlib only)."""

    def __init__(self, host, username, password, http_port=80, timeout=HTTP_TIMEOUT):
        self.base = f"http://{host}:{http_port}"
        mgr = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        mgr.add_password(None, self.base, username, password)
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPDigestAuthHandler(mgr),
            urllib.request.HTTPBasicAuthHandler(mgr),
        )
        self.timeout = timeout

    def get(self, path):
        url = self.base + path
        req = urllib.request.Request(url, headers={"User-Agent": "TECHCORE-CCTV/1.0"})
        with self.opener.open(req, timeout=self.timeout) as r:
            return r.read()

    def get_text(self, path):
        return self.get(path).decode("utf-8", "replace")

    @staticmethod
    def parse_kv(text):
        """Dahua returns key=value lines; supports table.Foo[0].Bar=baz."""
        out = {}
        for line in text.splitlines():
            if "=" in line:
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip()
        return out


# --------------------------- collection ---------------------------
def collect_recorder(dev, conn, snapshot_dir, verbose):
    """Return the ingest payload dict for one recorder. Never raises."""
    serial = dev["serial"]
    result = {"serial": serial, "status": "UNKNOWN", "cameras": [], "storage": []}
    host = conn.get("host")
    if not host:
        result["status"] = "UNKNOWN"
        result["errorMessage"] = "no LAN host mapped in cctv_targets.json"
        return result

    username = conn.get("username")
    password = conn.get("password")
    http_port = int(conn.get("httpPort") or 80)
    client = Dahua(host, username, password, http_port)

    # LEVEL 1-2: reachability + auth, with retry (spec §6)
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            info = client.parse_kv(client.get_text("/cgi-bin/magicBox.cgi?action=getSystemInfo"))
            result["status"] = "ONLINE"
            result["model"] = info.get("deviceType") or info.get("updateSerial") or None
            result["deviceType"] = info.get("deviceType")
            break
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
            if e.code in (401, 403):
                result["status"] = "AUTH_ERROR"; result["errorMessage"] = "authentication failed"
                return result
        except (urllib.error.URLError, socket.timeout, OSError) as e:
            last_err = str(getattr(e, "reason", e))
        if attempt < RETRIES:
            time.sleep(RETRY_WAIT)
    if result["status"] != "ONLINE":
        result["status"] = "OFFLINE" if last_err and "timed out" in str(last_err).lower() else "NETWORK_ERROR"
        result["errorMessage"] = str(last_err)[:200]
        return result

    # firmware
    try:
        sw = client.parse_kv(client.get_text("/cgi-bin/magicBox.cgi?action=getSoftwareVersion"))
        result["firmware"] = sw.get("version")
    except Exception as e:
        log(verbose, serial, "firmware:", e)

    # channels + titles
    channels = discover_channels(client, verbose)
    result["channelCount"] = len(channels) or None
    result["capabilities"] = {"supports_cgi": True, "supports_snapshot": True, "supports_recording_search": True, "supports_hdd_status": True}

    for ch in channels:
        cam = collect_channel(client, ch, snapshot_dir, serial, verbose)
        result["cameras"].append(cam)

    # storage / HDD
    result["storage"] = collect_storage(client, verbose)
    return result


def load_p2p_map(path):
    """Read the runtime tunnel map written by techcore_p2p_supervisor.py.
    Returns {serial: {"port": int, "status": str, ...}} or {} if missing/invalid."""
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        return data.get("tunnels", {}) or {}
    except Exception:
        return {}


def collect_recorder_via_map(dev, conn, args, p2p_status):
    """Collect a P2P recorder using a tunnel already held open by the supervisor.
    Never spawns anything — just points the CGI client at the supervisor's local
    port when that tunnel is UP; otherwise reports the recorder as unreachable."""
    serial = dev["serial"]
    entry = p2p_status.get(serial)
    if not entry:
        return {"serial": serial, "status": "UNKNOWN", "cameras": [], "storage": [],
                "errorMessage": "P2P device not present in tunnel map (supervisor not running or serial not configured)"}
    if entry.get("status") != "UP":
        return {"serial": serial, "status": "OFFLINE", "cameras": [], "storage": [],
                "errorMessage": (entry.get("lastError") or f"P2P tunnel {entry.get('status','DOWN')}")[:200]}
    tconn = {**conn, "host": "127.0.0.1", "httpPort": int(entry["port"])}
    rec = collect_recorder(dev, tconn, args.snapshot_dir, args.verbose)
    caps = rec.setdefault("capabilities", {})
    caps["via"] = "dh-p2p-supervised"
    return rec


def collect_recorder_p2p(dev, conn, args, slot):
    """Collect one recorder that is reachable only over Dahua P2P: bring up a
    dh-p2p tunnel to its HTTP CGI port, run the normal CGI collection against the
    local end of the tunnel, then tear it down. Never raises — a tunnel that won't
    come up is reported as an unreachable recorder so coverage gaps stay visible."""
    serial = dev["serial"]
    if not args.p2p_bin:
        return {"serial": serial, "status": "UNKNOWN", "cameras": [], "storage": [],
                "errorMessage": "P2P device but --p2p-bin not set (need dh-p2p for remote sites)"}
    local_port = args.p2p_local_base + slot
    extra = conn.get("p2pArgs") or []
    if not isinstance(extra, list):
        extra = [str(extra)]
    try:
        with P2PTunnel(args.p2p_bin, serial, local_port, args.p2p_remote_port,
                       [str(a) for a in extra], args.verbose):
            tconn = {**conn, "host": "127.0.0.1", "httpPort": local_port}
            rec = collect_recorder(dev, tconn, args.snapshot_dir, args.verbose)
            caps = rec.setdefault("capabilities", {})
            caps["via"] = "dh-p2p"
            return rec
    except RuntimeError as e:
        return {"serial": serial, "status": "OFFLINE", "cameras": [], "storage": [],
                "errorMessage": str(e)[:200]}


def discover_channels(client, verbose):
    """Return list of {channel(1-based), name}."""
    chans = {}
    try:
        txt = client.get_text("/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle")
        kv = client.parse_kv(txt)
        for k, v in kv.items():
            # table.ChannelTitle[0].Name=Lobby
            if ".Name" in k and "[" in k:
                idx = int(k.split("[", 1)[1].split("]", 1)[0])
                chans[idx] = v
    except Exception as e:
        log(verbose, "channel titles:", e)
    if not chans:
        # Fall back to reported video-in count
        try:
            kv = client.parse_kv(client.get_text("/cgi-bin/devVideoInput.cgi?action=getCollect"))
            n = int(kv.get("result", "0")) or 0
            for i in range(n):
                chans[i] = None
        except Exception:
            pass
    return [{"channel": i + 1, "name": chans[i]} for i in sorted(chans)]


def collect_channel(client, ch, snapshot_dir, serial, verbose):
    idx0 = ch["channel"] - 1
    cam = {"channel": ch["channel"], "name": ch.get("name"), "status": "UNKNOWN",
           "recordingStatus": "UNKNOWN"}
    # LEVEL 5: snapshot as proof-of-life
    try:
        img = client.get(f"/cgi-bin/snapshot.cgi?channel={ch['channel']}")
        snap = validate_and_save_snapshot(img, snapshot_dir, serial, ch["channel"])
        cam["snapshot"] = snap
        cam["status"] = "ONLINE" if snap.get("status") == "OK" else "VIDEO_LOSS"
    except urllib.error.HTTPError as e:
        cam["status"] = "OFFLINE" if e.code in (400, 404) else "STREAM_ERROR"
    except Exception as e:
        cam["status"] = "OFFLINE"; log(verbose, serial, f"ch{ch['channel']} snapshot:", e)

    # Recording search: latest + earliest (read-only mediaFileFind)
    rec = recording_window(client, idx0, verbose)
    cam.update(rec)
    return cam


def validate_and_save_snapshot(img, snapshot_dir, serial, channel):
    status = "OK"
    if not img or len(img) < MIN_SNAPSHOT_BYTES:
        status = "TOO_SMALL"
    elif img[:2] != b"\xff\xd8":  # JPEG SOI
        status = "NOT_JPEG"
    out = {"status": status, "bytes": len(img) if img else 0}
    if status == "OK":
        wh = jpeg_dimensions(img)
        if wh:
            out["w"], out["h"] = wh
        out["_image"] = img  # kept in-memory for optional upload; stripped before JSON push
        if snapshot_dir:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            d = os.path.join(snapshot_dir, datetime.now().strftime("%Y/%m/%d"), serial)
            os.makedirs(d, exist_ok=True)
            path = os.path.join(d, f"{serial}_CAM{channel:02d}_{ts}.jpg")
            with open(path, "wb") as f:
                f.write(img)
            out["path"] = path
    return out


def upload_snapshot(base_url, key, serial, channel, img, verbose):
    """POST one JPEG to /api/cctv/snapshot as multipart/form-data (stdlib only)."""
    url = base_url.rsplit("/api/", 1)[0] + "/api/cctv/snapshot"
    boundary = "----techcore" + os.urandom(8).hex()
    def part(name, value):
        return (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n').encode()
    body = part("serial", serial) + part("channel", str(channel))
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="s.jpg"\r\n'
             f'Content-Type: image/jpeg\r\n\r\n').encode() + img + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except Exception as e:
        log(verbose, "snapshot upload failed", serial, channel, e)
        return False


def jpeg_dimensions(data):
    """Read width/height from JPEG SOF marker without any image library."""
    try:
        i = 2
        while i < len(data):
            if data[i] != 0xFF:
                i += 1; continue
            marker = data[i + 1]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h = (data[i + 5] << 8) + data[i + 6]
                w = (data[i + 7] << 8) + data[i + 8]
                return w, h
            seg = (data[i + 2] << 8) + data[i + 3]
            i += 2 + seg
    except Exception:
        return None
    return None


def recording_window(client, idx0, verbose):
    """Find earliest+latest recorded media for a channel via mediaFileFind (read-only)."""
    out = {"recordingStatus": "UNKNOWN"}
    try:
        # create finder
        fac = client.parse_kv(client.get_text("/cgi-bin/mediaFileFind.cgi?action=factory.create"))
        obj = fac.get("result")
        if not obj:
            return out
        start = "2000-01-01%2000:00:00"
        end = quote(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        client.get_text(
            f"/cgi-bin/mediaFileFind.cgi?action=findFile&object={obj}"
            f"&condition.Channel={idx0}&condition.StartTime={start}&condition.EndTime={end}&condition.Types[0]=dav")
        items = client.parse_kv(client.get_text(f"/cgi-bin/mediaFileFind.cgi?action=findNextFile&object={obj}&count=100"))
        starts = sorted(v for k, v in items.items() if k.endswith(".StartTime"))
        client.get_text(f"/cgi-bin/mediaFileFind.cgi?action=close&object={obj}")
        client.get_text(f"/cgi-bin/mediaFileFind.cgi?action=destroy&object={obj}")
        if starts:
            out["earliestRecording"] = _dahua_dt(starts[0])
            out["latestRecording"] = _dahua_dt(starts[-1])
            latest = starts[-1]
            gap = _seconds_since(latest)
            if gap is not None:
                out["recordingGapSeconds"] = gap
                out["recordingStatus"] = "RECORDING" if gap < 300 else "NOT_RECORDING"
        else:
            out["recordingStatus"] = "NO_RECORDING_FOUND"
    except Exception as e:
        log(verbose, f"ch{idx0} recording:", e)
    return out


def _dahua_dt(s):
    # "2026-08-28 14:59:48" -> ISO
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat()
    except Exception:
        return None


def _seconds_since(s):
    try:
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        return max(0, int((datetime.now(timezone.utc) - dt).total_seconds()))
    except Exception:
        return None


def collect_storage(client, verbose):
    out = []
    try:
        kv = client.parse_kv(client.get_text("/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo"))
        # keys like list[0].Detail[0].TotalBytes / UsedBytes / State
        idx = 0
        while True:
            prefix = f"list[0].Detail[{idx}]."
            if not any(k.startswith(prefix) for k in kv):
                break
            total = _to_int(kv.get(prefix + "TotalBytes"))
            used = _to_int(kv.get(prefix + "UsedBytes"))
            state = (kv.get(prefix + "State") or "").lower()
            status = "NORMAL" if state in ("normal", "") else "WARNING" if state in ("slack",) else "FAILED" if state in ("error", "bad") else "UNKNOWN"
            out.append({
                "hddIndex": idx,
                "capacityBytes": total,
                "usedBytes": used,
                "freeBytes": (total - used) if (total is not None and used is not None) else None,
                "status": status,
            })
            idx += 1
    except Exception as e:
        log(verbose, "storage:", e)
    return out


def _to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


# --------------------------- push ---------------------------
def fetch_recheck_serials(base_url, key, verbose):
    """GET /api/cctv/commands — serials an operator flagged for immediate re-check."""
    url = base_url.rsplit("/api/", 1)[0] + "/api/cctv/commands"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return set(json.loads(r.read().decode("utf-8")).get("recheckSerials", []))
    except Exception as e:
        log(verbose, "commands poll failed", e)
        return set()


def upload_pending_snapshots(base_url, key, recorders, verbose):
    """Upload each camera's JPEG (kept under snapshot._image) then strip it for JSON."""
    uploaded = 0
    for rec in recorders:
        for cam in rec.get("cameras", []):
            snap = cam.get("snapshot")
            if not isinstance(snap, dict):
                continue
            img = snap.pop("_image", None)
            if img and rec.get("serial"):
                if upload_snapshot(base_url, key, rec["serial"], cam["channel"], img, verbose):
                    uploaded += 1
    return uploaded


def push(url, key, recorders, verbose):
    body = json.dumps({"recorders": recorders}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read().decode("utf-8"))
            print("[collector] pushed:", json.dumps(resp))
            return True
    except urllib.error.HTTPError as e:
        print("[collector] push HTTP", e.code, e.read().decode("utf-8", "replace")[:300], file=sys.stderr)
    except Exception as e:
        print("[collector] push failed:", e, file=sys.stderr)
    return False


# --------------------------- LAN discovery (Dahua UDP 37810) ---------------------------
def _deep_find(obj, keys):
    """Return the first value whose key matches any of `keys` (case-insensitive), searching nested dicts/lists."""
    want = {k.lower() for k in keys}
    stack = [obj]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if k.lower() in want and isinstance(v, (str, int)):
                    return v
                stack.append(v)
        elif isinstance(cur, list):
            stack.extend(cur)
    return None


def discover_dahua(timeout=5, verbose=False):
    """Broadcast the Dahua UDP discovery probe on the local subnet and collect
    replies. Returns [{serial, ip, type, model, mac}]. Only finds devices on the
    SAME subnet as this machine (UDP broadcast does not cross routers), so run it
    once per site. Devices reached only via Dahua P2P (SmartPSS-style) will NOT
    appear here — those need a per-site collector or inter-site routing."""
    PORT = 37810
    MCAST = "239.255.255.251"
    body = b'{"method":"DHDiscover.search","params":{"mac":"","uni":1}}'
    probes = [
        bytes([0xa3, 0x01, 0x00, 0x00]) + bytes(28),                          # legacy 32-byte probe
        bytes([0xa3, 0x01, 0x00, 0x00]) + len(body).to_bytes(4, "little") + bytes(12) + body,  # JSON probe
    ]
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        sock.bind(("", PORT))
    except OSError:
        sock.bind(("", 0))  # fall back to an ephemeral port if 37810 is taken
    for p in probes:
        for dest in ("255.255.255.255", MCAST):
            try: sock.sendto(p, (dest, PORT))
            except OSError as e: log(verbose, "send", dest, e)
    found = {}
    sock.settimeout(1.0)
    end = time.time() + timeout
    while time.time() < end:
        try:
            data, addr = sock.recvfrom(65535)
        except socket.timeout:
            continue
        except OSError:
            break
        s = data
        i, j = s.find(b"{"), s.rfind(b"}")
        if i < 0 or j <= i:
            continue
        try:
            info = json.loads(s[i:j + 1].decode("utf-8", "replace"))
        except Exception:
            continue
        serial = _deep_find(info, ["SerialNo", "serialNo", "SN", "sn"])
        ip = _deep_find(info, ["IPAddress", "ipAddress", "ip", "IPv4Address"])
        if isinstance(ip, dict):
            ip = ip.get("IPAddress")
        ip = ip or addr[0]
        dtype = _deep_find(info, ["DeviceType", "deviceType", "machineName", "DeviceClass"])
        mac = _deep_find(info, ["mac", "MAC", "PhysicalAddress"])
        key = str(serial or mac or ip)
        found[key] = {"serial": serial, "ip": ip, "type": dtype, "mac": mac}
    sock.close()
    return list(found.values())


def run_discover(args):
    print(f"[discover] scanning local subnet for Dahua devices ({args.discover_timeout}s)...")
    devs = discover_dahua(args.discover_timeout, args.verbose)
    if not devs:
        print("[discover] no devices found on this subnet.")
        print("           (P2P/remote-site NVRs won't reply to LAN broadcast — run --discover at each site,")
        print("            or find IPs via Dahua ConfigTool.)")
        return
    print(f"[discover] found {len(devs)} device(s):")
    print(f"  {'SERIAL':<20} {'IP':<16} {'TYPE'}")
    for d in devs:
        print(f"  {str(d.get('serial') or '-'):<20} {str(d.get('ip') or '-'):<16} {d.get('type') or ''}")
    if args.write_targets:
        # Merge discovered serial->host into the targets file, preserving creds and
        # only filling empty/missing hosts.
        cfg = load_targets(args.targets)
        cfg.setdefault("defaults", {})
        cfg.setdefault("targets", {})
        filled = 0
        for d in devs:
            sn, ip = d.get("serial"), d.get("ip")
            if not sn or not ip:
                continue
            entry = cfg["targets"].get(sn) or {}
            if not entry.get("host"):
                entry["host"] = ip
                cfg["targets"][sn] = entry
                filled += 1
        with open(args.targets, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        print(f"[discover] wrote {filled} host(s) into {args.targets} (existing creds/hosts preserved).")
        print("           Now set 'defaults.password' (read-only account) and run without --discover.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--devices", default="device.xml", help="Dahua device.xml (device list)")
    ap.add_argument("--targets", default="cctv_targets.json", help="serial -> {host,username,password}")
    ap.add_argument("--snapshot-dir", default=os.environ.get("SNAPSHOT_DIR", "./snapshots"))
    ap.add_argument("--interval", type=int, default=int(os.environ.get("INTERVAL_SECONDS", "300")))
    ap.add_argument("--once", action="store_true", help="run a single cycle and exit")
    ap.add_argument("--no-upload-snapshots", action="store_true", help="do not upload JPEGs to TECHCORE (metadata only)")
    ap.add_argument("--discover", action="store_true", help="scan the local subnet for Dahua NVRs and print serial->IP (no TECHCORE creds needed)")
    ap.add_argument("--discover-timeout", type=int, default=5, help="seconds to listen for discovery replies")
    ap.add_argument("--write-targets", action="store_true", help="with --discover: fill discovered IPs into the targets file (preserves creds)")
    ap.add_argument("--p2p-bin", default=os.environ.get("DHP2P_BIN"),
                    help="path to the compiled dh-p2p binary; enables per-cycle P2P tunnelling for 'mode: p2p' devices")
    ap.add_argument("--p2p-map", default=os.environ.get("DHP2P_MAP"),
                    help="use persistent tunnels from techcore_p2p_supervisor.py (path to p2p_tunnels.json); "
                         "preferred over --p2p-bin — the collector reuses always-on tunnels instead of spawning per cycle")
    ap.add_argument("--p2p-default", action="store_true",
                    help="treat any device with no LAN host as a P2P device (tunnel by serial) instead of UNKNOWN")
    ap.add_argument("--p2p-remote-port", type=int, default=80,
                    help="device-side port to tunnel to (the HTTP CGI port; default 80)")
    ap.add_argument("--p2p-local-base", type=int, default=P2P_LOCAL_BASE,
                    help=f"first local port for P2P tunnels, incremented per device (default {P2P_LOCAL_BASE})")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    # Discovery needs neither TECHCORE creds nor NVR creds — run it first to map serial->IP.
    if args.discover:
        run_discover(args)
        return

    url = os.environ.get("TECHCORE_URL")
    key = os.environ.get("TECHCORE_KEY")
    if not url or not key:
        print("ERROR: set TECHCORE_URL and TECHCORE_KEY", file=sys.stderr); sys.exit(1)

    devices = parse_device_list(args.devices)
    targets = load_targets(args.targets)
    defaults = targets.get("defaults", {})
    tmap = targets.get("targets", {})
    print(f"[collector] {len(devices)} devices from {args.devices}; {len(tmap)} targets mapped")

    while True:
        rechecks = fetch_recheck_serials(url, key, args.verbose)
        if rechecks:
            print(f"[collector] Check-Now requested for: {', '.join(sorted(rechecks))}")
        payload = []
        p2p_slot = 0  # rotates local ports so back-to-back per-cycle tunnels don't collide
        p2p_status = load_p2p_map(args.p2p_map) if args.p2p_map else {}
        p2p_enabled = bool(args.p2p_map or args.p2p_bin)
        for dev in devices:
            conn = {**defaults, **tmap.get(dev["serial"], {})}
            mode = conn.get("mode") or ("ip" if conn.get("host")
                                        else ("p2p" if (p2p_enabled and args.p2p_default) else "ip"))
            if mode == "p2p":
                if args.p2p_map:
                    rec = collect_recorder_via_map(dev, conn, args, p2p_status)
                elif args.p2p_bin:
                    rec = collect_recorder_p2p(dev, conn, args, p2p_slot)
                    p2p_slot += 1
                else:
                    rec = {"serial": dev["serial"], "status": "UNKNOWN", "cameras": [], "storage": [],
                           "errorMessage": "P2P device but neither --p2p-map nor --p2p-bin set"}
            else:
                rec = collect_recorder(dev, conn, args.snapshot_dir, args.verbose)
            payload.append(rec)
            print(f"[collector] {dev['serial']} {dev['name']}: {rec['status']} "
                  f"({len(rec['cameras'])} cams, {len(rec['storage'])} hdd)")
        if not args.no_upload_snapshots:
            n = upload_pending_snapshots(url, key, payload, args.verbose)
            print(f"[collector] uploaded {n} snapshots")
        else:
            # strip in-memory images so the JSON push stays serializable
            for rec in payload:
                for cam in rec.get("cameras", []):
                    if isinstance(cam.get("snapshot"), dict):
                        cam["snapshot"].pop("_image", None)
        push(url, key, payload, args.verbose)
        if args.once:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
