//! Time-zone math on the bundled IANA database (same data in browser and server).

use jiff::Timestamp;
use jiff::tz::{TimeZone, TimeZoneDatabase};
use serde::Serialize;
use std::fmt;
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TzError {
    UnknownZone(String),
    OutOfRange(i64),
    InvalidDateTime(String),
}

impl fmt::Display for TzError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownZone(z) => write!(f, "unknown time zone: {z}"),
            Self::OutOfRange(ms) => write!(f, "timestamp out of range: {ms}"),
            Self::InvalidDateTime(d) => write!(f, "invalid date or time: {d}"),
        }
    }
}

impl std::error::Error for TzError {}

/// Wall-clock reading of an instant in a zone.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ZoneTime {
    pub zone: String,
    pub year: i16,
    pub month: i8,
    pub day: i8,
    pub hour: i8,
    pub minute: i8,
    pub second: i8,
    pub millisecond: i16,
    /// 1 = Monday … 7 = Sunday (ISO 8601).
    pub weekday: i8,
    pub offset_seconds: i32,
    pub abbreviation: String,
    pub is_dst: bool,
}

/// A future change of a zone's UTC offset.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Transition {
    pub at_unix_ms: i64,
    pub offset_before_seconds: i32,
    pub offset_after_seconds: i32,
    pub abbreviation_after: String,
    pub is_dst_after: bool,
}

/// Always the bundled copy, never the OS database, so every platform agrees.
fn db() -> &'static TimeZoneDatabase {
    static DB: OnceLock<TimeZoneDatabase> = OnceLock::new();
    DB.get_or_init(TimeZoneDatabase::bundled)
}

fn zone(name: &str) -> Result<TimeZone, TzError> {
    db().get(name)
        .map_err(|_| TzError::UnknownZone(name.to_owned()))
}

pub fn is_known_zone(name: &str) -> bool {
    zone(name).is_ok()
}

fn timestamp(unix_ms: i64) -> Result<Timestamp, TzError> {
    Timestamp::from_millisecond(unix_ms).map_err(|_| TzError::OutOfRange(unix_ms))
}

/// The tzdata release compiled into this build, e.g. "2026c".
pub fn tzdata_version() -> Option<&'static str> {
    jiff_tzdb::VERSION
}

/// Converts a UTC instant to wall-clock time in `zone_name`.
pub fn zone_time(unix_ms: i64, zone_name: &str) -> Result<ZoneTime, TzError> {
    let tz = zone(zone_name)?;
    let ts = timestamp(unix_ms)?;
    let info = tz.to_offset_info(ts);
    let z = ts.to_zoned(tz.clone());
    Ok(ZoneTime {
        zone: zone_name.to_owned(),
        year: z.year(),
        month: z.month(),
        day: z.day(),
        hour: z.hour(),
        minute: z.minute(),
        second: z.second(),
        millisecond: z.millisecond(),
        weekday: z.weekday().to_monday_one_offset(),
        offset_seconds: info.offset().seconds(),
        abbreviation: info.abbreviation().to_owned(),
        is_dst: info.dst().is_dst(),
    })
}

/// Next offset change after `unix_ms`, or `None` if the zone has no future changes.
pub fn next_transition(unix_ms: i64, zone_name: &str) -> Result<Option<Transition>, TzError> {
    let tz = zone(zone_name)?;
    let ts = timestamp(unix_ms)?;
    let before = tz.to_offset(ts).seconds();
    Ok(tz.following(ts).next().map(|t| Transition {
        at_unix_ms: t.timestamp().as_millisecond(),
        offset_before_seconds: before,
        offset_after_seconds: t.offset().seconds(),
        abbreviation_after: t.abbreviation().to_owned(),
        is_dst_after: t.dst().is_dst(),
    }))
}

/// Seconds that zone `b` is ahead of zone `a` at `unix_ms`.
pub fn offset_difference(unix_ms: i64, a: &str, b: &str) -> Result<i32, TzError> {
    let ts = timestamp(unix_ms)?;
    Ok(zone(b)?.to_offset(ts).seconds() - zone(a)?.to_offset(ts).seconds())
}

/// Converts a wall-clock date and time in `zone_name` to a Unix timestamp in milliseconds.
/// A time skipped by a DST jump resolves forward; a repeated time resolves to its first occurrence.
pub fn wall_to_unix_ms(
    year: i16,
    month: i8,
    day: i8,
    hour: i8,
    minute: i8,
    second: i8,
    zone_name: &str,
) -> Result<i64, TzError> {
    let tz = zone(zone_name)?;
    let bad = || {
        TzError::InvalidDateTime(format!(
            "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}"
        ))
    };
    let dt =
        jiff::civil::DateTime::new(year, month, day, hour, minute, second, 0).map_err(|_| bad())?;
    let zoned = dt.to_zoned(tz).map_err(|_| bad())?;
    Ok(zoned.timestamp().as_millisecond())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(s: &str) -> i64 {
        s.parse::<Timestamp>().unwrap().as_millisecond()
    }

    #[test]
    fn karachi_is_utc_plus_5_no_dst() {
        let t = zone_time(ms("2026-11-05T17:08:41.250Z"), "Asia/Karachi").unwrap();
        assert_eq!((t.year, t.month, t.day), (2026, 11, 5));
        assert_eq!(
            (t.hour, t.minute, t.second, t.millisecond),
            (22, 8, 41, 250)
        );
        assert_eq!(t.weekday, 4);
        assert_eq!(t.offset_seconds, 5 * 3600);
        assert_eq!(t.abbreviation, "PKT");
        assert!(!t.is_dst);
    }

    #[test]
    fn new_york_winter_and_next_dst_start() {
        let now = ms("2026-11-05T17:00:00Z");
        let t = zone_time(now, "America/New_York").unwrap();
        assert_eq!(t.offset_seconds, -5 * 3600);
        assert!(!t.is_dst);
        let next = next_transition(now, "America/New_York").unwrap().unwrap();
        assert_eq!(next.at_unix_ms, ms("2027-03-14T07:00:00Z"));
        assert_eq!(next.offset_before_seconds, -5 * 3600);
        assert_eq!(next.offset_after_seconds, -4 * 3600);
        assert!(next.is_dst_after);
        assert_eq!(next.abbreviation_after, "EDT");
    }

    #[test]
    fn london_next_change_is_last_sunday_of_march() {
        let next = next_transition(ms("2026-11-05T17:00:00Z"), "Europe/London")
            .unwrap()
            .unwrap();
        assert_eq!(next.at_unix_ms, ms("2027-03-28T01:00:00Z"));
    }

    #[test]
    fn karachi_has_no_upcoming_transition() {
        assert_eq!(
            next_transition(ms("2026-11-05T17:00:00Z"), "Asia/Karachi").unwrap(),
            None
        );
    }

    #[test]
    fn half_and_quarter_hour_zones() {
        let now = ms("2026-11-05T17:00:00Z");
        assert_eq!(
            offset_difference(now, "UTC", "Asia/Kathmandu").unwrap(),
            5 * 3600 + 45 * 60
        );
        assert_eq!(
            offset_difference(now, "Asia/Karachi", "Asia/Kolkata").unwrap(),
            30 * 60
        );
    }

    #[test]
    fn unknown_zone_is_an_error() {
        assert_eq!(
            zone_time(0, "Mars/Olympus"),
            Err(TzError::UnknownZone("Mars/Olympus".into()))
        );
    }

    #[test]
    fn reports_bundled_tzdata_version() {
        assert!(tzdata_version().is_some_and(|v| v.starts_with("20")));
    }

    #[test]
    fn wall_time_in_karachi_to_instant() {
        let got = wall_to_unix_ms(2026, 12, 25, 0, 0, 0, "Asia/Karachi").unwrap();
        assert_eq!(got, ms("2026-12-24T19:00:00Z"));
    }

    #[test]
    fn wall_time_in_dst_gap_moves_forward() {
        // 02:30 does not exist in New York on 2027-03-14; it resolves to 03:30 EDT.
        let got = wall_to_unix_ms(2027, 3, 14, 2, 30, 0, "America/New_York").unwrap();
        assert_eq!(got, ms("2027-03-14T07:30:00Z"));
    }

    #[test]
    fn wall_time_in_dst_overlap_takes_first() {
        // 01:30 happens twice in New York on 2026-11-01; the first is EDT.
        let got = wall_to_unix_ms(2026, 11, 1, 1, 30, 0, "America/New_York").unwrap();
        assert_eq!(got, ms("2026-11-01T05:30:00Z"));
    }

    #[test]
    fn wall_time_rejects_bad_input() {
        assert!(matches!(
            wall_to_unix_ms(2026, 2, 30, 0, 0, 0, "UTC"),
            Err(TzError::InvalidDateTime(_))
        ));
        assert!(matches!(
            wall_to_unix_ms(2026, 1, 1, 24, 0, 0, "UTC"),
            Err(TzError::InvalidDateTime(_))
        ));
        assert_eq!(
            wall_to_unix_ms(2026, 1, 1, 0, 0, 0, "Mars/Olympus"),
            Err(TzError::UnknownZone("Mars/Olympus".into()))
        );
    }
}
