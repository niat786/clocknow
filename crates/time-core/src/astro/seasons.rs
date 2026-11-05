//! Equinoxes and solstices (Meeus ch. 27), accurate to about a minute for 1000-3000 CE.

use super::{delta_t_seconds, unix_ms_from_jd};
use serde::Serialize;

#[rustfmt::skip]
const PERIODIC: [(f64, f64, f64); 24] = [
    (485.0, 324.96, 1934.136), (203.0, 337.23, 32964.467), (199.0, 342.08, 20.186), (182.0, 27.85, 445267.112),
    (156.0, 73.14, 45036.886), (136.0, 171.52, 22518.443), (77.0, 222.54, 65928.934), (74.0, 296.72, 3034.906),
    (70.0, 243.58, 9037.513), (58.0, 119.81, 33718.147), (52.0, 297.17, 150.678), (50.0, 21.02, 2281.226),
    (45.0, 247.54, 29929.562), (44.0, 325.15, 31555.956), (29.0, 60.93, 4443.417), (18.0, 155.12, 67555.328),
    (17.0, 288.79, 4562.452), (16.0, 198.04, 62894.029), (14.0, 199.76, 31436.921), (12.0, 95.39, 14577.848),
    (12.0, 287.11, 31931.756), (12.0, 320.81, 34777.259), (9.0, 227.73, 1222.114), (8.0, 15.45, 16859.074),
];

#[rustfmt::skip]
const MEAN: [[f64; 5]; 4] = [
    [2_451_623.809_84, 365_242.374_04, 0.051_69, -0.004_11, -0.000_57],
    [2_451_716.567_67, 365_241.626_03, 0.003_25, 0.008_88, -0.000_30],
    [2_451_810.217_15, 365_242.017_67, -0.115_75, 0.003_37, 0.000_78],
    [2_451_900.059_52, 365_242.740_49, -0.062_23, -0.008_23, 0.000_32],
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Seasons {
    /// Northern spring / southern autumn.
    pub march_equinox: i64,
    pub june_solstice: i64,
    pub september_equinox: i64,
    pub december_solstice: i64,
}

fn event(year: i32, which: usize) -> i64 {
    let y = (f64::from(year) - 2000.0) / 1000.0;
    let c = MEAN[which];
    let jde0 = c[0] + c[1] * y + c[2] * y * y + c[3] * y.powi(3) + c[4] * y.powi(4);
    let t = (jde0 - 2_451_545.0) / 36_525.0;
    let w = (35_999.373 * t - 2.47).to_radians();
    let dl = 1.0 + 0.0334 * w.cos() + 0.0007 * (2.0 * w).cos();
    let s: f64 = PERIODIC
        .iter()
        .map(|(a, b, cc)| a * (b + cc * t).to_radians().cos())
        .sum();
    let jde = jde0 + 0.000_01 * s / dl;
    unix_ms_from_jd(jde) - (delta_t_seconds(f64::from(year)) * 1000.0).round() as i64
}

/// UTC instants of a year's equinoxes and solstices. Valid for years 1000-3000.
pub fn seasons(year: i32) -> Option<Seasons> {
    if !(1000..=3000).contains(&year) {
        return None;
    }
    Some(Seasons {
        march_equinox: event(year, 0),
        june_solstice: event(year, 1),
        september_equinox: event(year, 2),
        december_solstice: event(year, 3),
    })
}

#[cfg(test)]
mod tests {
    use super::super::sun::sun_at;
    use super::super::{DAY_MS, julian_day};
    use super::*;

    fn near(got: i64, want: i64) {
        assert!(
            (got - want).abs() <= 120_000,
            "off by {} s",
            (got - want) / 1000
        );
    }

    /// PyEphem references.
    #[test]
    fn matches_reference() {
        let cases = [
            (
                2024,
                [1710903982310, 1718916663334, 1727009012211, 1734772820646],
            ),
            (
                2026,
                [1774017953449, 1782030271360, 1790121909386, 1797886199830],
            ),
            (
                2050,
                [2531384346278, 2539395155377, 2547487677064, 2555253480234],
            ),
        ];
        for (year, want) in cases {
            let s = seasons(year).unwrap();
            for (got, w) in [
                s.march_equinox,
                s.june_solstice,
                s.september_equinox,
                s.december_solstice,
            ]
            .into_iter()
            .zip(want)
            {
                near(got, w);
            }
        }
    }

    #[test]
    fn sun_longitude_agrees_at_each_event() {
        let s = seasons(2026).unwrap();
        for (t, lon) in [
            (s.march_equinox, 0.0),
            (s.june_solstice, 90.0),
            (s.september_equinox, 180.0),
            (s.december_solstice, 270.0),
        ] {
            let got = sun_at(julian_day(t as f64)).longitude_deg;
            let diff = super::super::wrap180(got - lon);
            assert!(diff.abs() < 0.02, "{lon}: {got}");
        }
    }

    #[test]
    fn range_and_order() {
        assert!(seasons(999).is_none());
        assert!(seasons(3001).is_none());
        for year in [1900, 2000, 2100] {
            let s = seasons(year).unwrap();
            assert!(
                s.march_equinox < s.june_solstice
                    && s.june_solstice < s.september_equinox
                    && s.september_equinox < s.december_solstice
            );
            assert!(s.december_solstice - s.march_equinox < 290 * DAY_MS);
        }
    }
}
