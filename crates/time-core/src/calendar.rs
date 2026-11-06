//! Gregorian month grids and ISO 8601 week numbers (proleptic Gregorian, years 1..=9999).

use crate::convert::{ConvertError, Date, days_in_month};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WeekStart {
    Monday,
    Sunday,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct IsoWeek {
    /// The ISO week-numbering year, which differs from the calendar year near 1 January.
    pub year: i32,
    pub week: u8,
}

/// ISO 8601 week of a date: weeks start on Monday and week 1 contains the year's first Thursday.
pub fn iso_week(date: Date) -> Result<IsoWeek, ConvertError> {
    let thursday = Date::from_days(date.to_days() - i64::from(date.weekday()) + 3)?;
    let jan1 = Date::new(thursday.year, 1, 1)?;
    let week = (thursday.to_days() - jan1.to_days()) / 7 + 1;
    Ok(IsoWeek {
        year: thursday.year,
        week: week as u8,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct IsoWeekSpan {
    pub year: i32,
    pub week: u8,
    /// 52 or 53.
    pub weeks_in_year: u8,
    /// Monday.
    pub start: Date,
    /// Sunday.
    pub end: Date,
}

/// Number of ISO weeks in an ISO week-numbering year (the week of 28 December).
pub fn weeks_in_year(year: i32) -> Result<u8, ConvertError> {
    Ok(iso_week(Date::new(year, 12, 28)?)?.week)
}

/// Monday-to-Sunday dates of ISO week `week` of ISO year `year`.
pub fn iso_week_span(year: i32, week: u8) -> Result<IsoWeekSpan, ConvertError> {
    let weeks = weeks_in_year(year)?;
    if week == 0 || week > weeks {
        return Err(ConvertError::InvalidDate);
    }
    let jan4 = Date::new(year, 1, 4)?;
    let monday = jan4.to_days() - i64::from(jan4.weekday()) + 7 * (i64::from(week) - 1);
    Ok(IsoWeekSpan {
        year,
        week,
        weeks_in_year: weeks,
        start: Date::from_days(monday)?,
        end: Date::from_days(monday + 6)?,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MonthGrid {
    pub year: i32,
    pub month: u8,
    pub days_in_month: u8,
    /// One row per week, seven cells each; 0 marks a day outside the month.
    pub weeks: Vec<[u8; 7]>,
    /// ISO week number for each row.
    pub iso_weeks: Vec<u8>,
}

pub fn month_grid(year: i32, month: u8, week_start: WeekStart) -> Result<MonthGrid, ConvertError> {
    let first = Date::new(year, month, 1)?;
    let len = days_in_month(year, month);
    let offset = match week_start {
        WeekStart::Monday => i64::from(first.weekday()),
        WeekStart::Sunday => (i64::from(first.weekday()) + 1) % 7,
    };
    // Thursday sits at index 3 in a Monday-start row and index 4 in a Sunday-start row.
    let thursday_index = if week_start == WeekStart::Monday {
        3
    } else {
        4
    };
    let rows = (offset + i64::from(len) + 6) / 7;
    let mut weeks = Vec::new();
    let mut iso_weeks = Vec::new();
    for r in 0..rows {
        let mut row = [0u8; 7];
        for (c, cell) in row.iter_mut().enumerate() {
            let day = r * 7 + c as i64 - offset + 1;
            if (1..=i64::from(len)).contains(&day) {
                *cell = day as u8;
            }
        }
        let thursday = Date::from_days(first.to_days() - offset + r * 7 + thursday_index)?;
        iso_weeks.push(iso_week(thursday)?.week);
        weeks.push(row);
    }
    Ok(MonthGrid {
        year,
        month,
        days_in_month: len,
        weeks,
        iso_weeks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_week_spans() {
        let w = iso_week_span(2026, 45).unwrap();
        assert_eq!(
            (w.start, w.end, w.weeks_in_year),
            (d(2026, 11, 2), d(2026, 11, 8), 53)
        );
        // Week 1 of 2027 starts in 2027; week 1 of 2026 started on 29 December 2025.
        assert_eq!(iso_week_span(2027, 1).unwrap().start, d(2027, 1, 4));
        assert_eq!(iso_week_span(2026, 1).unwrap().start, d(2025, 12, 29));
        assert_eq!(iso_week_span(2026, 53).unwrap().end, d(2027, 1, 3));
        assert_eq!(weeks_in_year(2027).unwrap(), 52);
        assert_eq!(iso_week_span(2027, 53), Err(ConvertError::InvalidDate));
        assert_eq!(iso_week_span(2027, 0), Err(ConvertError::InvalidDate));
        for y in 1990..2040 {
            for wk in 1..=weeks_in_year(y).unwrap() {
                let s = iso_week_span(y, wk).unwrap();
                assert_eq!(iso_week(s.start).unwrap(), IsoWeek { year: y, week: wk });
                assert_eq!(iso_week(s.end).unwrap(), IsoWeek { year: y, week: wk });
            }
        }
    }

    fn d(y: i32, m: u8, day: u8) -> Date {
        Date::new(y, m, day).unwrap()
    }

    fn iso(y: i32, m: u8, day: u8) -> (i32, u8) {
        let w = iso_week(d(y, m, day)).unwrap();
        (w.year, w.week)
    }

    #[test]
    fn iso_week_year_boundaries() {
        assert_eq!(iso(2026, 12, 31), (2026, 53));
        assert_eq!(iso(2027, 1, 1), (2026, 53));
        assert_eq!(iso(2027, 1, 3), (2026, 53));
        assert_eq!(iso(2027, 1, 4), (2027, 1));
        assert_eq!(iso(2024, 12, 30), (2025, 1));
        assert_eq!(iso(2021, 1, 3), (2020, 53));
        assert_eq!(iso(2020, 12, 31), (2020, 53));
        assert_eq!(iso(2019, 12, 29), (2019, 52));
    }

    #[test]
    fn iso_week_ordinary_days() {
        assert_eq!(iso(2026, 11, 6), (2026, 45));
        assert_eq!(iso(2026, 11, 2), (2026, 45));
        assert_eq!(iso(2026, 11, 8), (2026, 45));
        assert_eq!(iso(2026, 1, 1), (2026, 1));
        assert_eq!(iso(2000, 1, 1), (1999, 52));
    }

    #[test]
    fn leap_february_monday_start() {
        let g = month_grid(2024, 2, WeekStart::Monday).unwrap();
        assert_eq!(g.days_in_month, 29);
        assert_eq!(g.weeks.len(), 5);
        assert_eq!(g.weeks[0], [0, 0, 0, 1, 2, 3, 4]);
        assert_eq!(g.weeks[4], [26, 27, 28, 29, 0, 0, 0]);
        assert_eq!(g.iso_weeks, vec![5, 6, 7, 8, 9]);
    }

    #[test]
    fn february_that_fits_four_rows() {
        let g = month_grid(2026, 2, WeekStart::Sunday).unwrap();
        assert_eq!(g.weeks.len(), 4);
        assert_eq!(g.weeks[0], [1, 2, 3, 4, 5, 6, 7]);
        assert_eq!(g.weeks[3], [22, 23, 24, 25, 26, 27, 28]);
        // Sunday 1 Feb belongs to ISO week 5, so a Monday-start grid begins with six blank cells.
        let m = month_grid(2026, 2, WeekStart::Monday).unwrap();
        assert_eq!(m.weeks.len(), 5);
        assert_eq!(m.weeks[0], [0, 0, 0, 0, 0, 0, 1]);
        assert_eq!(m.iso_weeks, vec![5, 6, 7, 8, 9]);
    }

    #[test]
    fn grid_week_numbers_cross_the_new_year() {
        let g = month_grid(2026, 11, WeekStart::Monday).unwrap();
        assert_eq!(g.weeks[0], [0, 0, 0, 0, 0, 0, 1]);
        assert_eq!(g.iso_weeks[0], 44);
        assert_eq!(g.iso_weeks[1], 45);
        let jan = month_grid(2027, 1, WeekStart::Monday).unwrap();
        assert_eq!(jan.iso_weeks[0], 53);
        assert_eq!(jan.iso_weeks[1], 1);
        let sun = month_grid(2027, 1, WeekStart::Sunday).unwrap();
        assert_eq!(sun.weeks[0], [0, 0, 0, 0, 0, 1, 2]);
        assert_eq!(sun.iso_weeks[0], 53);
        assert_eq!(sun.iso_weeks[1], 1);
    }

    #[test]
    fn every_month_has_every_day_once() {
        for year in [1900, 2000, 2023, 2024, 2100] {
            for month in 1..=12 {
                for ws in [WeekStart::Monday, WeekStart::Sunday] {
                    let g = month_grid(year, month, ws).unwrap();
                    let mut days: Vec<u8> = g
                        .weeks
                        .iter()
                        .flatten()
                        .copied()
                        .filter(|d| *d != 0)
                        .collect();
                    days.sort_unstable();
                    assert_eq!(
                        days,
                        (1..=g.days_in_month).collect::<Vec<_>>(),
                        "{year}-{month}"
                    );
                    assert_eq!(g.weeks.len(), g.iso_weeks.len());
                }
            }
        }
    }

    #[test]
    fn rejects_bad_input() {
        assert!(month_grid(2026, 13, WeekStart::Monday).is_err());
        assert!(month_grid(2026, 0, WeekStart::Monday).is_err());
        assert!(month_grid(0, 1, WeekStart::Monday).is_err());
    }
}
