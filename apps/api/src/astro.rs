//! Public astronomy endpoints, all computed by time-core:
//! `GET /v1/sun?lat=24.86&lon=67.00&date=2026-11-06&tz=Asia/Karachi`
//! `GET /v1/moon` (optional `t` = Unix ms)
//! `GET /v1/seasons?year=2027`

use crate::clock;
use axum::{
    Json,
    extract::Query,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use time_core::astro::{moon, seasons, sun};
use time_core::convert::Date;

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: String,
}

fn bad(msg: impl Into<String>) -> Response {
    (
        StatusCode::BAD_REQUEST,
        [(header::CACHE_CONTROL, "no-store")],
        Json(ErrorBody { error: msg.into() }),
    )
        .into_response()
}

fn ok<T: Serialize>(body: &T, cache: &'static str) -> Response {
    ([(header::CACHE_CONTROL, cache)], Json(body)).into_response()
}

pub fn parse_date(s: &str) -> Option<Date> {
    let mut it = s.split('-');
    let (y, m, d) = (it.next()?, it.next()?, it.next()?);
    if it.next().is_some() || y.len() != 4 || m.len() != 2 || d.len() != 2 {
        return None;
    }
    Date::new(y.parse().ok()?, m.parse().ok()?, d.parse().ok()?).ok()
}

#[derive(Debug, Deserialize)]
pub struct SunQuery {
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub date: Option<String>,
    pub tz: Option<String>,
}

pub fn sun_body(q: &SunQuery) -> Result<sun::SunDay, String> {
    let (Some(lat), Some(lon)) = (q.lat, q.lon) else {
        return Err("lat and lon are required".into());
    };
    let date = q.date.as_deref().ok_or("date (YYYY-MM-DD) is required")?;
    let date = parse_date(date).ok_or("date must be YYYY-MM-DD")?;
    let zone = q.tz.as_deref().unwrap_or("UTC");
    sun::sun_day(date, lat, lon, zone).map_err(|e| e.to_string())
}

pub async fn sun_handler(Query(q): Query<SunQuery>) -> Response {
    match sun_body(&q) {
        Ok(body) => ok(&body, "public, max-age=86400"),
        Err(e) => bad(e),
    }
}

#[derive(Debug, Deserialize)]
pub struct MoonQuery {
    pub t: Option<i64>,
}

pub async fn moon_handler(Query(q): Query<MoonQuery>) -> Response {
    match q.t {
        Some(t) if !(-2_208_988_800_000..=7_258_118_400_000).contains(&t) => {
            bad("t must be between 1900 and 2200")
        }
        Some(t) => ok(&moon::moon_info(t), "public, max-age=86400"),
        None => ok(
            &moon::moon_info(clock::now_ms() as i64),
            "public, max-age=300",
        ),
    }
}

#[derive(Debug, Deserialize)]
pub struct SeasonsQuery {
    pub year: Option<i32>,
}

pub async fn seasons_handler(Query(q): Query<SeasonsQuery>) -> Response {
    let Some(year) = q.year else {
        return bad("year is required");
    };
    match seasons::seasons(year) {
        Some(s) => ok(&s, "public, max-age=604800"),
        None => bad("year must be 1000-3000"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(lat: Option<f64>, lon: Option<f64>, date: Option<&str>, tz: Option<&str>) -> SunQuery {
        SunQuery {
            lat,
            lon,
            date: date.map(str::to_owned),
            tz: tz.map(str::to_owned),
        }
    }

    #[test]
    fn dates_parse_strictly() {
        assert_eq!(parse_date("2026-11-06"), Date::new(2026, 11, 6).ok());
        assert!(parse_date("2026-2-30").is_none());
        assert!(parse_date("2026-02-30").is_none());
        assert!(parse_date("2026-11-06-01").is_none());
        assert!(parse_date("tomorrow").is_none());
    }

    #[test]
    fn sun_endpoint_body() {
        let s = sun_body(&q(
            Some(24.8607),
            Some(67.0011),
            Some("2026-11-06"),
            Some("Asia/Karachi"),
        ))
        .unwrap();
        assert!(s.sunrise.is_some() && s.sunset.is_some());
        assert!(sun_body(&q(None, Some(1.0), Some("2026-11-06"), None)).is_err());
        assert!(sun_body(&q(Some(1.0), Some(1.0), None, None)).is_err());
        assert!(sun_body(&q(Some(100.0), Some(1.0), Some("2026-11-06"), None)).is_err());
        assert!(
            sun_body(&q(
                Some(1.0),
                Some(1.0),
                Some("2026-11-06"),
                Some("Mars/Base")
            ))
            .is_err()
        );
    }
}
