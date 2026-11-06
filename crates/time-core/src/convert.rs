//! Converters: Unix timestamps, calendar date differences, business days.
//! Pure civil-date maths (proleptic Gregorian, years 1..=9999). No time zones here.

use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConvertError {
    InvalidDate,
    InvalidNumber,
    OutOfRange,
    InvalidWeekend,
}

impl fmt::Display for ConvertError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InvalidDate => "invalid date",
            Self::InvalidNumber => "not a valid number",
            Self::OutOfRange => "value out of supported range",
            Self::InvalidWeekend => "weekend mask must be 0..=127 (bit 0 = Monday)",
        })
    }
}

impl std::error::Error for ConvertError {}

const MIN_YEAR: i32 = 1;
const MAX_YEAR: i32 = 9999;
/// Bit 0 = Monday … bit 6 = Sunday.
pub const WEEKEND_SAT_SUN: u8 = 0b110_0000;
pub const WEEKEND_FRI_SAT: u8 = 0b011_0000;
const MAX_STEP: i64 = 36_500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct Date {
    pub year: i32,
    pub month: u8,
    pub day: u8,
}

pub fn is_leap(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

pub fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if is_leap(year) => 29,
        _ => 28,
    }
}

impl Date {
    pub fn new(year: i32, month: u8, day: u8) -> Result<Self, ConvertError> {
        if !(MIN_YEAR..=MAX_YEAR).contains(&year)
            || !(1..=12).contains(&month)
            || day == 0
            || day > days_in_month(year, month)
        {
            return Err(ConvertError::InvalidDate);
        }
        Ok(Self { year, month, day })
    }

    /// Days since 1970-01-01.
    pub fn to_days(self) -> i64 {
        let y = i64::from(self.year) - i64::from(self.month <= 2);
        let era = y.div_euclid(400);
        let yoe = y.rem_euclid(400);
        let mp = (i64::from(self.month) + 9) % 12;
        let doy = (153 * mp + 2) / 5 + i64::from(self.day) - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146_097 + doe - 719_468
    }

    pub fn from_days(days: i64) -> Result<Self, ConvertError> {
        let z = days.checked_add(719_468).ok_or(ConvertError::OutOfRange)?;
        let era = z.div_euclid(146_097);
        let doe = z.rem_euclid(146_097);
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = yoe + era * 400 + i64::from(m <= 2);
        let year = i32::try_from(y).map_err(|_| ConvertError::OutOfRange)?;
        if !(MIN_YEAR..=MAX_YEAR).contains(&year) {
            return Err(ConvertError::OutOfRange);
        }
        Ok(Self {
            year,
            month: m as u8,
            day: d as u8,
        })
    }

    /// 0 = Monday … 6 = Sunday.
    pub fn weekday(self) -> u8 {
        (self.to_days() + 3).rem_euclid(7) as u8
    }
}

/// Add calendar months, clamping the day to the end of the target month.
pub fn add_months(date: Date, months: i64) -> Result<Date, ConvertError> {
    let total = i64::from(date.year) * 12 + i64::from(date.month) - 1 + months;
    let year = i32::try_from(total.div_euclid(12)).map_err(|_| ConvertError::OutOfRange)?;
    let month = (total.rem_euclid(12) + 1) as u8;
    if !(MIN_YEAR..=MAX_YEAR).contains(&year) {
        return Err(ConvertError::OutOfRange);
    }
    let day = date.day.min(days_in_month(year, month));
    Ok(Date { year, month, day })
}

/// Add (or with a negative `days`, subtract) calendar days.
pub fn add_days(date: Date, days: i64) -> Result<Date, ConvertError> {
    let target = date
        .to_days()
        .checked_add(days)
        .ok_or(ConvertError::OutOfRange)?;
    Date::from_days(target)
}

// ---------- Unix timestamps ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UnixUnit {
    Seconds,
    Milliseconds,
    Microseconds,
    Nanoseconds,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct UnixParsed {
    pub unix_ms: i64,
    pub unit: UnixUnit,
}

/// Parse an integer Unix timestamp, guessing the unit from the digit count:
/// ≤11 digits seconds, 12–13 ms, 14–16 µs, 17–19 ns. Sub-millisecond parts are floored.
pub fn parse_unix(input: &str) -> Result<UnixParsed, ConvertError> {
    let s = input.trim();
    let digits = s.strip_prefix('-').unwrap_or(s);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ConvertError::InvalidNumber);
    }
    let n: i64 = s.parse().map_err(|_| ConvertError::OutOfRange)?;
    let (unit, unix_ms) = match digits.len() {
        0..=11 => (
            UnixUnit::Seconds,
            n.checked_mul(1000).ok_or(ConvertError::OutOfRange)?,
        ),
        12..=13 => (UnixUnit::Milliseconds, n),
        14..=16 => (UnixUnit::Microseconds, n.div_euclid(1000)),
        _ => (UnixUnit::Nanoseconds, n.div_euclid(1_000_000)),
    };
    Ok(UnixParsed { unix_ms, unit })
}

// ---------- Date difference ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct DateDiff {
    /// True when the first date is after the second.
    pub negative: bool,
    pub years: i64,
    pub months: i64,
    pub days: i64,
    pub total_days: i64,
    pub total_weeks: i64,
    pub extra_days: i64,
}

pub fn date_diff(a: Date, b: Date) -> Result<DateDiff, ConvertError> {
    let negative = a > b;
    let (e, l) = if negative { (b, a) } else { (a, b) };
    let mut months_total =
        (i64::from(l.year) - i64::from(e.year)) * 12 + i64::from(l.month) - i64::from(e.month);
    if l.day < e.day {
        months_total -= 1;
    }
    let anchor = add_months(e, months_total)?;
    let days = l.to_days() - anchor.to_days();
    let total_days = l.to_days() - e.to_days();
    Ok(DateDiff {
        negative,
        years: months_total / 12,
        months: months_total % 12,
        days,
        total_days,
        total_weeks: total_days / 7,
        extra_days: total_days % 7,
    })
}

// ---------- Business days ----------

fn check_mask(mask: u8) -> Result<(), ConvertError> {
    if mask > 0b111_1111 {
        Err(ConvertError::InvalidWeekend)
    } else {
        Ok(())
    }
}

fn is_weekend(date: Date, mask: u8) -> bool {
    mask >> date.weekday() & 1 == 1
}

fn sorted_days(holidays: &[Date]) -> Vec<i64> {
    let mut v: Vec<i64> = holidays.iter().map(|d| d.to_days()).collect();
    v.sort_unstable();
    v.dedup();
    v
}

/// Working days between two dates, both inclusive. Negative if `start` is after `end`.
/// Holidays that fall on a weekend or outside the range are ignored.
pub fn business_days(
    start: Date,
    end: Date,
    weekend_mask: u8,
    holidays: &[Date],
) -> Result<i64, ConvertError> {
    check_mask(weekend_mask)?;
    let negative = start > end;
    let (s, e) = if negative { (end, start) } else { (start, end) };
    let n = e.to_days() - s.to_days() + 1;
    let per_week = 7 - i64::from(weekend_mask.count_ones());
    let full = n / 7;
    let mut count = full * per_week;
    for i in 0..(n % 7) {
        let d = Date::from_days(s.to_days() + full * 7 + i)?;
        if !is_weekend(d, weekend_mask) {
            count += 1;
        }
    }
    for h in sorted_days(holidays) {
        if h >= s.to_days() && h <= e.to_days() && !is_weekend(Date::from_days(h)?, weekend_mask) {
            count -= 1;
        }
    }
    Ok(if negative { -count } else { count })
}

/// Move `n` working days forward (or backward if negative). `n == 0` returns `start` unchanged.
pub fn add_business_days(
    start: Date,
    n: i64,
    weekend_mask: u8,
    holidays: &[Date],
) -> Result<Date, ConvertError> {
    check_mask(weekend_mask)?;
    if n == 0 {
        return Ok(start);
    }
    if weekend_mask == 0b111_1111 || n.abs() > MAX_STEP {
        return Err(ConvertError::OutOfRange);
    }
    let hol = sorted_days(holidays);
    let step = n.signum();
    let mut left = n.abs();
    let mut day = start.to_days();
    while left > 0 {
        day += step;
        let d = Date::from_days(day)?;
        if !is_weekend(d, weekend_mask) && hol.binary_search(&day).is_err() {
            left -= 1;
        }
    }
    Date::from_days(day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_days_and_clamps_months() {
        let d = |y, m, dd| Date::new(y, m, dd).unwrap();
        assert_eq!(add_days(d(2026, 12, 31), 1).unwrap(), d(2027, 1, 1));
        assert_eq!(add_days(d(2000, 1, 1), 10_000).unwrap(), d(2027, 5, 19));
        assert_eq!(add_days(d(2024, 3, 1), -1).unwrap(), d(2024, 2, 29));
        assert_eq!(add_months(d(2024, 2, 29), 12).unwrap(), d(2025, 2, 28));
        assert!(add_days(d(9999, 12, 31), 1).is_err());
    }

    fn d(y: i32, m: u8, day: u8) -> Date {
        Date::new(y, m, day).unwrap()
    }

    #[test]
    fn date_validation() {
        assert!(Date::new(2023, 2, 29).is_err());
        assert!(Date::new(2024, 2, 29).is_ok());
        assert!(Date::new(2024, 13, 1).is_err());
        assert!(Date::new(2024, 1, 0).is_err());
        assert!(Date::new(0, 1, 1).is_err());
        assert!(Date::new(10_000, 1, 1).is_err());
        assert!(!is_leap(1900) && is_leap(2000));
    }

    #[test]
    fn day_numbers_and_weekdays() {
        assert_eq!(d(1970, 1, 1).to_days(), 0);
        assert_eq!(d(2000, 3, 1).to_days(), 11_017);
        assert_eq!(d(2026, 11, 6).to_days(), 20_763);
        assert_eq!(d(1970, 1, 1).weekday(), 3);
        assert_eq!(d(2026, 11, 6).weekday(), 4);
        assert_eq!(d(2026, 11, 2).weekday(), 0);
    }

    #[test]
    fn days_round_trip() {
        for days in (-700_000..2_900_000).step_by(997) {
            let date = Date::from_days(days).unwrap();
            assert_eq!(date.to_days(), days);
        }
        assert_eq!(Date::from_days(-800_000), Err(ConvertError::OutOfRange));
    }

    #[test]
    fn months_clamp() {
        assert_eq!(add_months(d(2024, 1, 31), 1).unwrap(), d(2024, 2, 29));
        assert_eq!(add_months(d(2023, 1, 31), 1).unwrap(), d(2023, 2, 28));
        assert_eq!(add_months(d(2024, 3, 31), -1).unwrap(), d(2024, 2, 29));
        assert_eq!(add_months(d(2024, 11, 15), 3).unwrap(), d(2025, 2, 15));
        assert!(add_months(d(9999, 12, 1), 1).is_err());
    }

    #[test]
    fn unix_unit_detection() {
        let want = 1_700_000_000_000;
        let s = parse_unix("1700000000").unwrap();
        assert_eq!((s.unix_ms, s.unit), (want, UnixUnit::Seconds));
        let ms = parse_unix(" 1700000000000 ").unwrap();
        assert_eq!((ms.unix_ms, ms.unit), (want, UnixUnit::Milliseconds));
        let us = parse_unix("1700000000000000").unwrap();
        assert_eq!((us.unix_ms, us.unit), (want, UnixUnit::Microseconds));
        let ns = parse_unix("1700000000000000000").unwrap();
        assert_eq!((ns.unix_ms, ns.unit), (want, UnixUnit::Nanoseconds));
    }

    #[test]
    fn unix_negative_and_floor() {
        assert_eq!(parse_unix("-1").unwrap().unix_ms, -1000);
        assert_eq!(parse_unix("0").unwrap().unix_ms, 0);
        assert_eq!(
            parse_unix("-10000000000000001").unwrap().unix_ms,
            -10_000_000_001
        );
    }

    #[test]
    fn unix_rejects_bad_input() {
        assert_eq!(parse_unix(""), Err(ConvertError::InvalidNumber));
        assert_eq!(parse_unix("-"), Err(ConvertError::InvalidNumber));
        assert_eq!(parse_unix("abc"), Err(ConvertError::InvalidNumber));
        assert_eq!(parse_unix("12.5"), Err(ConvertError::InvalidNumber));
        assert_eq!(
            parse_unix("9999999999999999999"),
            Err(ConvertError::OutOfRange)
        );
    }

    #[test]
    fn diff_month_end() {
        let r = date_diff(d(2024, 1, 31), d(2024, 3, 1)).unwrap();
        assert_eq!((r.years, r.months, r.days, r.total_days), (0, 1, 1, 30));
        let r = date_diff(d(2023, 1, 31), d(2023, 3, 1)).unwrap();
        assert_eq!((r.years, r.months, r.days, r.total_days), (0, 1, 1, 29));
        let r = date_diff(d(2024, 1, 31), d(2024, 2, 28)).unwrap();
        assert_eq!((r.months, r.days), (0, 28));
    }

    #[test]
    fn diff_long_span_and_weeks() {
        let r = date_diff(d(2000, 1, 1), d(2026, 11, 6)).unwrap();
        assert_eq!((r.years, r.months, r.days), (26, 10, 5));
        assert_eq!(r.total_days, 9806);
        assert_eq!((r.total_weeks, r.extra_days), (1400, 6));
        assert!(!r.negative);
    }

    #[test]
    fn diff_reversed_and_same() {
        let f = date_diff(d(2000, 1, 1), d(2026, 11, 6)).unwrap();
        let b = date_diff(d(2026, 11, 6), d(2000, 1, 1)).unwrap();
        assert!(b.negative);
        assert_eq!(
            (b.years, b.months, b.days, b.total_days),
            (f.years, f.months, f.days, f.total_days)
        );
        let z = date_diff(d(2026, 5, 5), d(2026, 5, 5)).unwrap();
        assert_eq!((z.years, z.months, z.days, z.total_days), (0, 0, 0, 0));
    }

    #[test]
    fn business_basic() {
        let m = WEEKEND_SAT_SUN;
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 6), m, &[]).unwrap(),
            5
        );
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 8), m, &[]).unwrap(),
            5
        );
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 15), m, &[]).unwrap(),
            10
        );
        assert_eq!(
            business_days(d(2026, 11, 6), d(2026, 11, 6), m, &[]).unwrap(),
            1
        );
        assert_eq!(
            business_days(d(2026, 11, 7), d(2026, 11, 7), m, &[]).unwrap(),
            0
        );
    }

    #[test]
    fn business_alternate_weekend_and_reverse() {
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 8), WEEKEND_FRI_SAT, &[]).unwrap(),
            5
        );
        assert_eq!(
            business_days(d(2026, 11, 6), d(2026, 11, 2), WEEKEND_SAT_SUN, &[]).unwrap(),
            -5
        );
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 8), 0, &[]).unwrap(),
            7
        );
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 8), 127, &[]).unwrap(),
            0
        );
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 8), 200, &[]),
            Err(ConvertError::InvalidWeekend)
        );
    }

    #[test]
    fn business_holidays() {
        let m = WEEKEND_SAT_SUN;
        let wed = d(2026, 11, 4);
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 6), m, &[wed]).unwrap(),
            4
        );
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 6), m, &[wed, wed]).unwrap(),
            4
        );
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 6), m, &[d(2026, 11, 7)]).unwrap(),
            5
        );
        assert_eq!(
            business_days(d(2026, 11, 2), d(2026, 11, 6), m, &[d(2026, 12, 25)]).unwrap(),
            5
        );
    }

    #[test]
    fn add_business() {
        let m = WEEKEND_SAT_SUN;
        let fri = d(2026, 11, 6);
        assert_eq!(add_business_days(fri, 1, m, &[]).unwrap(), d(2026, 11, 9));
        assert_eq!(add_business_days(fri, 5, m, &[]).unwrap(), d(2026, 11, 13));
        assert_eq!(add_business_days(fri, -1, m, &[]).unwrap(), d(2026, 11, 5));
        assert_eq!(
            add_business_days(fri, 1, m, &[d(2026, 11, 9)]).unwrap(),
            d(2026, 11, 10)
        );
        assert_eq!(
            add_business_days(d(2026, 11, 7), 0, m, &[]).unwrap(),
            d(2026, 11, 7)
        );
        assert_eq!(
            add_business_days(fri, 1, 127, &[]),
            Err(ConvertError::OutOfRange)
        );
        assert_eq!(
            add_business_days(fri, 50_000, m, &[]),
            Err(ConvertError::OutOfRange)
        );
    }

    #[test]
    fn add_and_count_agree() {
        let m = WEEKEND_SAT_SUN;
        let hol = [d(2026, 11, 4)];
        let start = d(2026, 11, 2);
        let end = add_business_days(start, 3, m, &hol).unwrap();
        assert_eq!(end, d(2026, 11, 6));
        // inclusive count includes the (working) start day
        assert_eq!(business_days(start, end, m, &hol).unwrap(), 4);
    }
}
