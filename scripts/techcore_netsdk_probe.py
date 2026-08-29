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
  - Dahua Python NetSDK ("General_NetSDK_Eng_Python_..."): put its NetSDK\ package
    and native libs (dhnetsdk.dll, dhconfigsdk.dll, ...) where Python can load them.
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

    # --- import the SDK (fail loudly with guidance) ---
    try:
        from NetSDK.NetClient import NetClient
        from NetSDK.SDK_Struct import (
            NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY,
            NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY,
        )
        from NetSDK.SDK_Enum import EM_LOGIN_SPAC_CAP_TYPE
    except Exception as e:  # noqa: BLE001
        print("ERROR: Dahua Python NetSDK not importable.", file=sys.stderr)
        print("Put the NetSDK package + native libs (dhnetsdk.dll ...) on the path.", file=sys.stderr)
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
        print(f"[{label}] failed: err='{err}' GetLastError=0x{code:08x}" if isinstance(code, int)
              else f"[{label}] failed: err='{err}' GetLastError={code}")
        return False

    # --- 2. try P2P (serial) login with each candidate capability ---
    print("\n--- P2P login attempts (szIP = serial) ---")
    winners = []
    # order matters: try the ones most likely to mean 'P2P by serial' first
    for name in ("P2P", "P2P_LOGIN", "PROXY", "SERVER_CONN", "ANY", "TCP"):
        if hasattr(EM_LOGIN_SPAC_CAP_TYPE, name):
            cap = getattr(EM_LOGIN_SPAC_CAP_TYPE, name)
            if try_login(f"P2P/{name}", args.serial, 0, cap):
                winners.append(name)

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
