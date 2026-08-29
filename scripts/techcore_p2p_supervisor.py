#!/usr/bin/env python3
"""
TECHCORE P2P Tunnel Supervisor — keeps dh-p2p relay tunnels alive for remote NVRs.
=================================================================================
Long-running companion to techcore_cctv_collector_netsdk.py. For every recorder
marked "mode": "p2p" in cctv_targets.json (remote-province sites reachable only
through SmartPSS/gDMSS), it holds ONE persistent `dh-p2p --relay` tunnel open on a
fixed local port that forwards to the device's SDK service port (37777) over Dahua
P2P, and PUSHES it back up whenever it dies or hangs (dh-p2p is an experimental
PoC). The NetSDK collector then does an ordinary TCP login to 127.0.0.1:<port>.

Why 37777 and --relay: Dahua devices expose their SDK service port (37777) over
P2P — the same channel SmartPSS uses — but NOT their HTTP CGI port, and direct
UDP hole-punching fails behind Thai carrier NAT, so relay mode is required. This
was proven working (NetSDK login over the tunnel returned all channels).

A tunnel is only reported UP once dh-p2p prints "Ready to connect!" (binding the
local port happens seconds earlier, before the P2P path is actually usable, so a
port check alone would report UP too soon and the collector would time out).

Devices that require authentication when creating the P2P channel (newer firmware
with "P2P encryption/verification" enabled) make dh-p2p print DevPwd_InvalidSalt /
403 and panic — the Rust PoC can't do channel auth. Those are marked
CHANNEL_AUTH_REQUIRED and retried slowly instead of hammered; disable that setting
on the NVR (Network > P2P) or reach them another way.

Runtime map written atomically to --map (default p2p_tunnels.json):
{
  "updatedAt": "...Z",
  "tunnels": {
    "7B06FEEPAZ8E607": { "port": 18080, "status": "UP",   "restarts": 0, "since": "..." },
    "AA0C276PAZ5B1AC": { "port": 18081, "status": "CHANNEL_AUTH_REQUIRED", "lastError": "..." }
  }
}

Usage:
  python3 techcore_p2p_supervisor.py --p2p-bin ./dh-p2p \
      --targets cctv_targets.json --map p2p_tunnels.json [--verbose]

Requires: Python 3.8+ (standard library only) + the compiled dh-p2p binary.
Runs forever; stop with Ctrl+C (all child tunnels are terminated on exit).
"""
import argparse, json, os, signal, socket, subprocess, sys, threading, time
from datetime import datetime, timezone

READY_TIMEOUT = 40         # seconds to wait for dh-p2p to print "Ready to connect!"
PROC_POLL = 3              # seconds between cheap process-liveness checks
HEALTH_EVERY = 15          # seconds between TCP health probes of a live tunnel
BACKOFF_START = 2.0        # first restart delay after a crash
BACKOFF_MAX = 60.0         # cap on restart delay
CHANNEL_AUTH_BACKOFF = 300 # slow retry for devices that need P2P-channel auth
STABLE_RESET = 120.0       # a tunnel up this long resets its backoff
MAP_WRITE_EVERY = 5        # seconds between runtime-map writes

READY_MARK = "Ready to connect!"
AUTH_MARKS = ("Authentication is not supported", "DevPwd_InvalidSalt", "403 Forbidden")


def log(verbose, *a):
    if verbose:
        print("[p2p-sup]", *a, file=sys.stderr, flush=True)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_targets(path):
    if not path or not os.path.exists(path):
        raise SystemExit(f"ERROR: targets file not found: {path}")
    with open(path, "r", encoding="utf-8-sig") as f:
        text = f.read().strip()
    try:
        return json.loads(text) if text else {}
    except json.JSONDecodeError as e:
        raise SystemExit(f"ERROR: {path} is not valid JSON ({e}).")


def p2p_devices(targets):
    """Return [{serial, p2pArgs}] for every target whose mode is p2p."""
    out = []
    for serial, conn in (targets.get("targets") or {}).items():
        conn = conn or {}
        mode = conn.get("mode") or ("ip" if conn.get("host") else "p2p")
        if mode != "p2p":
            continue
        extra = conn.get("p2pArgs") or []
        if not isinstance(extra, list):
            extra = [str(extra)]
        out.append({"serial": serial, "p2pArgs": [str(a) for a in extra]})
    return out


def port_alive(port, timeout=1.5):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


class Tunnel:
    """One supervised `dh-p2p --relay` process for a single device serial, on a
    fixed local port, forwarding to the device SDK port (37777) over Dahua P2P."""

    def __init__(self, bin_path, serial, port, extra_args, remote_port, relay, verbose):
        self.bin_path = bin_path
        self.serial = serial
        self.port = port
        self.extra_args = extra_args
        self.remote_port = remote_port
        self.relay = relay
        self.verbose = verbose
        self.lock = threading.Lock()
        self.status = "STARTING"
        self.restarts = 0
        self.since = None
        self.last_error = None
        self._proc = None
        self._ready = threading.Event()
        self._auth_required = threading.Event()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"tun-{serial}", daemon=True)

    # ---- public ----
    def start(self):
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._kill_proc()

    def snapshot(self):
        with self.lock:
            d = {"port": self.port, "status": self.status, "restarts": self.restarts}
            if self.since:
                d["since"] = self.since
            if self.last_error:
                d["lastError"] = self.last_error[:200]
            return d

    # ---- internal ----
    def _set(self, **kw):
        with self.lock:
            for k, v in kw.items():
                setattr(self, k, v)

    def _kill_proc(self):
        p = self._proc
        if not p:
            return
        try:
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait(timeout=5)
        except Exception as e:  # noqa: BLE001
            log(self.verbose, self.serial, "kill error:", e)
        self._proc = None

    def _drain(self, proc):
        """Read dh-p2p output continuously (must drain or the PoC blocks on a full
        pipe) and watch for readiness / channel-auth markers."""
        try:
            for raw in iter(proc.stdout.readline, b""):
                line = raw.decode("utf-8", "replace")
                if READY_MARK in line:
                    self._ready.set()
                if any(m in line for m in AUTH_MARKS):
                    self._auth_required.set()
                if self.verbose:
                    sys.stderr.write("[dhp2p:%s] %s" % (self.serial, line))
        except Exception:
            pass

    def _spawn(self):
        cmd = [self.bin_path]
        if self.relay:
            cmd.append("--relay")
        cmd += [self.serial, "-p", f"127.0.0.1:{self.port}:{self.remote_port}"] + self.extra_args
        log(self.verbose, "spawn:", " ".join(cmd))
        self._ready.clear()
        self._auth_required.clear()
        self._proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        threading.Thread(target=self._drain, args=(self._proc,), daemon=True).start()

    def _wait_ready(self):
        """Wait for dh-p2p's 'Ready to connect!' (the tunnel is not usable before
        that even though the port binds immediately). Returns 'ready'|'auth'|'timeout'."""
        end = time.time() + READY_TIMEOUT
        while time.time() < end:
            if self._auth_required.is_set():
                return "auth"
            if self._ready.is_set() and port_alive(self.port):
                return "ready"
            if self._proc.poll() is not None:
                return "auth" if self._auth_required.is_set() else "exited"
            time.sleep(0.4)
        return "timeout"

    def _run(self):
        backoff = BACKOFF_START
        while not self._stop.is_set():
            self._set(status="STARTING")
            try:
                self._spawn()
            except FileNotFoundError:
                self._set(status="DOWN", last_error=f"dh-p2p not found: {self.bin_path}")
                if self._stop.wait(BACKOFF_MAX):
                    break
                continue
            except Exception as e:  # noqa: BLE001
                self._set(status="DOWN", last_error=str(e))
                if self._stop.wait(backoff):
                    break
                backoff = min(BACKOFF_MAX, backoff * 2)
                continue

            outcome = self._wait_ready()
            if outcome == "auth":
                self._set(status="CHANNEL_AUTH_REQUIRED",
                          last_error="device requires P2P-channel authentication (disable P2P encryption on the NVR)")
                self._kill_proc()
                log(self.verbose, self.serial, "channel-auth required; slow retry")
                if self._stop.wait(CHANNEL_AUTH_BACKOFF):
                    break
                continue
            if outcome != "ready":
                self._set(status="DOWN",
                          last_error=("dh-p2p exited before ready" if outcome == "exited"
                                      else "tunnel not ready within timeout (device offline / relay slow)"))
                self._kill_proc()
                if self._stop.wait(backoff):
                    break
                backoff = min(BACKOFF_MAX, backoff * 2)
                continue

            self._set(status="UP", since=now_iso(), last_error=None)
            started = time.time()
            log(self.verbose, self.serial, f"UP on 127.0.0.1:{self.port}")

            # Monitor: process alive (cheap, every PROC_POLL) AND port accepting
            # (TCP-probed every HEALTH_EVERY).
            last_probe = time.time()
            while not self._stop.is_set():
                if self._proc.poll() is not None:
                    self._set(status="DOWN", last_error="dh-p2p exited; restarting")
                    break
                if time.time() - last_probe >= HEALTH_EVERY:
                    last_probe = time.time()
                    if not port_alive(self.port):
                        self._set(status="DOWN", last_error="tunnel port stopped responding (hung); restarting")
                        self._kill_proc()
                        break
                if self._stop.wait(PROC_POLL):
                    break

            self._kill_proc()
            if self._stop.is_set():
                break
            if time.time() - started >= STABLE_RESET:
                backoff = BACKOFF_START
            with self.lock:
                self.restarts += 1
            if self._stop.wait(backoff):
                break
            backoff = min(BACKOFF_MAX, backoff * 2)

        self._set(status="STOPPED")


def write_map(path, tunnels):
    data = {"updatedAt": now_iso(),
            "tunnels": {t.serial: t.snapshot() for t in tunnels}}
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--p2p-bin", default=os.environ.get("DHP2P_BIN"),
                    help="path to the compiled dh-p2p binary (required)")
    ap.add_argument("--targets", default="cctv_targets.json",
                    help="serial -> connection map; devices with mode:p2p are tunnelled")
    ap.add_argument("--map", default="p2p_tunnels.json",
                    help="runtime status file the collector reads (serial -> local port + health)")
    ap.add_argument("--local-base", type=int, default=18080,
                    help="first local port; each p2p device gets base+index (sorted by serial)")
    ap.add_argument("--remote-port", type=int, default=37777,
                    help="device-side port to tunnel to (the SDK service port; default 37777)")
    ap.add_argument("--no-relay", action="store_true",
                    help="do not pass --relay to dh-p2p (relay is on by default; needed behind NAT)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    if not args.p2p_bin:
        print("ERROR: --p2p-bin is required (path to dh-p2p).", file=sys.stderr)
        sys.exit(1)

    targets = load_targets(args.targets)
    devices = p2p_devices(targets)
    if not devices:
        print(f"[p2p-sup] no mode:p2p devices in {args.targets}; nothing to supervise.")
        write_map(args.map, [])
        return

    devices.sort(key=lambda d: d["serial"])
    relay = not args.no_relay
    tunnels = []
    for i, d in enumerate(devices):
        tunnels.append(Tunnel(args.p2p_bin, d["serial"], args.local_base + i,
                              d["p2pArgs"], args.remote_port, relay, args.verbose))
    print(f"[p2p-sup] supervising {len(tunnels)} P2P tunnel(s) via {args.p2p_bin} "
          f"(relay={'on' if relay else 'off'}, remote={args.remote_port})")
    for t in tunnels:
        print(f"[p2p-sup]   {t.serial} -> 127.0.0.1:{t.port}")

    stop = threading.Event()

    def _sig(*_):
        print("[p2p-sup] shutting down; terminating tunnels...")
        stop.set()
    signal.signal(signal.SIGINT, _sig)
    try:
        signal.signal(signal.SIGTERM, _sig)
    except (ValueError, AttributeError):
        pass

    for t in tunnels:
        t.start()

    last_summary = 0.0
    try:
        while not stop.is_set():
            write_map(args.map, tunnels)
            if time.time() - last_summary >= 60:
                up = sum(1 for t in tunnels if t.snapshot()["status"] == "UP")
                print(f"[p2p-sup] {up}/{len(tunnels)} tunnels UP")
                last_summary = time.time()
            stop.wait(MAP_WRITE_EVERY)
    finally:
        for t in tunnels:
            t.stop()
        for t in tunnels:
            t._thread.join(timeout=8)
        write_map(args.map, tunnels)
        print("[p2p-sup] stopped.")


if __name__ == "__main__":
    main()
