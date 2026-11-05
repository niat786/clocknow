//! Signed time, so anyone can prove a timestamp came from clocknow.
//!
//! `GET /v1/signed?nonce=<up to 64 base64url chars>` returns
//! `{v, kid, t, radius_ms, nonce, server, sig}`: `sig` is an Ed25519 signature (base64url, no
//! padding) over [`message`]. Public keys are at `GET /.well-known/clocknow-keys.json`.
//! A client nonce proves the response is fresh (not replayed); `radius_ms` is the server's own
//! honest error bound for its clock.

use crate::clock;
use axum::{
    Extension, Json,
    extract::Query,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use ed25519_dalek::{Signature, Signer as _, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub const CONTEXT: &str = "clocknow-signed-time-v1";
pub const MAX_NONCE: usize = 64;
const MAX_ID: usize = 32;
const DEFAULT_RADIUS_MS: u32 = 100;

/// The exact bytes that are signed. Every field is restricted to `[A-Za-z0-9_-]` or digits,
/// so the newline-separated form is unambiguous.
pub fn message(kid: &str, t_ms: i64, radius_ms: u32, nonce: &str, server: &str) -> Vec<u8> {
    format!("{CONTEXT}\nkid={kid}\nt={t_ms}\nradius={radius_ms}\nnonce={nonce}\nserver={server}").into_bytes()
}

pub fn is_token(s: &str, max: usize) -> bool {
    s.len() <= max && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn clean_id(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .take(MAX_ID)
        .collect()
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Base64url without padding (RFC 4648 §5).
pub fn b64url(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |acc, (i, b)| acc | u32::from(*b) << (16 - 8 * i));
        for i in 0..=chunk.len() {
            out.push(char::from(B64[((n >> (18 - 6 * i)) & 63) as usize]));
        }
    }
    out
}

pub fn b64url_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in s.bytes() {
        let v = B64.iter().position(|x| *x == c)? as u32;
        acc = acc << 6 | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    (s.len() % 4 != 1).then_some(out)
}

fn hex32(s: &str) -> Option<[u8; 32]> {
    let s = s.trim();
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, o) in out.iter_mut().enumerate() {
        *o = u8::from_str_radix(s.get(2 * i..2 * i + 2)?, 16).ok()?;
    }
    Some(out)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignedTime {
    pub v: u8,
    pub kid: String,
    /// Server time, Unix milliseconds.
    pub t: i64,
    pub radius_ms: u32,
    pub nonce: String,
    pub server: String,
    pub sig: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KeyInfo {
    pub kid: String,
    pub alg: &'static str,
    /// Raw 32-byte Ed25519 public key, base64url.
    pub public_key: String,
    pub status: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KeysDoc {
    pub context: &'static str,
    pub keys: Vec<KeyInfo>,
}

pub struct Signer {
    kid: String,
    key: SigningKey,
    radius_ms: u32,
    retired: Vec<KeyInfo>,
}

impl Signer {
    pub fn new(kid: &str, seed: [u8; 32], radius_ms: u32, retired: Vec<KeyInfo>) -> Result<Self, String> {
        if kid.is_empty() || !is_token(kid, MAX_ID) {
            return Err("SIGNING_KEY_ID must be 1-32 characters of A-Z a-z 0-9 - _".into());
        }
        Ok(Self { kid: kid.to_owned(), key: SigningKey::from_bytes(&seed), radius_ms, retired })
    }

    /// `None` when `SIGNING_KEY` is not set (signing disabled). `SIGNING_KEY` is the 32-byte seed
    /// as 64 hex characters, `SIGNING_KEY_ID` names it, `CLOCK_RADIUS_MS` is the claimed error
    /// bound, and `RETIRED_KEYS` lists old public keys as `kid:base64url,kid:base64url`.
    pub fn from_env() -> Option<Result<Self, String>> {
        let seed = std::env::var("SIGNING_KEY").ok().filter(|s| !s.is_empty())?;
        Some((|| {
            let seed = hex32(&seed).ok_or("SIGNING_KEY must be 64 hex characters")?;
            let kid = std::env::var("SIGNING_KEY_ID").map_err(|_| "SIGNING_KEY_ID is required")?;
            let radius = match std::env::var("CLOCK_RADIUS_MS") {
                Ok(r) => r.parse().map_err(|_| "CLOCK_RADIUS_MS must be a whole number")?,
                Err(_) => DEFAULT_RADIUS_MS,
            };
            let retired = parse_retired(&std::env::var("RETIRED_KEYS").unwrap_or_default())?;
            Self::new(&kid, seed, radius, retired)
        })())
    }

    pub fn public_key(&self) -> VerifyingKey {
        self.key.verifying_key()
    }

    pub fn sign(&self, t_ms: i64, nonce: &str, server: &str) -> SignedTime {
        let server = clean_id(server);
        let sig = self.key.sign(&message(&self.kid, t_ms, self.radius_ms, nonce, &server));
        SignedTime {
            v: 1,
            kid: self.kid.clone(),
            t: t_ms,
            radius_ms: self.radius_ms,
            nonce: nonce.to_owned(),
            server,
            sig: b64url(&sig.to_bytes()),
        }
    }

    pub fn keys(&self) -> KeysDoc {
        let mut keys = vec![KeyInfo {
            kid: self.kid.clone(),
            alg: "Ed25519",
            public_key: b64url(self.public_key().as_bytes()),
            status: "current",
        }];
        keys.extend(self.retired.iter().cloned());
        KeysDoc { context: CONTEXT, keys }
    }
}

fn parse_retired(s: &str) -> Result<Vec<KeyInfo>, String> {
    s.split(',')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| {
            let (kid, key) = p.split_once(':').ok_or("RETIRED_KEYS entries are kid:base64url")?;
            let bytes = b64url_decode(key).filter(|b| b.len() == 32).ok_or("RETIRED_KEYS key must be 32 bytes")?;
            if !is_token(kid, MAX_ID) || kid.is_empty() {
                return Err("RETIRED_KEYS kid is invalid".to_owned());
            }
            Ok(KeyInfo { kid: kid.to_owned(), alg: "Ed25519", public_key: b64url(&bytes), status: "retired" })
        })
        .collect()
}

/// Checks a response against a public key. Documents the procedure; used by tests.
#[cfg_attr(not(test), allow(dead_code))]
pub fn verify(key: &VerifyingKey, st: &SignedTime) -> bool {
    let Some(sig) = b64url_decode(&st.sig).and_then(|b| <[u8; 64]>::try_from(b).ok()) else {
        return false;
    };
    st.v == 1
        && key
            .verify(&message(&st.kid, st.t, st.radius_ms, &st.nonce, &st.server), &Signature::from_bytes(&sig))
            .is_ok()
}

#[derive(Debug, Deserialize)]
pub struct SignedQuery {
    pub nonce: Option<String>,
}

pub type SharedSigner = Option<Arc<Signer>>;

fn unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [(header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({ "error": "signed time is not configured on this server" })),
    )
        .into_response()
}

pub async fn signed_handler(Extension(signer): Extension<SharedSigner>, Query(q): Query<SignedQuery>) -> Response {
    let Some(signer) = signer else { return unavailable() };
    let nonce = q.nonce.unwrap_or_default();
    if !is_token(&nonce, MAX_NONCE) {
        return (
            StatusCode::BAD_REQUEST,
            [(header::CACHE_CONTROL, "no-store")],
            Json(serde_json::json!({ "error": "nonce must be up to 64 characters of A-Z a-z 0-9 - _" })),
        )
            .into_response();
    }
    let body = signer.sign(clock::now_ms().floor() as i64, &nonce, &clock::server_id());
    ([(header::CACHE_CONTROL, "no-store")], Json(body)).into_response()
}

pub async fn keys_handler(Extension(signer): Extension<SharedSigner>) -> Response {
    match signer {
        Some(s) => ([(header::CACHE_CONTROL, "public, max-age=3600")], Json(s.keys())).into_response(),
        None => unavailable(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    const RFC_SEED: &str = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

    fn signer() -> Signer {
        Signer::new("test", hex32(RFC_SEED).unwrap(), 100, vec![]).unwrap()
    }

    #[test]
    fn rfc8032_test_vector_1() {
        let key = SigningKey::from_bytes(&hex32(RFC_SEED).unwrap());
        assert_eq!(key.verifying_key().as_bytes().to_vec(), hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"));
        let sig = key.sign(b"");
        assert_eq!(
            sig.to_bytes().to_vec(),
            hex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")
        );
    }

    #[test]
    fn message_format_is_stable() {
        assert_eq!(
            String::from_utf8(message("k1", 1_793_929_327_182, 100, "abc_-123", "fly-sin-abc123")).unwrap(),
            "clocknow-signed-time-v1\nkid=k1\nt=1793929327182\nradius=100\nnonce=abc_-123\nserver=fly-sin-abc123"
        );
    }

    /// Shared with apps/web/src/lib/signed-time.test.ts so both sides agree byte for byte.
    #[test]
    fn golden_vector() {
        let st = signer().sign(1_793_929_327_182, "abc_-123", "fly-sin-abc123");
        assert_eq!(st.sig, GOLDEN_SIG);
        assert!(verify(&signer().public_key(), &st));
    }

    const GOLDEN_SIG: &str = "F_Q0B9s2zyXPZ8iUJTu-tcGerFPbjy1m9fmAH9X2L56SipOTcfpg8bne0YOJAWZks03XNulSkvObhoVm2TAhBQ";

    #[test]
    fn tampering_is_detected() {
        let s = signer();
        let st = s.sign(1_000, "n", "srv");
        assert!(verify(&s.public_key(), &st));
        for bad in [
            SignedTime { t: 1_001, ..st.clone() },
            SignedTime { nonce: "m".into(), ..st.clone() },
            SignedTime { radius_ms: 1, ..st.clone() },
            SignedTime { server: "other".into(), ..st.clone() },
            SignedTime { kid: "other".into(), ..st.clone() },
            SignedTime { v: 2, ..st.clone() },
            SignedTime { sig: "AAAA".into(), ..st.clone() },
        ] {
            assert!(!verify(&s.public_key(), &bad), "{bad:?}");
        }
        let other = Signer::new("x", [7u8; 32], 100, vec![]).unwrap();
        assert!(!verify(&other.public_key(), &st));
    }

    #[test]
    fn server_ids_are_cleaned() {
        let st = signer().sign(1, "", "fly sin\nevil=1");
        assert_eq!(st.server, "fly-sin-evil-1");
        assert!(verify(&signer().public_key(), &st));
    }

    #[test]
    fn base64url_round_trip() {
        assert_eq!(b64url(&[0xfb, 0xff]), "-_8");
        assert_eq!(b64url(b"hello"), "aGVsbG8");
        assert_eq!(b64url(b""), "");
        for n in 0..70u8 {
            let data: Vec<u8> = (0..n).map(|i| i.wrapping_mul(37)).collect();
            assert_eq!(b64url_decode(&b64url(&data)).unwrap(), data);
        }
        assert!(b64url_decode("a+b").is_none());
        assert!(b64url_decode("a").is_none());
    }

    #[test]
    fn tokens_and_config() {
        assert!(is_token("abc-_09", 64));
        assert!(!is_token("a b", 64));
        assert!(!is_token(&"a".repeat(65), 64));
        assert!(Signer::new("", [1; 32], 1, vec![]).is_err());
        assert!(Signer::new("bad kid", [1; 32], 1, vec![]).is_err());
        assert!(hex32("zz").is_none());
        let pk = b64url(&[3u8; 32]);
        let r = parse_retired(&format!("2025-05:{pk}, 2025-11:{pk}")).unwrap();
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].status, "retired");
        assert!(parse_retired("x:short").is_err());
        assert!(parse_retired("").unwrap().is_empty());
        let s = Signer::new("2026-11", [1; 32], 50, r).unwrap();
        let doc = s.keys();
        assert_eq!(doc.keys.len(), 3);
        assert_eq!(doc.keys[0].status, "current");
    }
}
