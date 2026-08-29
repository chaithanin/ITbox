#!/usr/bin/env python3
"""
TECHCORE NetSDK P2P probe — find the working P2P login method for your devices.
==============================================================================
The Dahua Python NetSDK exposes P2P (serial-number) login slightly differently
across releases (the enum member is variously P2P / PROXY / SERVER_CONN, and some
builds need pCapParam set). Rather than guess, this probe:

  1. prints the NetSDK version and every EM_LOGIN_SPAC_CAP_TYPE member it exposes,
  2. tries to log in to ONE device by serial using each plausible capability type,
  3. reports exactly which one succeeds (+ model / channel count), or the SDK error
     code for each failure (so we can read what the device/cloud is complaining about).

Whatever it reports as WORKING is the emSpecCap the collector should use — tell me
the output and I'll lock it into techcore_cctv_collector_netsdk.py.

Prereqs (on this one central PC, the same box that runs SmartPSS):
  - Dahua Python NetSDK ("General_NetSDK_Eng_Python_..."): put its NetSDK package
    (the folder holding NetClient.py) and native libs (dhnetsdk.dll, dhconfigsdk.dll,
    ...) where Python can load them.
  - This machine must reach the internet (P2P goes out to Dahua's cloud, like SmartPSS).

Usage:
  python techcore_netsdk_probe.py --serial 7B06FEEPAZ8E607 --user admin --password "SECRET"
  # direct-IP sanity check (optional, if the device also has a reachable LAN IP):
  python techcore_netsdk_probe.py --serial X --user admin --password P --ip 192.168.2.11 --port 37777
"""
import argparse, sys
from ctypes import sizeof


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serial", required=True, help="device serial number (P2P login target)")
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", required=True)
    ap.add_argument("--ip", default=None, help="optional: also try a direct-IP login for comparison")
    ap.add_argument("--port", type=int, default=37777)
    args = ap.parse_args()

    # --- import the SDK (tolerate both layouts) ---
    # Official Dahua package: `from NetSDK.NetClient import NetClient` (NetSDK/ folder).
    # Flat layout (the one we ship): NetSDK.py/SDK_*.py side-by-side in this folder.
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
        print("ERROR: Dahua Python NetSDK not importable.", file=sys.stderr)
        print("Put NetSDK.py + SDK_Struct.py + SDK_Enum.py + SDK_Callback.py + Libs\\win64\\ here.", file=sys.stderr)
        print("Import error:", e, file=sys.stderr)
        sys.exit(2)

    # --- 1. enumerate the capability types this build exposes ---
    print("=" * 70)
    members = [n for n in dir(EM_LOGIN_SPAC_CAP_TYPE) if not n.startswith("_")]
    print("EM_LOGIN_SPAC_CAP_TYPE members exposed by this NetSDK build:")
    for n in members:
        try:
            print(f"   {n} = {int(getattr(EM_LOGIN_SPAC_CAP_TYPE, n))}")
        except Exception:
            print(f"   {n} = <non-int>")
    print("=" * 70)

    sdk = NetClient()
    sdk.InitEx(None)

    # Dahua NetSDK error names for the codes we've seen, so the output is readable.
    ERR_NAMES = {
        0x6b: "main connection failed (transport/P2P could not reach device)",
        0x6c: "connect failed / device offline via this path",
        0x00: "no error",
    }

    def try_login(label, ip, port, cap):
        inp = NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY()
        inp.dwSize = sizeof(NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY)
        inp.szIP = ip.encode()
        inp.nPort = int(port)
        inp.szUserName = args.user.encode()
        inp.szPassword = args.password.encode()
        inp.emSpecCap = cap
        inp.pCapParam = None
        outp = NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY()
        outp.dwSize = sizeof(NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY)
        try:
            login_id, device_info, err = sdk.LoginWithHighLevelSecurity(inp, outp)
        except Exception as e:  # noqa: BLE001
            print(f"[{label}] EXCEPTION: {e}")
            return False
        if login_id:
            chan = 0
            for attr in ("nChanNum", "byChanNum", "nChannelNum"):
                v = getattr(device_info, attr, None)
                if isinstance(v, int) and v > 0:
                    chan = v; break
            print(f"[{label}] *** SUCCESS *** loginID={login_id} channels={chan}")
            sdk.Logout(login_id)
            return True
        try:
            code = sdk.GetLastError()
        except Exception:
            code = "?"
        note = ERR_NAMES.get(code, "") if isinstance(code, int) else ""
        if isinstance(code, int):
            print(f"[{label}] failed: err='{err}' GetLastError=0x{code:08x} {('('+note+')') if note else ''}")
        else:
            print(f"[{label}] failed: err='{err}' GetLastError={code}")
        return False

    # --- 2. try P2P (serial) login with each candidate capability ---
    # The Dahua docs + device.xml (connect="19") indicate emSpecCap = 19 means P2P.
    # Different SDK builds may expose that as a named member OR only as the raw value,
    # so try both: named members that look P2P-ish, plus the raw int 19 (and a couple
    # of neighbours seen in the wild). Dedupe by the integer cap value.
    print("\n--- P2P login attempts (szIP = serial) ---")
    winners = []
    candidates = []  # (label, cap_int)
    seen_caps = set()

    def add_cap(label, cap):
        try:
            civ = int(cap)
        except Exception:
            return
        if civ in seen_caps:
            return
        seen_caps.add(civ)
        candidates.append((label, civ))

    # The two capabilities that mean "reach the device through Dahua's cloud":
    # P2P=19 (web private / P2P) and CLOUD=16 (cloud login). Try each over the
    # ports NetSDK P2P is known to want: 0 (let the SDK decide) and 37777 (the SDK
    # service port the tunnel targets). Also try the serial with a trailing nothing.
    for name in ("P2P", "CLOUD"):
        if hasattr(EM_LOGIN_SPAC_CAP_TYPE, name):
            add_cap(f"{name}={int(getattr(EM_LOGIN_SPAC_CAP_TYPE, name))}",
                    getattr(EM_LOGIN_SPAC_CAP_TYPE, name))
    for raw in (19, 16):
        add_cap(f"raw:{raw}", raw)

    ports_to_try = [0, 37777]
    for label, cap in candidates:
        for p in ports_to_try:
            if try_login(f"P2P[{label} port={p}]", args.serial, p, cap):
                winners.append(f"{label} port={p}")

    # a couple of last-resort single-port attempts with other caps
    for name in ("SERVER_CONN", "ANY", "TCP"):
        if hasattr(EM_LOGIN_SPAC_CAP_TYPE, name):
            cap = int(getattr(EM_LOGIN_SPAC_CAP_TYPE, name))
            if try_login(f"P2P[{name}={cap} port=0]", args.serial, 0, cap):
                winners.append(f"{name} port=0")

    # --- 3. optional direct-IP comparison ---
    if args.ip:
        print("\n--- direct-IP login (comparison) ---")
        cap_tcp = getattr(EM_LOGIN_SPAC_CAP_TYPE, "TCP", list(EM_LOGIN_SPAC_CAP_TYPE)[0]
                          if hasattr(EM_LOGIN_SPAC_CAP_TYPE, "__iter__") else 0)
        try_login("IP/TCP", args.ip, args.port, cap_tcp)

    sdk.Cleanup()
    print("\n" + "=" * 70)
    if winners:
        print(f"WORKING P2P capability type(s): {', '.join(winners)}")
        print(f"-> tell me this and I'll lock '{winners[0]}' into the collector.")
    else:
        print("No P2P capability worked. Copy the whole output above (esp. the enum")
        print("member list + GetLastError codes) and send it back — the error code")
        print("tells us if it's auth, cloud unreachable, or an unsupported build.")
    print("=" * 70)


if __name__ == "__main__":
    main()
