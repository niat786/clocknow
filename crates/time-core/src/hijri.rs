//! Hijri (Islamic) dates by the Umm al-Qura calendar of Saudi Arabia, 1300-1600 AH (1882-2174 CE).
//! Month starts come from the committed table in `hijri_table.rs` (see `crates/calgen`).
//! Many countries, including Pakistan, begin months by local moon sighting, so religious dates
//! there can differ from Umm al-Qura by a day or more.

use crate::convert::{ConvertError, Date};
use crate::hijri_table::{FIRST_YEAR, LAST_YEAR, YEARS};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct HijriDate {
    pub year: i32,
    pub month: u8,
    pub day: u8,
}

pub const FIRST_HIJRI_YEAR: i32 = FIRST_YEAR;
pub const LAST_HIJRI_YEAR: i32 = LAST_YEAR;

fn row(year: i32) -> Result<(i64, u16), ConvertError> {
    if !(FIRST_YEAR..=LAST_YEAR).contains(&year) {
        return Err(ConvertError::OutOfRange);
    }
    let (start, mask) = YEARS[(year - FIRST_YEAR) as usize];
    Ok((i64::from(start), mask))
}

/// 29 or 30.
pub fn month_length(year: i32, month: u8) -> Result<u8, ConvertError> {
    if !(1..=12).contains(&month) {
        return Err(ConvertError::InvalidDate);
    }
    let (_, mask) = row(year)?;
    Ok(29 + ((mask >> (month - 1)) & 1) as u8)
}

pub fn year_length(year: i32) -> Result<u16, ConvertError> {
    let (_, mask) = row(year)?;
    Ok(348 + mask.count_ones() as u16)
}

/// Days since 1970-01-01 of a Hijri date.
pub fn days_from_hijri(h: HijriDate) -> Result<i64, ConvertError> {
    let len = month_length(h.year, h.month)?;
    if h.day == 0 || h.day > len {
        return Err(ConvertError::InvalidDate);
    }
    let (start, _) = row(h.year)?;
    let before: i64 = (1..h.month)
        .map(|m| i64::from(month_length(h.year, m).unwrap_or(29)))
        .sum();
    Ok(start + before + i64::from(h.day) - 1)
}

/// Hijri date of a day number (days since 1970-01-01).
pub fn hijri_from_days(days: i64) -> Result<HijriDate, ConvertError> {
    let idx = YEARS.partition_point(|(s, _)| i64::from(*s) <= days);
    if idx == 0 {
        return Err(ConvertError::OutOfRange);
    }
    let year = FIRST_YEAR + (idx as i32 - 1);
    let (start, _) = row(year)?;
    let mut left = days - start;
    if left >= i64::from(year_length(year)?) {
        return Err(ConvertError::OutOfRange);
    }
    for month in 1..=12u8 {
        let len = i64::from(month_length(year, month)?);
        if left < len {
            return Ok(HijriDate {
                year,
                month,
                day: left as u8 + 1,
            });
        }
        left -= len;
    }
    Err(ConvertError::OutOfRange)
}

pub fn gregorian_to_hijri(date: Date) -> Result<HijriDate, ConvertError> {
    hijri_from_days(date.to_days())
}

pub fn hijri_to_gregorian(h: HijriDate) -> Result<Date, ConvertError> {
    Date::from_days(days_from_hijri(h)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn g(y: i32, m: u8, d: u8) -> Date {
        Date::new(y, m, d).unwrap()
    }

    fn h(y: i32, m: u8, d: u8) -> HijriDate {
        HijriDate {
            year: y,
            month: m,
            day: d,
        }
    }

    #[test]
    fn announced_umm_al_qura_dates() {
        assert_eq!(hijri_to_gregorian(h(1446, 1, 1)).unwrap(), g(2024, 7, 7));
        assert_eq!(hijri_to_gregorian(h(1446, 9, 1)).unwrap(), g(2025, 3, 1));
        assert_eq!(hijri_to_gregorian(h(1446, 10, 1)).unwrap(), g(2025, 3, 30));
        assert_eq!(gregorian_to_hijri(g(2025, 3, 1)).unwrap(), h(1446, 9, 1));
        assert_eq!(gregorian_to_hijri(g(2025, 2, 28)).unwrap(), h(1446, 8, 29));
    }

    #[test]
    fn every_day_round_trips_and_advances_by_one() {
        let first = days_from_hijri(h(FIRST_HIJRI_YEAR, 1, 1)).unwrap();
        let last = days_from_hijri(h(
            LAST_HIJRI_YEAR,
            12,
            month_length(LAST_HIJRI_YEAR, 12).unwrap(),
        ))
        .unwrap();
        let mut prev = hijri_from_days(first).unwrap();
        assert_eq!(prev, h(FIRST_HIJRI_YEAR, 1, 1));
        for day in first..=last {
            let cur = hijri_from_days(day).unwrap();
            assert_eq!(days_from_hijri(cur).unwrap(), day);
            if day > first {
                let rolled = cur.day == 1;
                assert_eq!(rolled, cur.day <= prev.day, "{prev:?} -> {cur:?}");
                if !rolled {
                    assert_eq!(
                        (cur.year, cur.month, cur.day),
                        (prev.year, prev.month, prev.day + 1)
                    );
                }
            }
            prev = cur;
        }
        assert_eq!(
            prev,
            h(
                LAST_HIJRI_YEAR,
                12,
                month_length(LAST_HIJRI_YEAR, 12).unwrap()
            )
        );
    }

    #[test]
    fn lengths_are_sane() {
        for year in FIRST_HIJRI_YEAR..=LAST_HIJRI_YEAR {
            let sum: u16 = (1..=12)
                .map(|m| u16::from(month_length(year, m).unwrap()))
                .sum();
            assert_eq!(sum, year_length(year).unwrap());
            assert!((353..=355).contains(&sum), "{year}: {sum}");
        }
    }

    #[test]
    fn range_edges_and_bad_input() {
        let first = days_from_hijri(h(FIRST_HIJRI_YEAR, 1, 1)).unwrap();
        assert_eq!(hijri_from_days(first - 1), Err(ConvertError::OutOfRange));
        let end = days_from_hijri(h(
            LAST_HIJRI_YEAR,
            12,
            month_length(LAST_HIJRI_YEAR, 12).unwrap(),
        ))
        .unwrap();
        assert_eq!(hijri_from_days(end + 1), Err(ConvertError::OutOfRange));
        assert!(gregorian_to_hijri(g(1800, 1, 1)).is_err());
        assert!(gregorian_to_hijri(g(2200, 1, 1)).is_err());
        assert_eq!(
            days_from_hijri(h(1446, 13, 1)),
            Err(ConvertError::InvalidDate)
        );
        assert_eq!(
            days_from_hijri(h(1446, 1, 0)),
            Err(ConvertError::InvalidDate)
        );
        assert_eq!(
            days_from_hijri(h(1446, 1, 31)),
            Err(ConvertError::InvalidDate)
        );
        assert_eq!(
            days_from_hijri(h(1299, 1, 1)),
            Err(ConvertError::OutOfRange)
        );
    }

    #[test]
    fn the_range_covers_1882_to_2174() {
        assert_eq!(
            hijri_to_gregorian(h(FIRST_HIJRI_YEAR, 1, 1)).unwrap().year,
            1882
        );
        let last = h(
            LAST_HIJRI_YEAR,
            12,
            month_length(LAST_HIJRI_YEAR, 12).unwrap(),
        );
        assert_eq!(hijri_to_gregorian(last).unwrap().year, 2174);
    }

    #[test]
    fn a_month_is_never_30_days_in_both_neighbours_for_too_long() {
        // Umm al-Qura never has more than four 30-day months in a row.
        let mut run = 0;
        for year in FIRST_HIJRI_YEAR..=LAST_HIJRI_YEAR {
            for m in 1..=12 {
                if month_length(year, m).unwrap() == 30 {
                    run += 1;
                    assert!(run <= 4, "{year}-{m}");
                } else {
                    run = 0;
                }
            }
        }
    }
}
