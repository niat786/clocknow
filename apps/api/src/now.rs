//! `GET /v1/now?tz=Asia/Karachi` — server timestamps for one-shot sync, plus optional zone time.

use crate::clock;
use axum::{
    Json,
    extract::Query,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use time_core::tz::{self, TzError, ZoneTime};

#[derive(Debug, Deserialize)]
pub struct NowQuery {
    pub tz: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NowResponse {
    /// Server receive time (sync `t1`).
    pub t1: f64,
    /// Server send time (sync `t2`); also the reported current time.
    pub t2: f64,
    pub server_id: String,
    pub tzdata_version: Option<&'static str>,
    pub zone: Option<ZoneTime>,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: String,
}

pub fn build(t1: f64, tz_name: Option<&str>) -> Result<NowResponse, TzError> {
    let zone = tz_name.map(|z| tz::zone_time(t1 as i64, z)).transpose()?;
    Ok(NowResponse {
        t1,
        t2: t1,
        server_id: clock::server_id(),
        tzdata_version: tz::tzdata_version(),
        zone,
    })
}

pub async fn handler(Query(q): Query<NowQuery>) -> Response {
    let t1 = clock::now_ms();
    let no_store = [(header::CACHE_CONTROL, "no-store")];
    match build(t1, q.tz.as_deref()) {
        Ok(mut body) => {
            body.t2 = clock::now_ms();
            (no_store, Json(body)).into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            no_store,
            Json(ErrorBody {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn includes_zone_when_asked() {
        let r = build(1_793_902_521_000.0, Some("Asia/Karachi")).unwrap();
        let z = r.zone.unwrap();
        assert_eq!(z.offset_seconds, 5 * 3600);
        assert!(r.tzdata_version.is_some());
    }

    #[test]
    fn no_zone_by_default() {
        assert!(build(0.0, None).unwrap().zone.is_none());
    }

    #[test]
    fn unknown_zone_is_rejected() {
        assert!(build(0.0, Some("Mars/Olympus")).is_err());
    }
}
