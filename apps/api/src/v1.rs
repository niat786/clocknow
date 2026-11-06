//! Zone endpoints of the public API, all computed by time-core:
//! `GET /v1/zone?tz=Asia/Karachi[&t=unix_ms]`
//! `GET /v1/convert?from=Asia/Karachi&to=America/New_York&time=2026-11-07T12:00[:00]`
//! `GET /v1/difference?a=Asia/Karachi&b=Europe/London[&t=unix_ms]`
//!
//! Every success body carries `meta` (error bound, tzdata version, server id) so a customer can
//! record exactly what produced a number.

use crate::clock;
use axum::{
    Json,
    extract::Query,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use time_core::tz::{self, TzError, ZoneTime};

#[derive(Debug, Serialize, PartialEq)]
pub struct Meta {
    /// Worst-case error of the server clock in ms, from `CLOCK_ERROR_BOUND_MS`. `null` when the
    /// operator has not measured it: we never invent an accuracy figure.
    pub error_bound_ms: Option<f64>,
    pub tzdata_version: Option<&'static str>,
    pub server_id: String,
}

pub fn meta() -> Meta {
    meta_from(std::env::var("CLOCK_ERROR_BOUND_MS").ok().as_deref())
}

fn meta_from(bound: Option<&str>) -> Meta {
    Meta {
        error_bound_ms: bound
            .and_then(|v| v.trim().parse::<f64>().ok())
            .filter(|v| v.is_finite() && *v >= 0.0),
        tzdata_version: tz::tzdata_version(),
        server_id: clock::server_id(),
    }
}

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

fn ok<T: Serialize>(body: &T) -> Response {
    ([(header::CACHE_CONTROL, "no-store")], Json(body)).into_response()
}

fn instant(t: Option<f64>) -> Result<i64, String> {
    match t {
        None => Ok(clock::now_ms() as i64),
        Some(v) if v.is_finite() => Ok(v as i64),
        Some(_) => Err("t must be a finite number of Unix milliseconds".to_owned()),
    }
}

// ---- /v1/zone ----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ZoneQuery {
    pub tz: Option<String>,
    pub t: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ZoneResponse {
    pub unix_ms: i64,
    pub time: ZoneTime,
    pub next_change: Option<tz::Transition>,
    pub meta: Meta,
}

pub fn zone_body(unix_ms: i64, name: &str) -> Result<ZoneResponse, TzError> {
    Ok(ZoneResponse {
        unix_ms,
        time: tz::zone_time(unix_ms, name)?,
        next_change: tz::next_transition(unix_ms, name)?,
        meta: meta(),
    })
}

pub async fn zone_handler(Query(q): Query<ZoneQuery>) -> Response {
    let Some(name) = q.tz else {
        return bad("tz is required, e.g. tz=Asia/Karachi");
    };
    let t = match instant(q.t) {
        Ok(t) => t,
        Err(e) => return bad(e),
    };
    match zone_body(t, &name) {
        Ok(b) => ok(&b),
        Err(e) => bad(e.to_string()),
    }
}

// ---- /v1/difference ----------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct DiffQuery {
    pub a: Option<String>,
    pub b: Option<String>,
    pub t: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct DiffResponse {
    pub unix_ms: i64,
    pub a: ZoneTime,
    pub b: ZoneTime,
    /// Seconds that `b` is ahead of `a` at this instant.
    pub b_ahead_of_a_seconds: i32,
    pub meta: Meta,
}

pub fn diff_body(unix_ms: i64, a: &str, b: &str) -> Result<DiffResponse, TzError> {
    Ok(DiffResponse {
        unix_ms,
        a: tz::zone_time(unix_ms, a)?,
        b: tz::zone_time(unix_ms, b)?,
        b_ahead_of_a_seconds: tz::offset_difference(unix_ms, a, b)?,
        meta: meta(),
    })
}

pub async fn difference_handler(Query(q): Query<DiffQuery>) -> Response {
    let (Some(a), Some(b)) = (q.a, q.b) else {
        return bad("a and b are required, e.g. a=Asia/Karachi&b=Europe/London");
    };
    let t = match instant(q.t) {
        Ok(t) => t,
        Err(e) => return bad(e),
    };
    match diff_body(t, &a, &b) {
        Ok(r) => ok(&r),
        Err(e) => bad(e.to_string()),
    }
}

// ---- /v1/convert -------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ConvertQuery {
    pub from: Option<String>,
    pub to: Option<String>,
    /// Wall-clock time in `from`: `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS`.
    pub time: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ConvertResponse {
    pub unix_ms: i64,
    pub from: ZoneTime,
    pub to: ZoneTime,
    pub meta: Meta,
}

/// Parses `2026-11-07T12:00` / `2026-11-07T12:00:30` (a space may replace the `T`).
pub fn parse_wall(s: &str) -> Option<(i16, i8, i8, i8, i8, i8)> {
    let (d, t) = s.split_once(['T', ' '])?;
    let mut dp = d.split('-');
    let (y, mo, da) = (dp.next()?, dp.next()?, dp.next()?);
    if dp.next().is_some() || y.len() != 4 || mo.len() != 2 || da.len() != 2 {
        return None;
    }
    let mut tp = t.split(':');
    let (h, mi) = (tp.next()?, tp.next()?);
    let se = tp.next().unwrap_or("00");
    if tp.next().is_some() || h.len() != 2 || mi.len() != 2 || se.len() != 2 {
        return None;
    }
    Some((
        y.parse().ok()?,
        mo.parse().ok()?,
        da.parse().ok()?,
        h.parse().ok()?,
        mi.parse().ok()?,
        se.parse().ok()?,
    ))
}

pub fn convert_body(from: &str, to: &str, time: &str) -> Result<ConvertResponse, String> {
    let (y, mo, d, h, mi, s) = parse_wall(time)
        .ok_or_else(|| "time must look like 2026-11-07T12:00 or 2026-11-07T12:00:30".to_owned())?;
    let unix_ms = tz::wall_to_unix_ms(y, mo, d, h, mi, s, from).map_err(|e| e.to_string())?;
    Ok(ConvertResponse {
        unix_ms,
        from: tz::zone_time(unix_ms, from).map_err(|e| e.to_string())?,
        to: tz::zone_time(unix_ms, to).map_err(|e| e.to_string())?,
        meta: meta(),
    })
}

pub async fn convert_handler(Query(q): Query<ConvertQuery>) -> Response {
    let (Some(from), Some(to), Some(time)) = (q.from, q.to, q.time) else {
        return bad(
            "from, to and time are required, e.g. from=Asia/Karachi&to=Europe/London&time=2026-11-07T12:00",
        );
    };
    match convert_body(&from, &to, &time) {
        Ok(r) => ok(&r),
        Err(e) => bad(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: i64 = 1_793_902_521_000; // 2026-11-05, outside every DST edge

    #[test]
    fn zone_has_offset_and_meta() {
        let r = zone_body(T, "Asia/Karachi").unwrap();
        assert_eq!(r.time.offset_seconds, 5 * 3600);
        assert!(r.next_change.is_none());
        assert!(r.meta.tzdata_version.is_some());
    }

    #[test]
    fn difference_is_signed_seconds() {
        let r = diff_body(T, "Asia/Karachi", "Europe/London").unwrap();
        assert_eq!(r.b_ahead_of_a_seconds, -5 * 3600);
        assert_eq!(
            diff_body(T, "Europe/London", "Asia/Karachi")
                .unwrap()
                .b_ahead_of_a_seconds,
            5 * 3600
        );
    }

    #[test]
    fn convert_keeps_the_instant() {
        let r = convert_body("Asia/Karachi", "Europe/London", "2026-11-07T12:00").unwrap();
        assert_eq!(r.from.hour, 12);
        assert_eq!(r.to.hour, 7);
        assert_eq!(r.to.day, 7);
    }

    #[test]
    fn convert_rejects_bad_input() {
        assert!(convert_body("Asia/Karachi", "Europe/London", "tomorrow").is_err());
        assert!(convert_body("Mars/Olympus", "Europe/London", "2026-11-07T12:00").is_err());
        assert!(convert_body("Asia/Karachi", "Europe/London", "2026-02-30T12:00").is_err());
    }

    #[test]
    fn parse_wall_accepts_seconds_and_space() {
        assert_eq!(
            parse_wall("2026-11-07 12:30:15"),
            Some((2026, 11, 7, 12, 30, 15))
        );
        assert_eq!(
            parse_wall("2026-11-07T12:30"),
            Some((2026, 11, 7, 12, 30, 0))
        );
        assert_eq!(parse_wall("2026-1-7T12:30"), None);
    }

    #[test]
    fn error_bound_is_never_invented() {
        assert_eq!(meta_from(None).error_bound_ms, None);
        assert_eq!(meta_from(Some("abc")).error_bound_ms, None);
        assert_eq!(meta_from(Some("-1")).error_bound_ms, None);
        assert_eq!(meta_from(Some("3.5")).error_bound_ms, Some(3.5));
    }
}
