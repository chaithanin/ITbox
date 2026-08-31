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

- ✅ Authentication is solved and verified end to end (403 → 200; the NVR accepts
  our `DevAuth` and returns its NAT info + encrypted LocalAddr).
- ⛔ Post-auth **relay data path is not yet working**: after `relay-channel` the
  read from the relay agent never returns. The device advertises
  `IpEncrptV2=true`, so the relayed PTCP stream is very likely V2-encrypted with
  the per-session key (`get_enc`/`get_dec`), which the Rust relay loop does not
  yet apply. The upstream Python reference authenticates but never relays, and the
  upstream Rust relays but never authenticates, so this combination is new ground.

## Reproduce

```
cargo build --release --target x86_64-pc-windows-gnu   # linker: x86_64-w64-mingw32-gcc
dh-p2p --relay --username admin --password '<pw>' <SERIAL> -p 127.0.0.1:28080:37777
```

Crypto lives in `src/dh.rs` (`info_randsalt`, `dev_key`, `get_enc`, `get_auth`).
NVR passwords are NOT stored here — they live only in the collector's local
`cctv_targets_live.json`.
