#!/usr/bin/env python3
"""
TECHCORE P2P Tunnel Supervisor — keeps dh-p2p tunnels alive for remote NVRs.
===========================================================================
Long-running companion to techcore_cctv_collector.py. For every recorder marked
"mode": "p2p" in cctv_targets.json (remote-province sites with no LAN IP, viewed
only through SmartPSS/gDMSS), it holds ONE persistent `dh-p2p` tunnel open on a
fixed local port and PUSHES it back up whenever it dies or hangs — so the tunnels
survive dh-p2p's crashes (it's an experimental PoC) without a human restarting it.

It decouples tunnel lifetime from the collection cadence: the collector no longer
spawns/kills a tunnel every 5 minutes; it just reads the runtime map this process
writes and talks to whatever local port is already healthy.

    dh-p2p <serial> -p 127.0.0.1:<port>:80      (one long-lived process per device)

Ports are assigned deterministically (sorted serials -> base+index), so a restart
reuses the same port and the collector's map stays stable.

Runtime map written atomically to --map (default p2p_tunnels.json):
{
  "updatedAt": "2026-08-29T...Z",
  "tunnels": {
    "7B06FEEPAZ8E607": { "port": 18080, "status": "UP",   "restarts": 0, "since": "..." },
    "9J05936PAZC710E": { "port": 18081, "status": "DOWN", "restarts": 3, "lastError": "..." }
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

READY_TIMEOUT = 25         # seconds to wait for a fresh tunnel's port to accept connections
PROC_POLL = 3              # seconds between cheap process-liveness checks
HEALTH_EVERY = 15          # seconds between TCP health probes of each live tunnel
BACKOFF_START = 2.0        # first restart delay after a crash
BACKOFF_MAX = 60.0         # cap on restart delay
STABLE_RESET = 120.0       # a tunnel up this long resets its backoff to BACKOFF_START
MAP_WRITE_EVERY = 5        # seconds between runtime-map writes


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
    """Return [{serial, p2pArgs}] for every target whose mode is p2p (explicit,
    or implied by having no host)."""
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


def wait_for_port(port, timeout):
    end = time.time() + timeout
    while time.time() < end:
        if port_alive(port):
            return True
        time.sleep(0.5)
    return False


class Tunnel:
    """One supervised dh-p2p process for a single device serial, on a fixed port."""

    def __init__(self, bin_path, serial, port, extra_args, remote_port, verbose):
        self.bin_path = bin_path
        self.serial = serial
        self.port = port
        self.extra_args = extra_args
        self.remote_port = remote_port
        self.verbose = verbose
        # shared status (read by the map writer thread)
        self.lock = threading.Lock()
        self.status = "STARTING"
        self.restarts = 0
        self.since = None
        self.last_error = None
        self._proc = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"tun-{serial}", daemon=True)

    # ---- lifecycle ----
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

    def _spawn(self):
        cmd = [self.bin_path, self.serial, "-p",
               f"127.0.0.1:{self.port}:{self.remote_port}"] + self.extra_args
        log(self.verbose, "spawn:", " ".join(cmd))
        self._proc = subprocess.Popen(
            cmd,
            stdout=(None if self.verbose else subprocess.DEVNULL),
            stderr=(None if self.verbose else subprocess.DEVNULL),
        )

    def _run(self):
        backoff = BACKOFF_START
        while not self._stop.is_set():
            self._set(status="STARTING")
            try:
                self._spawn()
            except FileNotFoundError as e:
                self._set(status="DOWN", last_error=f"dh-p2p not found: {self.bin_path}")
                log(self.verbose, self.serial, "binary missing — supervisor idle for this device")
                # No point respawning a missing binary quickly; wait long.
                if self._stop.wait(BACKOFF_MAX):
                    break
                continue
            except Exception as e:  # noqa: BLE001
                self._set(status="DOWN", last_error=str(e))
                if self._stop.wait(backoff):
                    break
                backoff = min(BACKOFF_MAX, backoff * 2)
                continue

            if wait_for_port(self.port, READY_TIMEOUT):
                self._set(status="UP", since=now_iso(), last_error=None)
                started = time.time()
                log(self.verbose, self.serial, f"UP on 127.0.0.1:{self.port}")
            else:
                self._set(status="DOWN", last_error="tunnel port did not open (device offline / wrong serial / dh-p2p failed)")
                self._kill_proc()
                if self._stop.wait(backoff):
                    break
                backoff = min(BACKOFF_MAX, backoff * 2)
                continue

            # Monitor: process must stay alive (checked cheaply every PROC_POLL) AND
            # the port must keep accepting (TCP-probed every HEALTH_EVERY).
            last_probe = time.time()
            while not self._stop.is_set():
                rc = self._proc.poll()
                if rc is not None:
                    self._set(status="DOWN", last_error=f"dh-p2p exited (code {rc})")
                    log(self.verbose, self.serial, f"exited code {rc}, will restart")
                    break
                if time.time() - last_probe >= HEALTH_EVERY:
                    last_probe = time.time()
                    if not port_alive(self.port):
                        self._set(status="DOWN", last_error="tunnel port stopped responding (hung); restarting")
                        log(self.verbose, self.serial, "port dead while process alive — killing")
                        self._kill_proc()
                        break
                if self._stop.wait(PROC_POLL):
                    break

            self._kill_proc()
            if self._stop.is_set():
                break
            # reset backoff if the tunnel had been stable for a while
            if time.time() - started >= STABLE_RESET:
                backoff = BACKOFF_START
            with self.lock:
                self.restarts += 1
            if self._stop.wait(backoff):
                break
            backoff = min(BACKOFF_MAX, backoff * 2)

        self._set(status="STOPPED")
        log(self.verbose, self.serial, "supervisor thread stopped")


def write_map(path, tunnels):
    data = {"updatedAt": now_iso(),
            "tunnels": {t.serial: t.snapshot() for t in tunnels}}
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)  # atomic on same filesystem


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
    ap.add_argument("--remote-port", type=int, default=80,
                    help="device-side port to tunnel to (HTTP CGI port; default 80)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    if not args.p2p_bin:
        print("ERROR: --p2p-bin is required (path to dh-p2p).", file=sys.stderr)
        sys.exit(1)

    targets = load_targets(args.targets)
    devices = p2p_devices(targets)
    if not devices:
        print(f"[p2p-sup] no mode:p2p devices in {args.targets}; nothing to supervise.")
        # still write an empty map so the collector sees a valid (empty) file
        write_map(args.map, [])
        return

    # deterministic port assignment: sorted serials -> base + index
    devices.sort(key=lambda d: d["serial"])
    tunnels = []
    for i, d in enumerate(devices):
        tunnels.append(Tunnel(args.p2p_bin, d["serial"], args.local_base + i,
                              d["p2pArgs"], args.remote_port, args.verbose))
    print(f"[p2p-sup] supervising {len(tunnels)} P2P tunnel(s) via {args.p2p_bin}")
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
        pass  # SIGTERM not settable on some platforms

    for t in tunnels:
        t.start()

    last_summary = 0.0
    try:
        while not stop.is_set():
            write_map(args.map, tunnels)
            # occasional human-readable heartbeat
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
