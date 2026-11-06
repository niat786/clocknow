//! Hebrew, Chinese, Persian (Solar Hijri) and Indian national (Saka) dates.
//! Month lengths come from the committed table in `world_cal_table.rs` (see `crates/calgen`).
//! Months are ordinal (1 = first month of that year); `number` and `leap` name the month,
//! e.g. Hebrew Adar I is `number: 5, leap: true` and Chinese leap month 6 is `number: 6, leap: true`.

use crate::convert::{ConvertError, Date};
use crate::world_cal_table as t;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Calendar {
    Hebrew,
    Chinese,
    Persian,
    Indian,
}

impl Calendar {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "hebrew" => Some(Self::Hebrew),
            "chinese" => Some(Self::Chinese),
            "persian" => Some(Self::Persian),
            "indian" => Some(Self::Indian),
            _ => None,
        }
    }

    fn table(self) -> (i32, &'static [(i32, u32, u8)]) {
        match self {
            Self::Hebrew => (t::HEBREW_FIRST, &t::HEBREW),
            Self::Chinese => (t::CHINESE_FIRST, &t::CHINESE),
            Self::Persian => (t::PERSIAN_FIRST, &t::PERSIAN),
            Self::Indian => (t::INDIAN_FIRST, &t::INDIAN),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct WorldDate {
    pub year: i32,
    /// Ordinal month in this year, from 1.
    pub month: u8,
    pub day: u8,
    /// Month as named (leap months repeat the number of the month they follow).
    pub number: u8,
    pub leap: bool,
    pub months_in_year: u8,
    pub days_in_month: u8,
    pub days_in_year: u16,
    /// Chinese only: position in the 60-year stem-branch cycle, 1 = jia-zi (甲子).
    pub cycle: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct YearRange {
    pub first: i32,
    pub last: i32,
}

pub fn year_range(cal: Calendar) -> YearRange {
    let (first, rows) = cal.table();
    YearRange {
        first,
        last: first + rows.len() as i32 - 1,
    }
}

struct Row {
    start: i64,
    lens: u32,
    leap: u8,
}

impl Row {
    fn months(&self) -> u8 {
        12 + u8::from(self.leap > 0)
    }
    fn len(&self, ordinal: u8) -> u8 {
        29 + ((self.lens >> (2 * u32::from(ordinal - 1))) & 3) as u8
    }
    fn days(&self) -> u16 {
        (1..=self.months()).map(|m| u16::from(self.len(m))).sum()
    }
    fn number(&self, ordinal: u8) -> (u8, bool) {
        if self.leap == 0 || ordinal < self.leap {
            (ordinal, false)
        } else {
            (ordinal - 1, ordinal == self.leap)
        }
    }
}

fn row(cal: Calendar, year: i32) -> Result<Row, ConvertError> {
    let (first, rows) = cal.table();
    let idx = usize::try_from(year - first).map_err(|_| ConvertError::OutOfRange)?;
    let &(start, lens, leap) = rows.get(idx).ok_or(ConvertError::OutOfRange)?;
    Ok(Row {
        start: i64::from(start),
        lens,
        leap,
    })
}

fn cycle(cal: Calendar, year: i32) -> Option<u8> {
    // 1984 began a jia-zi year.
    (cal == Calendar::Chinese).then(|| ((year - 1984).rem_euclid(60) + 1) as u8)
}

/// Month lengths of a year, by ordinal month.
pub fn month_lengths(cal: Calendar, year: i32) -> Result<Vec<u8>, ConvertError> {
    let r = row(cal, year)?;
    Ok((1..=r.months()).map(|m| r.len(m)).collect())
}

pub fn from_days(cal: Calendar, days: i64) -> Result<WorldDate, ConvertError> {
    let (first, rows) = cal.table();
    let idx = rows.partition_point(|(s, _, _)| i64::from(*s) <= days);
    if idx == 0 {
        return Err(ConvertError::OutOfRange);
    }
    let year = first + idx as i32 - 1;
    let r = row(cal, year)?;
    let mut left = days - r.start;
    if left >= i64::from(r.days()) {
        return Err(ConvertError::OutOfRange);
    }
    for month in 1..=r.months() {
        let len = r.len(month);
        if left < i64::from(len) {
            let (number, leap) = r.number(month);
            return Ok(WorldDate {
                year,
                month,
                day: left as u8 + 1,
                number,
                leap,
                months_in_year: r.months(),
                days_in_month: len,
                days_in_year: r.days(),
                cycle: cycle(cal, year),
            });
        }
        left -= i64::from(len);
    }
    Err(ConvertError::OutOfRange)
}

/// Days since 1970-01-01 of an ordinal-month date.
pub fn to_days(cal: Calendar, year: i32, month: u8, day: u8) -> Result<i64, ConvertError> {
    let r = row(cal, year)?;
    if month == 0 || month > r.months() || day == 0 || day > r.len(month) {
        return Err(ConvertError::InvalidDate);
    }
    let before: i64 = (1..month).map(|m| i64::from(r.len(m))).sum();
    Ok(r.start + before + i64::from(day) - 1)
}

pub fn from_gregorian(cal: Calendar, date: Date) -> Result<WorldDate, ConvertError> {
    from_days(cal, date.to_days())
}

pub fn to_gregorian(cal: Calendar, year: i32, month: u8, day: u8) -> Result<Date, ConvertError> {
    Date::from_days(to_days(cal, year, month, day)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use Calendar::*;

    fn g(y: i32, m: u8, d: u8) -> Date {
        Date::new(y, m, d).unwrap()
    }

    #[test]
    fn new_years_match_published_dates() {
        // Rosh Hashanah 5785, Nowruz 1404, Chinese New Year 2025, Saka 1947.
        assert_eq!(to_gregorian(Hebrew, 5785, 1, 1).unwrap(), g(2024, 10, 3));
        assert_eq!(to_gregorian(Persian, 1404, 1, 1).unwrap(), g(2025, 3, 21));
        assert_eq!(to_gregorian(Chinese, 2025, 1, 1).unwrap(), g(2025, 1, 29));
        assert_eq!(to_gregorian(Indian, 1947, 1, 1).unwrap(), g(2025, 3, 22));
        assert_eq!(to_gregorian(Chinese, 2026, 1, 1).unwrap(), g(2026, 2, 17));
        assert_eq!(to_gregorian(Hebrew, 5787, 1, 1).unwrap(), g(2026, 9, 12));
    }

    #[test]
    fn leap_months_are_named() {
        // 2025 has a leap 6th month (閏六月) from 25 July; 5784 has Adar I and Adar II.
        let d = from_gregorian(Chinese, g(2025, 7, 25)).unwrap();
        assert_eq!((d.month, d.number, d.leap, d.day), (7, 6, true, 1));
        assert_eq!(d.months_in_year, 13);
        let adar1 = from_gregorian(Hebrew, g(2024, 2, 10)).unwrap();
        assert_eq!(
            (adar1.year, adar1.number, adar1.leap, adar1.day),
            (5784, 5, true, 1)
        );
        let adar2 = from_gregorian(Hebrew, g(2024, 3, 11)).unwrap();
        assert_eq!(
            (adar2.month, adar2.number, adar2.leap, adar2.day),
            (7, 6, false, 1)
        );
        assert_eq!(adar2.days_in_year, 383);
    }

    #[test]
    fn chinese_cycle() {
        // 2026 is bing-wu (丙午), number 43; 1984 is jia-zi.
        assert_eq!(
            from_gregorian(Chinese, g(2026, 3, 1)).unwrap().cycle,
            Some(43)
        );
        assert_eq!(
            from_gregorian(Chinese, g(1984, 6, 1)).unwrap().cycle,
            Some(1)
        );
        assert_eq!(from_gregorian(Hebrew, g(2026, 3, 1)).unwrap().cycle, None);
    }

    #[test]
    fn indian_and_persian_month_shape() {
        assert_eq!(
            month_lengths(Indian, 1946).unwrap(),
            [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30]
        );
        assert_eq!(month_lengths(Persian, 1403).unwrap()[11], 30);
        assert_eq!(month_lengths(Persian, 1404).unwrap()[11], 29);
    }

    #[test]
    fn every_day_round_trips() {
        for cal in [Hebrew, Chinese, Persian, Indian] {
            let r = year_range(cal);
            let first = to_days(cal, r.first, 1, 1).unwrap();
            let lens = month_lengths(cal, r.last).unwrap();
            let last = to_days(cal, r.last, lens.len() as u8, *lens.last().unwrap()).unwrap();
            let mut prev: Option<WorldDate> = None;
            for days in first..=last {
                let d = from_days(cal, days).unwrap();
                assert_eq!(to_days(cal, d.year, d.month, d.day).unwrap(), days);
                if let Some(p) = prev {
                    let next_day = d.day == p.day + 1 && d.month == p.month;
                    let next_month = d.day == 1 && p.day == p.days_in_month;
                    assert!(next_day || next_month, "{cal:?} {days}");
                }
                prev = Some(d);
            }
            assert_eq!(from_days(cal, first - 1), Err(ConvertError::OutOfRange));
            assert_eq!(from_days(cal, last + 1), Err(ConvertError::OutOfRange));
        }
    }

    #[test]
    fn rejects_bad_dates() {
        assert_eq!(
            to_days(Persian, 1404, 13, 1),
            Err(ConvertError::InvalidDate)
        );
        assert_eq!(to_days(Indian, 1946, 7, 31), Err(ConvertError::InvalidDate));
        assert_eq!(to_days(Hebrew, 1, 1, 1), Err(ConvertError::OutOfRange));
    }
}
