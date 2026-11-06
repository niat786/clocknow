//! Five-field cron expressions (minute hour day-of-month month day-of-week) and their next runs
//! in an IANA time zone, including what happens on DST days.
//! Day-of-month and day-of-week follow Vixie cron: when both are restricted, either may match.

use crate::tz::{self, TzError};
use jiff::Timestamp;
use jiff::civil::{Date as CivilDate, DateTime};
use jiff::tz::AmbiguousOffset;
use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CronError {
    FieldCount(usize),
    Bad { field: &'static str, token: String },
    Zone(TzError),
}

impl fmt::Display for CronError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FieldCount(n) => write!(
                f,
                "expected 5 fields (minute hour day month weekday), found {n}"
            ),
            Self::Bad { field, token } => write!(f, "invalid {field} value: {token}"),
            Self::Zone(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for CronError {}

impl From<TzError> for CronError {
    fn from(e: TzError) -> Self {
        Self::Zone(e)
    }
}

/// Expanded values of each field, for describing the schedule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CronFields {
    pub minutes: Vec<u8>,
    pub hours: Vec<u8>,
    pub days: Vec<u8>,
    pub months: Vec<u8>,
    /// 0 = Sunday … 6 = Saturday.
    pub weekdays: Vec<u8>,
    pub days_any: bool,
    pub weekdays_any: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CronSpec {
    minutes: u64,
    hours: u32,
    days: u32,
    months: u16,
    weekdays: u8,
    days_any: bool,
    weekdays_any: bool,
}

const MONTHS: [&str; 12] = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const DAYS: [&str; 7] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

struct Field {
    name: &'static str,
    min: u8,
    max: u8,
    names: &'static [&'static str],
}

fn value(f: &Field, s: &str) -> Option<u8> {
    let upper = s.to_ascii_uppercase();
    if let Some(i) = f.names.iter().position(|n| *n == upper) {
        return u8::try_from(i).ok().map(|i| i + f.min);
    }
    let v: u8 = s.parse().ok()?;
    // 7 is also Sunday in the weekday field.
    let max = if f.name == "weekday" { 7 } else { f.max };
    (f.min..=max).contains(&v).then_some(v)
}

/// Returns the bitmask and whether the field was `*` (or `?`).
fn field(f: &Field, text: &str) -> Result<(u64, bool), CronError> {
    let bad = |t: &str| CronError::Bad {
        field: f.name,
        token: t.to_owned(),
    };
    let mut mask = 0u64;
    let mut any = false;
    for part in text.split(',') {
        let (range, step) = match part.split_once('/') {
            Some((r, s)) => {
                let s: u8 = s.parse().map_err(|_| bad(part))?;
                if s == 0 {
                    return Err(bad(part));
                }
                (r, s)
            }
            None => (part, 1),
        };
        let (lo, hi) = if range == "*" || range == "?" {
            if step == 1 && text == range {
                any = true;
            }
            (f.min, f.max)
        } else if let Some((a, b)) = range.split_once('-') {
            let a = value(f, a).ok_or_else(|| bad(part))?;
            let b = value(f, b).ok_or_else(|| bad(part))?;
            if a > b {
                return Err(bad(part));
            }
            (a, b)
        } else {
            let a = value(f, range).ok_or_else(|| bad(part))?;
            // "5/15" means every 15 starting at 5.
            (a, if part.contains('/') { f.max } else { a })
        };
        let mut v = lo;
        while v <= hi {
            let bit = if f.name == "weekday" && v == 7 { 0 } else { v };
            mask |= 1 << bit;
            v = match v.checked_add(step) {
                Some(n) => n,
                None => break,
            };
        }
    }
    Ok((mask, any))
}

pub fn parse(expr: &str) -> Result<CronSpec, CronError> {
    let expr = expr.trim();
    let expanded = match expr.to_ascii_lowercase().as_str() {
        "@yearly" | "@annually" => "0 0 1 1 *",
        "@monthly" => "0 0 1 * *",
        "@weekly" => "0 0 * * 0",
        "@daily" | "@midnight" => "0 0 * * *",
        "@hourly" => "0 * * * *",
        _ => expr,
    };
    let parts: Vec<&str> = expanded.split_whitespace().collect();
    let [mi, h, dom, mo, dow] = parts[..] else {
        return Err(CronError::FieldCount(parts.len()));
    };
    let (minutes, _) = field(
        &Field {
            name: "minute",
            min: 0,
            max: 59,
            names: &[],
        },
        mi,
    )?;
    let (hours, _) = field(
        &Field {
            name: "hour",
            min: 0,
            max: 23,
            names: &[],
        },
        h,
    )?;
    let (days, days_any) = field(
        &Field {
            name: "day",
            min: 1,
            max: 31,
            names: &[],
        },
        dom,
    )?;
    let (months, _) = field(
        &Field {
            name: "month",
            min: 1,
            max: 12,
            names: &MONTHS,
        },
        mo,
    )?;
    let (weekdays, weekdays_any) = field(
        &Field {
            name: "weekday",
            min: 0,
            max: 6,
            names: &DAYS,
        },
        dow,
    )?;
    Ok(CronSpec {
        minutes,
        hours: hours as u32,
        days: days as u32,
        months: months as u16,
        weekdays: weekdays as u8,
        days_any,
        weekdays_any,
    })
}

fn bits(mask: u64, lo: u8, hi: u8) -> Vec<u8> {
    (lo..=hi).filter(|b| mask & (1 << b) != 0).collect()
}

impl CronSpec {
    pub fn fields(&self) -> CronFields {
        CronFields {
            minutes: bits(self.minutes, 0, 59),
            hours: bits(u64::from(self.hours), 0, 23),
            days: bits(u64::from(self.days), 1, 31),
            months: bits(u64::from(self.months), 1, 12),
            weekdays: bits(u64::from(self.weekdays), 0, 6),
            days_any: self.days_any,
            weekdays_any: self.weekdays_any,
        }
    }

    fn day_matches(&self, d: CivilDate) -> bool {
        if self.months & (1 << d.month()) == 0 {
            return false;
        }
        let dom = self.days & (1 << d.day()) != 0;
        let dow = self.weekdays & (1 << d.weekday().to_sunday_zero_offset()) != 0;
        match (self.days_any, self.weekdays_any) {
            (true, true) => true,
            (true, false) => dow,
            (false, true) => dom,
            (false, false) => dom || dow,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunNote {
    Normal,
    /// The wall time was skipped by a clock change; the run happens when the clock jumps.
    Skipped,
    /// The wall time happens twice; the run is at its first occurrence only.
    Repeated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct CronRun {
    pub unix_ms: i64,
    /// Scheduled wall time as written, which differs from the actual time when skipped.
    pub hour: u8,
    pub minute: u8,
    pub note: RunNote,
}

/// How far ahead to look (covers schedules like "29 February on a Monday").
const SEARCH_DAYS: i32 = 366 * 28;

/// Up to `count` runs strictly after `after_unix_ms`, with the schedule read in `zone_name`.
pub fn next_runs(
    spec: &CronSpec,
    after_unix_ms: i64,
    zone_name: &str,
    count: usize,
) -> Result<Vec<CronRun>, CronError> {
    let tz = tz::zone(zone_name)?;
    let start = Timestamp::from_millisecond(after_unix_ms)
        .map_err(|_| TzError::OutOfRange(after_unix_ms))?;
    let mut day = start.to_zoned(tz.clone()).date();
    let hours = bits(u64::from(spec.hours), 0, 23);
    let minutes = bits(spec.minutes, 0, 59);
    let mut out: Vec<CronRun> = Vec::new();
    for _ in 0..SEARCH_DAYS {
        if spec.day_matches(day) {
            for &h in &hours {
                for &m in &minutes {
                    let dt = DateTime::from_parts(
                        day,
                        jiff::civil::Time::constant(h as i8, m as i8, 0, 0),
                    );
                    let amb = tz.to_ambiguous_zoned(dt);
                    let note = match amb.offset() {
                        AmbiguousOffset::Unambiguous { .. } => RunNote::Normal,
                        AmbiguousOffset::Gap { .. } => RunNote::Skipped,
                        AmbiguousOffset::Fold { .. } => RunNote::Repeated,
                    };
                    let Ok(zoned) = amb.compatible() else {
                        continue;
                    };
                    let mut at = zoned.timestamp();
                    if note == RunNote::Skipped {
                        // Run at the moment of the jump, not an hour after the written time.
                        let probe = at
                            .checked_add(jiff::SignedDuration::from_millis(1))
                            .map_err(|_| TzError::OutOfRange(at.as_millisecond()))?;
                        if let Some(t) = tz.preceding(probe).next() {
                            at = t.timestamp();
                        }
                    }
                    if at <= start || out.last().is_some_and(|r| r.unix_ms >= at.as_millisecond()) {
                        continue;
                    }
                    out.push(CronRun {
                        unix_ms: at.as_millisecond(),
                        hour: h,
                        minute: m,
                        note,
                    });
                    if out.len() == count {
                        return Ok(out);
                    }
                }
            }
        }
        day = match day.tomorrow() {
            Ok(d) => d,
            Err(_) => break,
        };
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(s: &str) -> i64 {
        s.parse::<Timestamp>().unwrap().as_millisecond()
    }

    fn iso(r: &CronRun) -> String {
        Timestamp::from_millisecond(r.unix_ms).unwrap().to_string()
    }

    #[test]
    fn parses_lists_ranges_steps_and_names() {
        let f = parse("*/15 9-17 * JAN,jul MON-FRI").unwrap().fields();
        assert_eq!(f.minutes, [0, 15, 30, 45]);
        assert_eq!(f.hours, (9..=17).collect::<Vec<_>>());
        assert_eq!(f.months, [1, 7]);
        assert_eq!(f.weekdays, [1, 2, 3, 4, 5]);
        assert!(f.days_any && !f.weekdays_any);
        assert_eq!(
            parse("5/20 0 1-10/3 * 7").unwrap().fields().minutes,
            [5, 25, 45]
        );
        assert_eq!(
            parse("5/20 0 1-10/3 * 7").unwrap().fields().days,
            [1, 4, 7, 10]
        );
        assert_eq!(parse("0 0 * * 7").unwrap().fields().weekdays, [0]);
        assert_eq!(parse("@weekly").unwrap(), parse("0 0 * * 0").unwrap());
    }

    #[test]
    fn rejects_bad_expressions() {
        assert_eq!(parse("* * * *"), Err(CronError::FieldCount(4)));
        assert!(matches!(
            parse("60 * * * *"),
            Err(CronError::Bad {
                field: "minute",
                ..
            })
        ));
        assert!(matches!(
            parse("* * 0 * *"),
            Err(CronError::Bad { field: "day", .. })
        ));
        assert!(matches!(parse("*/0 * * * *"), Err(CronError::Bad { .. })));
        assert!(matches!(parse("5-1 * * * *"), Err(CronError::Bad { .. })));
        assert!(matches!(
            parse("* * * FOO *"),
            Err(CronError::Bad { field: "month", .. })
        ));
    }

    #[test]
    fn next_runs_in_a_zone() {
        let s = parse("30 9 * * MON-FRI").unwrap();
        // Friday 2026-11-06 12:00 in Karachi (07:00 UTC).
        let runs = next_runs(&s, ms("2026-11-06T07:00:00Z"), "Asia/Karachi", 3).unwrap();
        let got: Vec<String> = runs.iter().map(iso).collect();
        assert_eq!(
            got,
            [
                "2026-11-09T04:30:00Z",
                "2026-11-10T04:30:00Z",
                "2026-11-11T04:30:00Z"
            ]
        );
    }

    #[test]
    fn day_of_month_or_weekday() {
        // Vixie cron: the 13th OR any Friday.
        let s = parse("0 0 13 * FRI").unwrap();
        let runs = next_runs(&s, ms("2026-11-01T00:00:00Z"), "UTC", 3).unwrap();
        let got: Vec<String> = runs.iter().map(iso).collect();
        assert_eq!(
            got,
            [
                "2026-11-06T00:00:00Z",
                "2026-11-13T00:00:00Z",
                "2026-11-20T00:00:00Z"
            ]
        );
    }

    #[test]
    fn spring_forward_runs_once_at_the_jump() {
        // New York skips 02:00-03:00 on 2027-03-14.
        let s = parse("*/30 2 * * *").unwrap();
        let runs = next_runs(&s, ms("2027-03-13T12:00:00Z"), "America/New_York", 3).unwrap();
        let got: Vec<String> = runs.iter().map(iso).collect();
        // 02:00 and 02:30 do not exist; one run at the jump (07:00 UTC), then normal days.
        assert_eq!(
            got,
            [
                "2027-03-14T07:00:00Z",
                "2027-03-15T06:00:00Z",
                "2027-03-15T06:30:00Z"
            ]
        );
        assert_eq!(runs[0].note, RunNote::Skipped);
        assert_eq!((runs[0].hour, runs[0].minute), (2, 0));
        assert_eq!(runs[1].note, RunNote::Normal);
    }

    #[test]
    fn fall_back_runs_the_first_time_only() {
        // New York repeats 01:00-02:00 on 2026-11-01.
        let s = parse("30 1 * * *").unwrap();
        let runs = next_runs(&s, ms("2026-10-31T12:00:00Z"), "America/New_York", 2).unwrap();
        assert_eq!(iso(&runs[0]), "2026-11-01T05:30:00Z");
        assert_eq!(runs[0].note, RunNote::Repeated);
        assert_eq!(iso(&runs[1]), "2026-11-02T06:30:00Z");
    }

    #[test]
    fn rare_and_impossible_schedules() {
        let leap = next_runs(
            &parse("0 12 29 2 *").unwrap(),
            ms("2026-01-01T00:00:00Z"),
            "UTC",
            1,
        )
        .unwrap();
        assert_eq!(iso(&leap[0]), "2028-02-29T12:00:00Z");
        assert!(
            next_runs(&parse("0 0 30 2 *").unwrap(), 0, "UTC", 1)
                .unwrap()
                .is_empty()
        );
        assert!(next_runs(&parse("0 0 * * *").unwrap(), 0, "Mars/Base", 1).is_err());
    }
}
