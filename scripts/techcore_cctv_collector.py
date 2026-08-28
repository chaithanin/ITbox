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

Usage:
  TECHCORE_URL=https://<techcore>/api/cctv/ingest \
  TECHCORE_KEY=tck_xxx \
  python3 techcore_cctv_collector.py --devices device.xml --targets cctv_targets.json \
    [--snapshot-dir ./snapshots] [--once] [--verbose]

Requires: Python 3.8+ (standard library only).
"""
import argparse, base64, json, os, socket, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone
from urllib.parse import quote
from xml.etree import ElementTree as ET

HTTP_TIMEOUT = 10
RETRIES = 3
RETRY_WAIT = 10  # seconds between recorder retries (per spec §6)
MIN_SNAPSHOT_BYTES = 3000


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
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


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
    if status == "OK" and snapshot_dir:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        d = os.path.join(snapshot_dir, datetime.now().strftime("%Y/%m/%d"), serial)
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, f"{serial}_CAM{channel:02d}_{ts}.jpg")
        with open(path, "wb") as f:
            f.write(img)
        out["path"] = path
        wh = jpeg_dimensions(img)
        if wh:
            out["w"], out["h"] = wh
    return out


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--devices", default="device.xml", help="Dahua device.xml (device list)")
    ap.add_argument("--targets", default="cctv_targets.json", help="serial -> {host,username,password}")
    ap.add_argument("--snapshot-dir", default=os.environ.get("SNAPSHOT_DIR", "./snapshots"))
    ap.add_argument("--interval", type=int, default=int(os.environ.get("INTERVAL_SECONDS", "300")))
    ap.add_argument("--once", action="store_true", help="run a single cycle and exit")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

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
        payload = []
        for dev in devices:
            conn = {**defaults, **tmap.get(dev["serial"], {})}
            rec = collect_recorder(dev, conn, args.snapshot_dir, args.verbose)
            payload.append(rec)
            print(f"[collector] {dev['serial']} {dev['name']}: {rec['status']} "
                  f"({len(rec['cameras'])} cams, {len(rec['storage'])} hdd)")
        push(url, key, payload, args.verbose)
        if args.once:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
