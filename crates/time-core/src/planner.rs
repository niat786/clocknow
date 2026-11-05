//! Meeting planner: ranks meeting start times for people in different time zones.
//! Every slot is checked against each person's real local time (DST-aware), sampled through the
//! whole meeting, so a meeting that runs past someone's working hours is never called "work".

use crate::convert::{ConvertError, Date};
use crate::tz::{self, TzError};
use jiff::Timestamp;
use jiff::tz::TimeZone;
use serde::Serialize;
use std::fmt;

pub const MAX_PARTICIPANTS: usize = 10;
pub const MAX_WINDOWS: usize = 5;
const SAMPLE_MS: i64 = 15 * 60_000;
const DAY_MIN: i32 = 1440;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlanError {
    Tz(TzError),
    Convert(ConvertError),
    Participants,
    Options(&'static str),
}

impl fmt::Display for PlanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tz(e) => e.fmt(f),
            Self::Convert(e) => e.fmt(f),
            Self::Participants => write!(f, "add 1 to {MAX_PARTICIPANTS} places"),
            Self::Options(why) => f.write_str(why),
        }
    }
}

impl std::error::Error for PlanError {}

impl From<TzError> for PlanError {
    fn from(e: TzError) -> Self {
        Self::Tz(e)
    }
}

impl From<ConvertError> for PlanError {
    fn from(e: ConvertError) -> Self {
        Self::Convert(e)
    }
}

/// Local working hours in minutes after midnight; `end_min` is exclusive and may be earlier
/// than `start_min` for a shift that crosses midnight (22:00–06:00).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Hours {
    pub start_min: u16,
    pub end_min: u16,
}

impl Hours {
    pub const OFFICE: Self = Self {
        start_min: 9 * 60,
        end_min: 17 * 60,
    };
}

/// A minute-of-day range as start + length, so wrapping and widening need no special cases.
#[derive(Debug, Clone, Copy)]
struct Span {
    start: i32,
    len: i32,
}

impl Span {
    fn from_hours(h: Hours) -> Result<Self, PlanError> {
        let (s, e) = (i32::from(h.start_min), i32::from(h.end_min));
        if s >= DAY_MIN || e >= DAY_MIN || s == e {
            return Err(PlanError::Options(
                "working hours must be two different times of day",
            ));
        }
        Ok(Self {
            start: s,
            len: (e - s).rem_euclid(DAY_MIN),
        })
    }

    fn widen(self, by: i32) -> Self {
        Self {
            start: (self.start - by).rem_euclid(DAY_MIN),
            len: (self.len + 2 * by).min(DAY_MIN),
        }
    }

    fn contains(self, minute: i32) -> bool {
        (minute - self.start).rem_euclid(DAY_MIN) < self.len
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Participant<'a> {
    pub zone: &'a str,
    pub hours: Hours,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Options {
    /// Spacing of candidate start times: 15, 30 or 60 minutes.
    pub step_min: u16,
    /// Meeting length, 15 to 480 minutes.
    pub duration_min: u16,
    /// Minutes either side of working hours that count as "shoulder" rather than night, 0 to 240.
    pub shoulder_min: u16,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            step_min: 30,
            duration_min: 60,
            shoulder_min: 120,
        }
    }
}

/// Ordered worst to best, so `min` gives a meeting's worst moment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Comfort {
    Night,
    Shoulder,
    Work,
}

/// One person's view of a slot's start.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Local {
    pub hour: u8,
    pub minute: u8,
    /// Local date at the slot start minus the planner date: -1, 0 or 1.
    pub day_offset: i8,
    /// Worst comfort over the whole meeting.
    pub comfort: Comfort,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Slot {
    pub start_unix_ms: i64,
    pub work: u8,
    pub shoulder: u8,
    pub night: u8,
    pub people: Vec<Local>,
}

/// A run of consecutive slots in which everyone's comfort stays the same.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Window {
    pub first: usize,
    pub last: usize,
    /// Start of the first slot.
    pub start_unix_ms: i64,
    /// End of a meeting started in the last slot.
    pub end_unix_ms: i64,
    pub work: u8,
    pub shoulder: u8,
    pub night: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DayPlan {
    /// The planner date's midnight-to-midnight in the anchor zone (23 or 25 hours on DST days).
    pub start_unix_ms: i64,
    pub end_unix_ms: i64,
    pub slots: Vec<Slot>,
    /// Best windows first: fewest people at night, then most in working hours, then longest, then earliest.
    pub best: Vec<Window>,
}

fn validate(opts: Options) -> Result<(), PlanError> {
    if ![15, 30, 60].contains(&opts.step_min) {
        return Err(PlanError::Options("step must be 15, 30 or 60 minutes"));
    }
    if !(15..=480).contains(&opts.duration_min) {
        return Err(PlanError::Options(
            "meeting length must be 15 to 480 minutes",
        ));
    }
    if opts.shoulder_min > 240 {
        return Err(PlanError::Options(
            "shoulder time must be at most 240 minutes",
        ));
    }
    Ok(())
}

fn midnight(date: Date, zone: &str) -> Result<i64, PlanError> {
    let year = i16::try_from(date.year).map_err(|_| ConvertError::OutOfRange)?;
    Ok(tz::wall_to_unix_ms(
        year,
        date.month as i8,
        date.day as i8,
        0,
        0,
        0,
        zone,
    )?)
}

/// Local (day number since 1970-01-01, minute of day) of an instant in a zone.
fn local_at(zone: &TimeZone, unix_ms: i64) -> Result<(i64, i32), PlanError> {
    let ts = Timestamp::from_millisecond(unix_ms).map_err(|_| TzError::OutOfRange(unix_ms))?;
    let secs = unix_ms.div_euclid(1000) + i64::from(zone.to_offset(ts).seconds());
    let minute = i32::try_from(secs.rem_euclid(86_400) / 60).unwrap_or(0);
    Ok((secs.div_euclid(86_400), minute))
}

struct Person {
    zone: TimeZone,
    work: Span,
    wide: Span,
}

impl Person {
    fn comfort(&self, minute: i32) -> Comfort {
        if self.work.contains(minute) {
            Comfort::Work
        } else if self.wide.contains(minute) {
            Comfort::Shoulder
        } else {
            Comfort::Night
        }
    }
}

pub fn plan_day(
    date: Date,
    anchor_zone: &str,
    participants: &[Participant<'_>],
    opts: Options,
) -> Result<DayPlan, PlanError> {
    if participants.is_empty() || participants.len() > MAX_PARTICIPANTS {
        return Err(PlanError::Participants);
    }
    validate(opts)?;
    let people = participants
        .iter()
        .map(|p| {
            let work = Span::from_hours(p.hours)?;
            Ok(Person {
                zone: tz::zone(p.zone)?,
                work,
                wide: work.widen(i32::from(opts.shoulder_min)),
            })
        })
        .collect::<Result<Vec<_>, PlanError>>()?;

    let start = midnight(date, anchor_zone)?;
    let end = midnight(Date::from_days(date.to_days() + 1)?, anchor_zone)?;
    let step = i64::from(opts.step_min) * 60_000;
    let duration = i64::from(opts.duration_min) * 60_000;
    let today = date.to_days();

    let mut slots = Vec::new();
    let mut t = start;
    while t < end {
        // Sample every 15 minutes through the meeting, plus its final minute.
        let mut samples: Vec<i64> = (0..)
            .map(|i| t + i * SAMPLE_MS)
            .take_while(|s| *s < t + duration)
            .collect();
        samples.push(t + duration - 60_000);
        let mut slot = Slot {
            start_unix_ms: t,
            work: 0,
            shoulder: 0,
            night: 0,
            people: Vec::with_capacity(people.len()),
        };
        for p in &people {
            let mut worst = Comfort::Work;
            for s in &samples {
                worst = worst.min(p.comfort(local_at(&p.zone, *s)?.1));
            }
            let (day, minute) = local_at(&p.zone, t)?;
            match worst {
                Comfort::Work => slot.work += 1,
                Comfort::Shoulder => slot.shoulder += 1,
                Comfort::Night => slot.night += 1,
            }
            slot.people.push(Local {
                hour: (minute / 60) as u8,
                minute: (minute % 60) as u8,
                day_offset: (day - today).clamp(-1, 1) as i8,
                comfort: worst,
            });
        }
        slots.push(slot);
        t += step;
    }

    let mut windows: Vec<Window> = Vec::new();
    for (i, s) in slots.iter().enumerate() {
        let same = i > 0
            && slots[i - 1]
                .people
                .iter()
                .zip(&s.people)
                .all(|(a, b)| a.comfort == b.comfort);
        match windows.last_mut() {
            Some(w) if same => {
                w.last = i;
                w.end_unix_ms = s.start_unix_ms + duration;
            }
            _ => windows.push(Window {
                first: i,
                last: i,
                start_unix_ms: s.start_unix_ms,
                end_unix_ms: s.start_unix_ms + duration,
                work: s.work,
                shoulder: s.shoulder,
                night: s.night,
            }),
        }
    }
    windows.sort_by_key(|w| {
        (
            w.night,
            std::cmp::Reverse(w.work),
            std::cmp::Reverse(w.last - w.first),
            w.first,
        )
    });
    windows.truncate(MAX_WINDOWS);

    Ok(DayPlan {
        start_unix_ms: start,
        end_unix_ms: end,
        slots,
        best: windows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u8, day: u8) -> Date {
        Date::new(y, m, day).unwrap()
    }

    fn utc(y: i16, m: i8, day: i8, h: i8, mi: i8) -> i64 {
        tz::wall_to_unix_ms(y, m, day, h, mi, 0, "UTC").unwrap()
    }

    fn office(zone: &str) -> Participant<'_> {
        Participant {
            zone,
            hours: Hours::OFFICE,
        }
    }

    #[test]
    fn karachi_london_overlap() {
        let plan = plan_day(
            d(2026, 11, 10),
            "Asia/Karachi",
            &[office("Asia/Karachi"), office("Europe/London")],
            Options::default(),
        )
        .unwrap();
        let b = plan.best[0];
        assert_eq!((b.work, b.night), (2, 0));
        assert_eq!(b.start_unix_ms, utc(2026, 11, 10, 9, 0));
        assert_eq!(plan.slots[b.last].start_unix_ms, utc(2026, 11, 10, 11, 0));
        assert_eq!(b.end_unix_ms, utc(2026, 11, 10, 12, 0));
        let k = plan.slots[b.first].people[0];
        assert_eq!((k.hour, k.minute, k.day_offset), (14, 0, 0));
        assert_eq!(plan.slots.len(), 48);
    }

    #[test]
    fn dst_gap_between_us_and_uk() {
        let people = [office("America/New_York"), office("Europe/London")];
        // 10 March: US already on EDT, UK still on GMT -> four-hour overlap 13:00-17:00 UTC.
        let p = plan_day(d(2026, 3, 10), "Europe/London", &people, Options::default()).unwrap();
        assert_eq!(
            (p.best[0].start_unix_ms, p.best[0].end_unix_ms),
            (utc(2026, 3, 10, 13, 0), utc(2026, 3, 10, 17, 0))
        );
        // 30 March: both on summer time -> three-hour overlap 13:00-16:00 UTC.
        let p = plan_day(d(2026, 3, 30), "Europe/London", &people, Options::default()).unwrap();
        assert_eq!(
            (p.best[0].start_unix_ms, p.best[0].end_unix_ms),
            (utc(2026, 3, 30, 13, 0), utc(2026, 3, 30, 16, 0))
        );
        assert_eq!(p.best[0].work, 2);
    }

    #[test]
    fn quarter_hour_offset() {
        let opts = Options {
            step_min: 15,
            duration_min: 30,
            shoulder_min: 120,
        };
        let p = plan_day(
            d(2026, 11, 10),
            "Asia/Karachi",
            &[office("Asia/Karachi"), office("Asia/Kathmandu")],
            opts,
        )
        .unwrap();
        let b = p.best[0];
        assert_eq!(b.start_unix_ms, utc(2026, 11, 10, 4, 0));
        assert_eq!(p.slots[b.last].start_unix_ms, utc(2026, 11, 10, 10, 45));
        let ktm = p.slots[b.first].people[1];
        assert_eq!((ktm.hour, ktm.minute), (9, 45));
    }

    #[test]
    fn no_shared_working_hours() {
        let p = plan_day(
            d(2026, 11, 10),
            "Asia/Karachi",
            &[office("Asia/Karachi"), office("Pacific/Honolulu")],
            Options::default(),
        )
        .unwrap();
        assert!(p.slots.iter().all(|s| s.work < 2));
        let b = p.best[0];
        assert_eq!((b.night, b.work, b.shoulder), (0, 1, 1));
        assert_eq!(b.start_unix_ms, utc(2026, 11, 10, 2, 0));
        let hnl = p.slots[b.first].people[1];
        assert_eq!(
            (hnl.hour, hnl.day_offset, hnl.comfort),
            (16, -1, Comfort::Work)
        );
    }

    #[test]
    fn meeting_running_past_hours_is_not_work() {
        let p = plan_day(
            d(2026, 11, 10),
            "Asia/Karachi",
            &[office("Asia/Karachi"), office("Europe/London")],
            Options::default(),
        )
        .unwrap();
        // 16:30 Karachi: ends 17:30, past Karachi's 17:00 finish.
        let s = p
            .slots
            .iter()
            .find(|s| s.start_unix_ms == utc(2026, 11, 10, 11, 30))
            .unwrap();
        assert_eq!(s.people[0].comfort, Comfort::Shoulder);
        assert_eq!(s.people[1].comfort, Comfort::Work);
    }

    #[test]
    fn dst_days_have_23_and_25_hours() {
        let o = Options {
            step_min: 60,
            ..Options::default()
        };
        let one = [office("Europe/London")];
        assert_eq!(
            plan_day(d(2026, 3, 29), "Europe/London", &one, o)
                .unwrap()
                .slots
                .len(),
            23
        );
        assert_eq!(
            plan_day(d(2026, 10, 25), "Europe/London", &one, o)
                .unwrap()
                .slots
                .len(),
            25
        );
        assert_eq!(
            plan_day(d(2026, 11, 10), "Europe/London", &one, o)
                .unwrap()
                .slots
                .len(),
            24
        );
    }

    #[test]
    fn overnight_shift() {
        let o = Options {
            step_min: 60,
            ..Options::default()
        };
        let night = [Participant {
            zone: "UTC",
            hours: Hours {
                start_min: 22 * 60,
                end_min: 6 * 60,
            },
        }];
        let p = plan_day(d(2026, 11, 10), "UTC", &night, o).unwrap();
        assert_eq!(p.slots[23].people[0].comfort, Comfort::Work);
        assert_eq!(p.slots[12].people[0].comfort, Comfort::Night);
        assert_eq!(p.slots[6].people[0].comfort, Comfort::Shoulder);
        assert_eq!((p.best[0].first, p.best[0].last), (0, 5));
    }

    #[test]
    fn best_is_ranked_and_capped() {
        let p = plan_day(
            d(2026, 11, 10),
            "Asia/Karachi",
            &[office("Asia/Karachi"), office("America/New_York")],
            Options::default(),
        )
        .unwrap();
        assert!(p.best.len() <= MAX_WINDOWS);
        for w in p.best.windows(2) {
            assert!(
                (w[0].night, std::cmp::Reverse(w[0].work))
                    <= (w[1].night, std::cmp::Reverse(w[1].work))
            );
        }
    }

    #[test]
    fn rejects_bad_input() {
        let day = d(2026, 11, 10);
        let o = Options::default();
        assert_eq!(plan_day(day, "UTC", &[], o), Err(PlanError::Participants));
        let many: Vec<_> = (0..11).map(|_| office("UTC")).collect();
        assert_eq!(plan_day(day, "UTC", &many, o), Err(PlanError::Participants));
        let same = [Participant {
            zone: "UTC",
            hours: Hours {
                start_min: 540,
                end_min: 540,
            },
        }];
        assert!(matches!(
            plan_day(day, "UTC", &same, o),
            Err(PlanError::Options(_))
        ));
        assert!(matches!(
            plan_day(day, "UTC", &[office("UTC")], Options { step_min: 20, ..o }),
            Err(PlanError::Options(_))
        ));
        assert!(matches!(
            plan_day(day, "UTC", &[office("Mars/Base")], o),
            Err(PlanError::Tz(_))
        ));
        assert!(matches!(
            plan_day(day, "Mars/Base", &[office("UTC")], o),
            Err(PlanError::Tz(_))
        ));
    }
}
