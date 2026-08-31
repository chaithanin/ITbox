use async_trait::async_trait;
use base64::Engine;
use sha1::Digest;
use std::{collections::HashMap, net::SocketAddrV4};
use tokio::{net::UdpSocket, time};
use xml::reader::{EventReader, XmlEvent};

use crate::ptcp::{PTCPBody, PTCPSession, PTCP};

static MAIN_SERVER: &str = "www.easy4ipcloud.com:8800";

static USERNAME: &str = "cba1b29e32cb17aa46b8ff9e73c7f40b";
static USERKEY: &str = "996103384cdf19179e19243e959bbf8b";

/// Pull the text of the first <tag>...</tag> out of a raw XML string.
fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let val = xml[start..end].trim();
    if val.is_empty() {
        None
    } else {
        Some(val.to_string())
    }
}

/// Dahua "gen2" first-round password hash: uppercase-hex MD5(user:realm:password).
fn md5_upper(s: &str) -> String {
    let mut h = md5::Md5::new();
    h.update(s.as_bytes());
    h.finalize().iter().map(|b| format!("{:02X}", b)).collect()
}

// --- device-channel authentication crypto (ported from the reference Python) ---
use aes::Aes256;
use hmac::{Hmac, Mac};
use ofb::cipher::{KeyIvInit, StreamCipher};
use ofb::Ofb;
use sha2::Sha256;

type Aes256Ofb = Ofb<Aes256>;

// The cloud encrypts the <Info> payload with a fixed AES-256-OFB key/IV shared by
// every device; LocalAddr uses a per-session PBKDF2 key with this session IV.
const INFO_KEY: &[u8; 32] = b"kRjmsUB&ezmdGLL67H#$ojw@XflcaIaf";
const INFO_IV: &[u8; 16] = b"MydvJw*Iw1w&i^kk";
const SESSION_IV: &[u8; 16] = b"2z52*lk9o6HRyJrf";

fn aes256_ofb(key: &[u8; 32], iv: &[u8; 16], data: &[u8]) -> Vec<u8> {
    let mut buf = data.to_vec();
    Aes256Ofb::new(key.into(), iv.into()).apply_keystream(&mut buf);
    buf
}

/// Decrypt the <Info> base64 blob and pull "randsalt" out of the JSON.
fn info_randsalt(info_b64: &str) -> Option<String> {
    let ct = base64::engine::general_purpose::STANDARD
        .decode(info_b64.trim())
        .ok()?;
    let pt = aes256_ofb(INFO_KEY, INFO_IV, &ct);
    let s = String::from_utf8_lossy(&pt);
    // The JSON is pretty-printed ("randsalt" : "..."), so tolerate whitespace:
    // anchor on the key, skip past the colon, then take the quoted value.
    let anchor = s.find("\"randsalt\"")? + "\"randsalt\"".len();
    let after = &s[anchor..];
    let colon = after.find(':')?;
    let val = &after[colon + 1..];
    let start = val.find('"')? + 1;
    let end = val[start..].find('"')? + start;
    Some(val[start..end].to_string())
}

/// Device password key = uppercase-hex MD5("user:Login to {salt}:password") as bytes.
fn dev_key(username: &str, password: &str, randsalt: &str) -> Vec<u8> {
    md5_upper(&format!("{}:Login to {}:{}", username, randsalt, password)).into_bytes()
}

/// Encrypt the LocalAddr with a per-session PBKDF2(sha256, nonce, 20000) AES-256-OFB key.
fn get_enc(key: &[u8], nonce: u32, data: &str) -> String {
    let mut dk = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(key, nonce.to_string().as_bytes(), 20000, &mut dk);
    let enc = aes256_ofb(&dk, SESSION_IV, data.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(enc)
}

/// Build the <DevAuth> block: HMAC-SHA256(key, "{nonce}{curdate}{payload}").
fn get_auth(username: &str, key: &[u8], nonce: u32, randsalt: &str, payload: &str) -> String {
    let curdate = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let mut mac = <Hmac<Sha256>>::new_from_slice(key).unwrap();
    mac.update(format!("{}{}{}", nonce, curdate, payload).as_bytes());
    let auth = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    let salt = if randsalt.is_empty() {
        String::new()
    } else {
        format!("<RandSalt>{}</RandSalt>", randsalt)
    };
    format!(
        "<CreateDate>{}</CreateDate><DevAuth>{}</DevAuth><Nonce>{}</Nonce>{}<UserName>{}</UserName>",
        curdate, auth, nonce, salt, username
    )
}

fn ip_to_bytes(ip: &str) -> Vec<u8> {
    let addr: SocketAddrV4 = ip.parse().unwrap();
    let ip = addr.ip().octets();
    let port = addr.port();

    let mut bytes = Vec::new();
    bytes.extend_from_slice(&port.to_be_bytes());
    bytes.extend_from_slice(&ip);

    bytes.iter().map(|b| !b).collect()
}

pub async fn p2p_handshake(
    socket: UdpSocket,
    serial: String,
    relay_mode: bool,
    username: String,
    password: Option<String>,
) -> (UdpSocket, PTCPSession) {
    let mut cseq = 0;

    socket.connect(MAIN_SERVER).await.unwrap();

    socket.dh_request("/probe/p2psrv", None, &mut cseq).await;
    socket.dh_read().await;

    socket
        .dh_request(
            format!("/online/p2psrv/{}", serial).as_ref(),
            None,
            &mut cseq,
        )
        .await;
    let p2psrv = &socket.dh_read().await.body.unwrap()["body/US"];

    socket.dh_request("/online/relay", None, &mut cseq).await;
    let relay = &socket.dh_read().await.body.unwrap()["body/Address"];

    let socket2 = UdpSocket::bind("0.0.0.0:0").await.unwrap();
    socket2.connect(p2psrv).await.unwrap();

    socket2
        .dh_request(
            format!("/probe/device/{}", serial).as_ref(),
            None,
            &mut cseq,
        )
        .await;
    socket2.dh_read().await;

    // Newer firmware (~2023+) rejects the p2p-channel request with 403
    // DevPwd_InvalidSalt unless it carries a device-password authentication. The
    // per-device salt is inside the AES-256-OFB-encrypted <Info> payload; with it
    // we send an encrypted LocalAddr (IpEncrptV2) plus an HMAC-SHA256 <DevAuth>
    // block. Devices that report no salt keep the old plaintext body.
    socket2
        .dh_request(
            format!("/info/device/{}", serial).as_ref(),
            None,
            &mut cseq,
        )
        .await;
    let info_raw = socket2.dh_recv_text().await;
    let randsalt = extract_tag(&info_raw, "Info")
        .and_then(|b64| info_randsalt(&b64))
        .unwrap_or_default();
    println!(
        "[auth] randsalt={}",
        if randsalt.is_empty() { "<none>" } else { &randsalt }
    );

    let cid: [u8; 8] = rand::random();
    let cid_hex = cid
        .iter()
        .map(|b| format!("{:x}", b))
        .collect::<Vec<_>>()
        .join(" ");
    let lport = socket.local_addr().unwrap().port();

    // The device password key is reused to authenticate BOTH the p2p-channel and
    // the relay-channel, so compute it once here.
    let auth_key: Option<Vec<u8>> = match &password {
        Some(pw) if !randsalt.is_empty() => Some(dev_key(&username, pw, &randsalt)),
        _ => None,
    };

    let body = match &auth_key {
        Some(key) => {
            let nonce = rand::random::<u32>() & 0x7FFF_FFFF;
            let laddr_enc = get_enc(key, nonce, &format!("127.0.0.1:{}", lport));
            let auth = get_auth(&username, key, nonce, &randsalt, &laddr_enc);
            println!("[auth] authenticated p2p-channel (nonce={})", nonce);
            format!(
                "<body>{}<Identify>{}</Identify><IpEncrptV2>true</IpEncrptV2><LocalAddr>{}</LocalAddr><version>5.0.0</version></body>",
                auth, cid_hex, laddr_enc
            )
        }
        None => format!(
            "<body><Identify>{}</Identify><IpEncrpt>true</IpEncrpt><LocalAddr>127.0.0.1:{}</LocalAddr><version>5.0.0</version></body>",
            cid_hex, lport
        ),
    };

    socket
        .dh_request(
            format!("/device/{}/p2p-channel", serial).as_ref(),
            Some(&body),
            &mut cseq,
        )
        .await;

    socket2.connect(relay).await.unwrap();

    socket2.dh_request("/relay/agent", None, &mut cseq).await;
    let data = socket2.dh_read().await.body.unwrap();
    let token = &data["body/Token"];
    let agent = &data["body/Agent"];

    socket2.connect(agent).await.unwrap();

    socket2
        .dh_request(
            format!("/relay/start/{}", token).as_ref(),
            Some("<body><Client>:0</Client></body>"),
            &mut cseq,
        )
        .await;
    socket2.dh_read().await;

    let mut res = socket.dh_read_raw().await;

    if res.code == 100 {
        res = socket.dh_read_raw().await;
    }

    if res.code >= 400 {
        if res.code == 403 {
            println!("Device requires authentication when creating P2P channel.");
            println!("Authentication is not supported at this time.");
        }

        panic!("Error response: {}", res.status);
    }

    let data = res.body.unwrap();
    let device_laddr = &data["body/LocalAddr"];
    let device = &data["body/PubAddr"];

    // not necessary when relay_mode is true, but UDP is connectionless
    socket.connect(device).await.unwrap();

    socket2.connect(MAIN_SERVER).await.unwrap();

    // The relay-channel is authenticated too: reuse the device key with the nonce
    // the device echoed in its p2p-channel response.
    let relay_body = match &auth_key {
        Some(key) => {
            // Fresh nonce (anti-replay). V2 encrypts every address the device must
            // act on, so mirror the p2p-channel: encrypt the agentAddr and sign the
            // ciphertext in DevAuth.
            let nonce = rand::random::<u32>() & 0x7FFF_FFFF;
            let agent_enc = get_enc(key, nonce, agent);
            let auth = get_auth(&username, key, nonce, &randsalt, &agent_enc);
            format!(
                "<body>{}<IpEncrptV2>true</IpEncrptV2><agentAddr>{}</agentAddr></body>",
                auth, agent_enc
            )
        }
        None => format!("<body><agentAddr>{}</agentAddr></body>", agent),
    };

    socket2
        .dh_request(
            format!("/device/{}/relay-channel", serial).as_ref(),
            Some(&relay_body),
            &mut cseq,
        )
        .await;

    // Diagnostic (auth path): probe the relay-channel response and the relay agent
    // non-fatally so we can see exactly where the V2 relay handoff stalls.
    // Straight to the agent, same as the non-auth path: the agent answers the
    // relay-channel almost immediately, so any delay here (an earlier diagnostic
    // probe on the main socket) drops that single UDP reply and stalls the relay.
    socket2.connect(agent).await.unwrap();
    // TODO check timeout
    socket2.dh_read().await;

    let mut session = PTCPSession::new();

    socket2.ptcp_request(session.send(PTCPBody::Sync)).await;
    session.recv(socket2.ptcp_read().await);

    if relay_mode {
        return (socket2, session);
    }

    socket2
        .ptcp_request(session.send(PTCPBody::Command(
            b"\x17\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00".to_vec(),
        )))
        .await;
    let mut res = session.recv(socket2.ptcp_read().await);

    while let PTCPBody::Empty = res.body {
        res = session.recv(socket2.ptcp_read().await);
    }

    let sign = match res.body {
        PTCPBody::Command(ref c) => &c[12..],
        _ => panic!("Invalid response"),
    };

    println!(
        "Sign: {}",
        sign.iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join("")
    );

    let cookie: [u8; 4] = rand::random();
    let trans_id: [u8; 12] = rand::random();
    let cid: Vec<u8> = cid.iter().map(|b| !b).collect();

    println!(">>> {}", socket.peer_addr().unwrap());
    let data = [
        b"\xff\xfe\xff\xe7".to_vec(),
        cookie.to_vec(),
        trans_id.to_vec(),
        b"\x7f\xd5\xff\xf7".to_vec(),
        cid.clone(),
        b"\xff\xfb\xff\xf7\xff\xfe".to_vec(),
        ip_to_bytes(&device),
    ]
    .concat();
    println!(
        "Raw [{}]",
        data.iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join(" ")
    );
    socket.send(&data).await.unwrap();
    println!("---");

    println!("<<< {}", socket.peer_addr().unwrap());
    let mut buf = [0u8; 4096];

    let result = time::timeout(time::Duration::from_secs(5), socket.recv(&mut buf)).await;

    if result.is_err() {
        println!("Timeout occurred while waiting for a response from the device.");
        println!(
            "If the issue persists, you may need to use relay mode (--relay) with this device."
        );
        panic!("Timeout");
    }

    let n = result.unwrap().unwrap();
    println!(
        "Raw [{}]",
        buf[0..n]
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join(" ")
    );
    println!("---");

    let rtrans_id = &buf[8..20];

    println!(">>> {}", socket.peer_addr().unwrap());
    let data = [
        b"\xfe\xfe\xff\xe7".to_vec(),
        cookie.to_vec(),
        rtrans_id.to_vec(),
        b"\x7f\xd6\xff\xf7".to_vec(),
        cid.clone(),
        b"\xff\xfb\xff\xf7\xff\xfe".to_vec(),
        ip_to_bytes(&device_laddr),
    ]
    .concat();
    println!(
        "Raw [{}]",
        data.iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join(" ")
    );
    socket.send(&data).await.unwrap();
    println!("---");

    // read 5 times
    for _ in 0..5 {
        println!("<<< {}", socket.peer_addr().unwrap());
        let n = socket.recv(&mut buf).await.unwrap();
        println!(
            "Raw [{}]",
            buf[0..n]
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect::<Vec<_>>()
                .join(" ")
        );
        println!("---");
    }

    let mut session = PTCPSession::new();

    socket.ptcp_request(session.send(PTCPBody::Sync)).await;
    let mut res = session.recv(socket.ptcp_read().await);
    assert!(matches!(res.body, PTCPBody::Sync), "Invalid response");

    socket
        .ptcp_request(
            session.send(PTCPBody::Command(
                [
                    b"\x19\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00".to_vec(),
                    sign.to_vec(),
                ]
                .concat(),
            )),
        )
        .await;

    res = session.recv(socket.ptcp_read().await);
    while let PTCPBody::Empty = res.body {
        res = session.recv(socket.ptcp_read().await);
    }
    match res.body {
        PTCPBody::Command(ref c) => {
            assert_eq!(c[0], 0x1A, "Invalid response");
        }
        _ => panic!("Invalid response"),
    }

    socket
        .ptcp_request(session.send(PTCPBody::Command(
            b"\x1b\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00".to_vec(),
        )))
        .await;
    res = session.recv(socket.ptcp_read().await);

    assert!(matches!(res.body, PTCPBody::Empty), "Invalid response");

    (socket, session)
}

#[derive(Debug)]
#[allow(dead_code)]
struct DHResponse {
    version: String,
    code: u16,
    status: String,
    headers: HashMap<String, String>,
    body: Option<HashMap<String, String>>,
}

impl DHResponse {
    fn parse_body(body: &str) -> HashMap<String, String> {
        // XmlBody::Value("")
        let mut parser = EventReader::from_str(body);
        let mut stack = Vec::new();
        let mut tree = HashMap::new();

        loop {
            match parser.next() {
                Ok(XmlEvent::StartElement { name, .. }) => {
                    stack.push(name.local_name);
                }
                Ok(XmlEvent::EndElement { .. }) => {
                    stack.pop().unwrap();
                }
                Ok(XmlEvent::Characters(s)) => {
                    let key = stack.as_slice().join("/");
                    tree.insert(key, s);
                }
                Ok(XmlEvent::EndDocument) => {
                    break;
                }
                Err(e) => panic!("Error: {}", e),
                _ => {}
            }
        }

        tree
    }

    fn parse_response(res: &str) -> DHResponse {
        // split head and body by "\r\n\r\n"
        let mut parts = res.split("\r\n\r\n");
        let head = parts.next().unwrap();
        let body = parts.next().unwrap();

        let mut head_parts = head.split("\r\n");
        let mut status_line = head_parts.next().unwrap().split(" ");
        let version = status_line.next().unwrap().to_string();
        let code = status_line.next().unwrap().parse::<u16>().unwrap();
        let status = status_line.next().unwrap().to_string();

        let mut headers = HashMap::new();
        for line in head_parts {
            let mut parts = line.split(": ");
            let key = parts.next().unwrap().to_string();
            let value = parts.next().unwrap().to_string();
            headers.insert(key, value);
        }

        let body = match body.trim().len() {
            0 => None,
            _ => Some(DHResponse::parse_body(body)),
        };

        DHResponse {
            version,
            code,
            status,
            headers,
            body,
        }
    }
}

#[async_trait]
trait DHP2P {
    async fn dh_request(&self, path: &str, body: Option<&str>, seq: &mut u32);
    async fn dh_read_raw(&self) -> DHResponse;
    async fn dh_recv_text(&self) -> String;
    async fn dh_probe(&self, secs: u64) -> String;

    async fn dh_read(&self) -> DHResponse {
        let res = self.dh_read_raw().await;

        assert!(res.code < 300, "Error response: {}", res.status);

        res
    }
}

#[async_trait]
impl DHP2P for UdpSocket {
    async fn dh_request(&self, path: &str, body: Option<&str>, seq: &mut u32) {
        let method = match body {
            Some(_) => "DHPOST",
            None => "DHGET",
        };

        let body = match body {
            Some(s) => s,
            None => "",
        };

        // random a 32-bit number
        let nonce = rand::random::<u32>();
        // iso8601 time string
        let currdate = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let pwd = format!("{}{}DHP2P:{}:{}", nonce, currdate, USERNAME, USERKEY);

        // sha1 then base64
        let mut hasher = sha1::Sha1::new();
        hasher.update(pwd);
        let hash_digest = hasher.finalize();
        let digest = base64::engine::general_purpose::STANDARD.encode(&hash_digest);

        *seq += 1;

        let req = format!("\
            {} {} HTTP/1.1\r\n\
            CSeq: {}\r\n\
            Authorization: WSSE profile=\"UsernameToken\"\r\n\
            X-WSSE: UsernameToken Username=\"{}\", PasswordDigest=\"{}\", Nonce=\"{}\", Created=\"{}\"\r\n\r\n{}",
            method, path, seq, USERNAME, digest, nonce, currdate, body,
        );

        println!(">>> {}", self.peer_addr().unwrap());
        println!("{}", req);
        println!("---");

        self.send(req.as_bytes()).await.unwrap();
    }

    async fn dh_probe(&self, secs: u64) -> String {
        let mut buf = [0u8; 8192];
        match time::timeout(std::time::Duration::from_secs(secs), self.recv(&mut buf)).await {
            Ok(Ok(n)) => {
                let txt = String::from_utf8_lossy(&buf[..n]).to_string();
                println!("[probe] {} bytes from {}:", n, self.peer_addr().unwrap());
                println!("{}", txt);
                txt
            }
            Ok(Err(e)) => {
                println!("[probe] recv error from {}: {}", self.peer_addr().unwrap(), e);
                String::new()
            }
            Err(_) => {
                println!("[probe] NO response from {} within {}s", self.peer_addr().unwrap(), secs);
                String::new()
            }
        }
    }

    async fn dh_recv_text(&self) -> String {
        let mut buf = [0u8; 8192];
        let n = match time::timeout(std::time::Duration::from_secs(12), self.recv(&mut buf)).await {
            Ok(r) => r.unwrap(),
            Err(_) => {
                println!("[timeout] no UDP response from {} within 12s", self.peer_addr().unwrap());
                std::process::exit(2);
            }
        };
        let res = String::from_utf8_lossy(&buf[0..n]).to_string();
        println!("<<< (info) {}", self.peer_addr().unwrap());
        println!("{}", res);
        println!("---");
        res
    }

    async fn dh_read_raw(&self) -> DHResponse {
        println!("### {}", self.peer_addr().unwrap());

        let mut buf = [0u8; 4096];
        let n = match time::timeout(std::time::Duration::from_secs(12), self.recv(&mut buf)).await {
            Ok(r) => r.unwrap(),
            Err(_) => {
                println!("[timeout] no UDP response from {} within 12s", self.peer_addr().unwrap());
                std::process::exit(2);
            }
        };
        let res = String::from_utf8_lossy(&buf[0..n]);

        println!("<<< {}", self.peer_addr().unwrap());
        println!("{}", res);
        println!("---");

        let res = DHResponse::parse_response(&res);
        println!("{:?}", res);

        res
    }
}
