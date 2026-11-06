//! Origin lock. In production the API sits behind the key-checking gateway (api.clocknow.net);
//! with `ORIGIN_SECRET` set, only requests that carry it in `x-origin-secret` get through, so the
//! public Fly hostname cannot be used to skip keys and quotas. Unset = open (local development).

use axum::{
    extract::{Request, State},
    http::{StatusCode, header::HeaderName},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;

pub type Secret = Option<Arc<String>>;

pub fn from_env() -> Secret {
    std::env::var("ORIGIN_SECRET")
        .ok()
        .filter(|s| !s.is_empty())
        .map(Arc::new)
}

/// Compares without stopping at the first difference, so timing does not reveal how much matched.
fn same(a: &[u8], b: &[u8]) -> bool {
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        diff |= usize::from(a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0));
    }
    diff == 0
}

pub fn allowed(secret: &Secret, path: &str, presented: Option<&[u8]>) -> bool {
    match secret {
        None => true,
        Some(_) if path == "/health" => true,
        Some(s) => presented.is_some_and(|p| same(s.as_bytes(), p)),
    }
}

pub async fn layer(State(secret): State<Secret>, req: Request, next: Next) -> Response {
    let presented = req
        .headers()
        .get(HeaderName::from_static("x-origin-secret"))
        .map(|v| v.as_bytes());
    if allowed(&secret, req.uri().path(), presented) {
        next.run(req).await
    } else {
        StatusCode::FORBIDDEN.into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &str) -> Secret {
        Some(Arc::new(v.to_owned()))
    }

    #[test]
    fn open_when_no_secret_is_configured() {
        assert!(allowed(&None, "/v1/now", None));
    }

    #[test]
    fn locked_when_configured() {
        assert!(!allowed(&s("abc"), "/v1/now", None));
        assert!(!allowed(&s("abc"), "/v1/now", Some(b"abd")));
        assert!(!allowed(&s("abc"), "/v1/now", Some(b"abcd")));
        assert!(!allowed(&s("abc"), "/v1/now", Some(b"")));
        assert!(allowed(&s("abc"), "/v1/now", Some(b"abc")));
    }

    #[test]
    fn health_stays_open_for_the_platform_check() {
        assert!(allowed(&s("abc"), "/health", None));
    }
}
