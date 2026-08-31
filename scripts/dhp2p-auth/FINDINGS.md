# Dahua P2P V2 device-channel authentication — reverse-engineering notes

Purpose: reach TECHCORE's remote Dahua NVRs over Dahua P2P (Easy4IP relay) from
the central collector, for recorders on newer firmware (~2023+, e.g. V4.005 /
DevVersion 6.7.30) that reject the anonymous `p2p-channel` request with
`403 DevPwd_InvalidSalt`.

This directory is a fork of `khoanguyen-3fc/dh-p2p` (Rust, relay-capable) with the
device authentication ported in from that project's Python reference (which does
auth but not relay). Nobody upstream combines auth **and** relay — that last mile
is still open (see "Status").

## The handshake (relay mode)

1. `/probe/p2psrv`, `/online/p2psrv/{sn}`, `/online/relay`, `/probe/device/{sn}`
   — all authenticated only with the fixed Easy4IP app WSSE creds
   (`USERNAME`/`USERKEY` in `dh.rs`), same as anonymous access.
2. `/info/device/{sn}` → `<body><DevVersion>..</DevVersion><Info>BASE64</Info></body>`.
   The `<Info>` blob is **AES-256-OFB** with a *fixed* key/IV shared by every
   device (recovered from an easy4ipcloud capture, published in the upstream
   Python fork):

   - `INFO_KEY = kRjmsUB&ezmdGLL67H#$ojw@XflcaIaf`  (32 bytes)
   - `INFO_IV  = MydvJw*Iw1w&i^kk`                  (16 bytes)

   It decrypts to JSON: `{"httpport":80,"privport":37777,"randsalt":"<32 hex>",
   "rtspport":554,"tlsprivport":37778,...}`. Firmware with an empty `<Info></Info>`
   has no salt and needs no auth (old behaviour).

3. `DevAuth` key = uppercase-hex `MD5("{user}:Login to {randsalt}:{password}")`
   (bytes). This same key authenticates both the p2p-channel and relay-channel.

4. `p2p-channel` body (authenticated):
   - LocalAddr is encrypted: `get_enc(key, nonce, "127.0.0.1:{port}")` =
     base64( AES-256-OFB( PBKDF2-HMAC-SHA256(key, str(nonce), 20000, 32),
     IV=`2z52*lk9o6HRyJrf` ).encrypt(laddr) ), sent as `<IpEncrptV2>true</IpEncrptV2>
     <LocalAddr>…</LocalAddr>`.
   - `DevAuth` = base64( HMAC-SHA256(key, "{nonce}{unixtime}{laddr_enc}") ), sent
     with `<CreateDate>`, `<Nonce>`, `<RandSalt>`, `<UserName>`.
   - **Result: device returns `200 Server Nat Info!` — the 403 is gone.** ✅

5. `relay-channel` body reuses the same auth block (payload empty), nonce = the
   `<Nonce>` echoed in the p2p-channel response.

## Status

- ✅ **Authentication is solved and verified end to end** on real V2 hardware
  (DHI-NVR4216-EI, firmware V4.005 / DevVersion 6.7.30): `403 DevPwd_InvalidSalt`
  → `200 Server Nat Info!`. Both requests that carry `DevAuth` are accepted:
  - `p2p-channel` — encrypted LocalAddr + DevAuth. Accepted (200).
  - `relay-channel` — needs a FRESH nonce; reusing the p2p-channel nonce returns
    `403 DevPwd_InvalidNonce` (ErrCode 6). With a fresh nonce it is accepted.
- ⛔ **Post-auth relay handoff is still open.** After an accepted `relay-channel`
  the relay **agent never sends anything** (12s timeout) — i.e. the device never
  joins the relay, even though the cloud accepted our request. A working non-V2
  device (firmware 6.6.5, no salt) on the very same code path gets an immediate
  `200 Server Nat Info!` from the agent and completes the PTCP `Sync`.

  Attempts that did NOT change the outcome (agent still silent):
  1. fresh relay-channel nonce (this fixed the 403, nothing more);
  2. removing a diagnostic read that had briefly held the socket on the main
     server (ruled out a timing/dropped-reply cause);
  3. encrypting the `agentAddr` (`get_enc`) and signing the ciphertext, mirroring
     the p2p-channel — accepted, but the device still did not join.

  Notable response differences vs. a working device: the V2 p2p-channel response
  has `IpEncrptV2=true`, `IpType=3`, `TransType=0` and **no `<Relay>` element**,
  whereas the working device returns `IpEncrpt=false` and `<Relay>:0</Relay>`.
  The V2 relay negotiation looks genuinely different and needs a reference that
  combines V2 auth **with** relay — which no public project currently has (the
  Python fork does auth + direct only; the Rust does relay + anonymous only).

### Why both transports are blocked (final)

The direct path was ported too (decrypt the response `LocalAddr` with `get_dec`,
send the V2 STUN with the extra `\xfe\xfe\xff\xf3…` exchange). Two facts close it:

1. The decrypted device LocalAddr is **`172.16.0.2`** — a **carrier-grade NAT
   (CGNAT)** address. Direct UDP hole-punch to such a device cannot work, which
   is exactly why relay was needed in the first place.
2. Both transports converge on the **same blocker**: after `relay-channel` the
   client must read the relay agent (to obtain the PTCP `sign`) — the reference
   `main.py` does this for its direct path too. For our V2 NVR the agent never
   answers because the device never joins it, even though the cloud accepted the
   `relay-channel`. That join is cloud/device-side and not observable or fixable
   from the client. `main.py` works for its author's V2 device (not behind CGNAT,
   and whose device does join), so the gap is environment/firmware-specific and
   needs a reference that actually relays a V2 device — which does not exist
   publicly.

### Practical outcome

- 8 older-firmware sites (160 cameras) are monitored over P2P and unaffected.
- The 9 V2-firmware NVRs can be fully monitored (online + disk + recording) over
  a LAN/VPN with the collector's `mode:ip`; over P2P they remain blocked on this
  relay handoff. The auth breakthrough here is preserved so the relay path can be
  finished if a V2 reference surfaces.

## Reproduce

```
cargo build --release --target x86_64-pc-windows-gnu   # linker: x86_64-w64-mingw32-gcc
dh-p2p --relay --username admin --password '<pw>' <SERIAL> -p 127.0.0.1:28080:37777
```

Crypto lives in `src/dh.rs` (`info_randsalt`, `dev_key`, `get_enc`, `get_auth`).
NVR passwords are NOT stored here — they live only in the collector's local
`cctv_targets_live.json`.
