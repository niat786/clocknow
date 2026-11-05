//! Strict CORS: only our own sites may read responses from a browser.

use axum::{
    extract::{Request, State},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;

const DEFAULT_ORIGINS: &str = "https://clocknow.net,https://www.clocknow.net";

#[derive(Debug, Clone)]
pub struct Origins(Arc<Vec<String>>);

impl Origins {
    pub fn new(list: &str) -> Self {
        Self(Arc::new(
            list.split(',')
                .map(|s| s.trim().trim_end_matches('/').to_owned())
                .filter(|s| !s.is_empty())
                .collect(),
        ))
    }

    /// `ALLOWED_ORIGINS` (comma-separated), e.g. add `http://localhost:4321` in dev.
    pub fn from_env() -> Self {
        Self::new(&std::env::var("ALLOWED_ORIGINS").unwrap_or_else(|_| DEFAULT_ORIGINS.to_owned()))
    }

    pub fn allows(&self, origin: &str) -> bool {
        self.0.iter().any(|o| o == origin)
    }
}

pub async fn layer(State(origins): State<Origins>, req: Request, next: Next) -> Response {
    let allowed = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .filter(|o| origins.allows(o))
        .and_then(|o| HeaderValue::from_str(o).ok());

    let mut res = if req.method() == Method::OPTIONS {
        match &allowed {
            Some(_) => {
                let mut r = StatusCode::NO_CONTENT.into_response();
                let h = r.headers_mut();
                h.insert(
                    header::ACCESS_CONTROL_ALLOW_METHODS,
                    HeaderValue::from_static("GET, OPTIONS"),
                );
                h.insert(
                    header::ACCESS_CONTROL_MAX_AGE,
                    HeaderValue::from_static("86400"),
                );
                r
            }
            None => StatusCode::FORBIDDEN.into_response(),
        }
    } else {
        next.run(req).await
    };

    let h = res.headers_mut();
    if let Some(origin) = allowed {
        h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
    }
    h.insert(header::VARY, HeaderValue::from_static("Origin"));
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_listed_origins() {
        let o = Origins::new("https://clocknow.net, http://localhost:4321/");
        assert!(o.allows("https://clocknow.net"));
        assert!(o.allows("http://localhost:4321"));
        assert!(!o.allows("https://clocknow.net.evil.com"));
        assert!(!o.allows("https://copycat.com"));
        assert!(!o.allows(""));
    }

    #[test]
    fn default_is_production_only() {
        let o = Origins::new(DEFAULT_ORIGINS);
        assert!(o.allows("https://www.clocknow.net"));
        assert!(!o.allows("http://localhost:4321"));
    }
}
