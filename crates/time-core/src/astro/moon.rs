//! Moon phase, illumination, age and the next principal phases.

use super::sun::sun_at;
use super::{DAY_MS, decimal_year, delta_t_seconds, julian_day, norm360, wrap180};
use serde::Serialize;

/// Main periodic terms of the moon's longitude (Meeus table 47.A): D, M, M′, F, coefficient in 1e-6°.
#[rustfmt::skip]
const LONGITUDE_TERMS: [(i8, i8, i8, i8, i32); 40] = [
    (0, 0, 1, 0, 6_288_774), (2, 0, -1, 0, 1_274_027), (2, 0, 0, 0, 658_314), (0, 0, 2, 0, 213_618),
    (0, 1, 0, 0, -185_116), (0, 0, 0, 2, -114_332), (2, 0, -2, 0, 58_793), (2, -1, -1, 0, 57_066),
    (2, 0, 1, 0, 53_322), (2, -1, 0, 0, 45_758), (0, 1, -1, 0, -40_923), (1, 0, 0, 0, -34_720),
    (0, 1, 1, 0, -30_383), (2, 0, 0, -2, 15_327), (0, 0, 1, 2, -12_528), (0, 0, 1, -2, 10_980),
    (4, 0, -1, 0, 10_675), (0, 0, 3, 0, 10_034), (4, 0, -2, 0, 8_548), (2, 1, -1, 0, -7_888),
    (2, 1, 0, 0, -6_766), (1, 0, -1, 0, -5_163), (1, 1, 0, 0, 4_987), (2, -1, 1, 0, 4_036),
    (2, 0, 2, 0, 3_994), (4, 0, 0, 0, 3_861), (2, 0, -3, 0, 3_665), (0, 1, -2, 0, -2_689),
    (2, 0, -1, 2, -2_602), (2, -1, -2, 0, 2_390), (1, 0, 1, 0, -2_348), (2, -2, 0, 0, 2_236),
    (0, 1, 2, 0, -2_120), (0, 2, 0, 0, -2_069), (2, -2, -1, 0, 2_048), (2, 0, 1, -2, -1_773),
    (2, 0, 0, 2, -1_595), (4, -1, -1, 0, 1_215), (0, 0, 2, 2, -1_110), (3, 0, -1, 0, -892),
];

/// Mean synodic motion of the moon relative to the sun, degrees per day.
const ELONGATION_RATE: f64 = 360.0 / 29.530_588_853;

/// Julian ephemeris day (TT) for a UT instant.
fn jde(unix_ms: f64) -> f64 {
    julian_day(unix_ms) + delta_t_seconds(decimal_year(unix_ms)) / 86_400.0
}

/// Geocentric ecliptic longitude of the moon, degrees, at Julian ephemeris day `jde`.
fn moon_longitude(jde: f64) -> f64 {
    let t = (jde - 2_451_545.0) / 36_525.0;
    let lp = 218.316_447_7 + 481_267.881_234_21 * t - 0.001_578_6 * t * t + t.powi(3) / 538_841.0
        - t.powi(4) / 65_194_000.0;
    let d = 297.850_192_1 + 445_267.111_403_4 * t - 0.001_881_9 * t * t + t.powi(3) / 545_868.0
        - t.powi(4) / 113_065_000.0;
    let m = 357.529_109_2 + 35_999.050_290_9 * t - 0.000_153_6 * t * t + t.powi(3) / 24_490_000.0;
    let mp = 134.963_396_4 + 477_198.867_505_5 * t + 0.008_741_4 * t * t + t.powi(3) / 69_699.0
        - t.powi(4) / 14_712_000.0;
    let f = 93.272_095_0 + 483_202.017_523_3 * t - 0.003_653_9 * t * t - t.powi(3) / 3_526_000.0
        + t.powi(4) / 863_310_000.0;
    let a1 = 119.75 + 131.849 * t;
    let a2 = 53.09 + 479_264.290 * t;
    let e = 1.0 - 0.002_516 * t - 0.000_007_4 * t * t;
    let mut sum = 0.0;
    for (cd, cm, cmp, cf, coef) in LONGITUDE_TERMS {
        let arg = f64::from(cd) * d + f64::from(cm) * m + f64::from(cmp) * mp + f64::from(cf) * f;
        let scale = match cm.abs() {
            1 => e,
            2 => e * e,
            _ => 1.0,
        };
        sum += f64::from(coef) * scale * arg.to_radians().sin();
    }
    sum += 3958.0 * a1.to_radians().sin()
        + 1962.0 * (lp - f).to_radians().sin()
        + 318.0 * a2.to_radians().sin();
    norm360(lp + sum / 1e6)
}

/// Moon's longitude minus the sun's: 0 new, 90 first quarter, 180 full, 270 last quarter.
pub(crate) fn elongation(unix_ms: f64) -> f64 {
    let j = jde(unix_ms);
    norm360(moon_longitude(j) - sun_at(j).longitude_deg)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    NewMoon,
    FirstQuarter,
    FullMoon,
    LastQuarter,
}

impl Phase {
    const ALL: [Phase; 4] = [
        Phase::NewMoon,
        Phase::FirstQuarter,
        Phase::FullMoon,
        Phase::LastQuarter,
    ];

    fn target(self) -> f64 {
        match self {
            Self::NewMoon => 0.0,
            Self::FirstQuarter => 90.0,
            Self::FullMoon => 180.0,
            Self::LastQuarter => 270.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PhaseName {
    NewMoon,
    WaxingCrescent,
    FirstQuarter,
    WaxingGibbous,
    FullMoon,
    WaningGibbous,
    LastQuarter,
    WaningCrescent,
}

fn phase_name(elong: f64) -> PhaseName {
    const NAMES: [PhaseName; 8] = [
        PhaseName::NewMoon,
        PhaseName::WaxingCrescent,
        PhaseName::FirstQuarter,
        PhaseName::WaxingGibbous,
        PhaseName::FullMoon,
        PhaseName::WaningGibbous,
        PhaseName::LastQuarter,
        PhaseName::WaningCrescent,
    ];
    NAMES[(norm360(elong + 22.5) / 45.0) as usize % 8]
}

/// Refines a guess to the instant the elongation equals `target`.
fn refine(target: f64, mut t: f64) -> i64 {
    for _ in 0..30 {
        let diff = wrap180(target - elongation(t));
        t += diff / ELONGATION_RATE * DAY_MS as f64;
        if diff.abs() < 1e-7 {
            break;
        }
    }
    t.round() as i64
}

/// First instant after `unix_ms` at which `phase` occurs.
pub fn next_phase(phase: Phase, unix_ms: i64) -> i64 {
    let t = unix_ms as f64;
    let ahead = norm360(phase.target() - elongation(t));
    let found = refine(phase.target(), t + ahead / ELONGATION_RATE * DAY_MS as f64);
    if found <= unix_ms {
        refine(phase.target(), found as f64 + 29.0 * DAY_MS as f64)
    } else {
        found
    }
}

/// Last instant at or before `unix_ms` at which `phase` occurred.
pub fn previous_phase(phase: Phase, unix_ms: i64) -> i64 {
    let t = unix_ms as f64;
    let behind = norm360(elongation(t) - phase.target());
    let found = refine(phase.target(), t - behind / ELONGATION_RATE * DAY_MS as f64);
    if found > unix_ms {
        refine(phase.target(), found as f64 - 29.0 * DAY_MS as f64)
    } else {
        found
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct PhaseEvent {
    pub phase: Phase,
    pub at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MoonInfo {
    pub phase: PhaseName,
    /// 0 = new, 180 = full, degrees.
    pub elongation: f64,
    /// Fraction of the disc lit, 0..1.
    pub illumination: f64,
    /// Days since the last new moon.
    pub age_days: f64,
    pub waxing: bool,
    /// The next new, first-quarter, full and last-quarter moons, soonest first.
    pub next: Vec<PhaseEvent>,
}

pub fn moon_info(unix_ms: i64) -> MoonInfo {
    let e = elongation(unix_ms as f64);
    let last_new = previous_phase(Phase::NewMoon, unix_ms);
    let mut next: Vec<PhaseEvent> = Phase::ALL
        .iter()
        .map(|&p| PhaseEvent {
            phase: p,
            at: next_phase(p, unix_ms),
        })
        .collect();
    next.sort_by_key(|p| p.at);
    MoonInfo {
        phase: phase_name(e),
        elongation: e,
        illumination: (1.0 - e.to_radians().cos()) / 2.0,
        age_days: (unix_ms - last_new) as f64 / DAY_MS as f64,
        waxing: e < 180.0,
        next,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOL_MS: i64 = 120_000;

    fn near(got: i64, want: i64, what: &str) {
        assert!(
            (got - want).abs() <= TOL_MS,
            "{what}: off by {} s",
            (got - want) / 1000
        );
    }

    /// Times from the independent PyEphem library.
    #[test]
    fn phases_match_reference_within_two_minutes() {
        let start = 1_704_067_200_000; // 2024-01-01T00:00Z
        let cases: [(Phase, [i64; 3]); 4] = [
            (
                Phase::NewMoon,
                [1704974241833, 1707519547641, 1710061223041],
            ),
            (
                Phase::FirstQuarter,
                [1705549954266, 1708095654550, 1710648640733],
            ),
            (
                Phase::FullMoon,
                [1706205237068, 1708777822256, 1711350016416],
            ),
            (
                Phase::LastQuarter,
                [1704339024783, 1706915876926, 1709479407165],
            ),
        ];
        for (phase, want) in cases {
            let mut t = start;
            for w in want {
                t = next_phase(phase, t);
                near(t, w, &format!("{phase:?}"));
            }
        }
        near(
            next_phase(
                Phase::FullMoon,
                4_102_444_800_000 + 172 * DAY_MS - 21 * DAY_MS,
            ),
            4117309846455,
            "full 2100",
        );
    }

    #[test]
    fn next_is_strictly_after_and_previous_not_after() {
        let full = 1706205237068;
        assert!(next_phase(Phase::FullMoon, full + 60_000) > full + 20 * DAY_MS);
        let prev = previous_phase(Phase::FullMoon, full + 60_000);
        near(prev, full, "previous full");
        assert!(
            previous_phase(Phase::NewMoon, 1704974241833 - 60_000) < 1704974241833 - 20 * DAY_MS
        );
    }

    #[test]
    fn illumination_and_name() {
        // PyEphem at 2026-11-06T00:00Z: 10.95 % lit, waning (elongation −38.6°).
        let m = moon_info(1_793_923_200_000);
        assert!((m.illumination - 0.1095).abs() < 0.01, "{m:?}");
        assert!((m.elongation - (360.0 - 38.614)).abs() < 0.5, "{m:?}");
        assert!(!m.waxing);
        assert_eq!(m.phase, PhaseName::WaningCrescent);
        assert!((25.0..29.6).contains(&m.age_days));
        assert_eq!(m.next.len(), 4);
        assert!(m.next.windows(2).all(|w| w[0].at < w[1].at));
        assert_eq!(m.next[0].phase, Phase::NewMoon);
    }

    #[test]
    fn names_cover_the_cycle() {
        assert_eq!(phase_name(0.0), PhaseName::NewMoon);
        assert_eq!(phase_name(350.0), PhaseName::NewMoon);
        assert_eq!(phase_name(45.0), PhaseName::WaxingCrescent);
        assert_eq!(phase_name(90.0), PhaseName::FirstQuarter);
        assert_eq!(phase_name(180.0), PhaseName::FullMoon);
        assert_eq!(phase_name(270.0), PhaseName::LastQuarter);
        assert_eq!(phase_name(315.0), PhaseName::WaningCrescent);
    }

    #[test]
    fn full_moon_is_fully_lit() {
        let m = moon_info(1706205237068);
        assert!(m.illumination > 0.999);
        assert_eq!(m.phase, PhaseName::FullMoon);
        assert!((14.0..16.0).contains(&m.age_days));
    }
}
