//! Islamic prayer times from the sun's position, for the common calculation conventions.
//! These are calculations; local mosques and authorities may publish times that differ by minutes.

use super::sun::{Crossing, SUNRISE_ALT, crossing, noon_on, solar_day, sun_at};
use super::{AstroError, DAY_MS, check_coords, julian_day};
use crate::convert::Date;
use crate::tz;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Method {
    /// University of Islamic Sciences, Karachi: Fajr 18°, Isha 18°.
    Karachi,
    /// Muslim World League: 18° / 17°.
    MuslimWorldLeague,
    /// Islamic Society of North America: 15° / 15°.
    NorthAmerica,
    /// Egyptian General Authority of Survey: 19.5° / 17.5°.
    Egypt,
    /// Umm al-Qura, Makkah: Fajr 18.5°, Isha 90 minutes after Maghrib.
    UmmAlQura,
}

enum Isha {
    Angle(f64),
    Minutes(i64),
}

impl Method {
    fn params(self) -> (f64, Isha) {
        match self {
            Self::Karachi => (18.0, Isha::Angle(18.0)),
            Self::MuslimWorldLeague => (18.0, Isha::Angle(17.0)),
            Self::NorthAmerica => (15.0, Isha::Angle(15.0)),
            Self::Egypt => (19.5, Isha::Angle(17.5)),
            Self::UmmAlQura => (18.5, Isha::Minutes(90)),
        }
    }
}

/// Shadow length used for Asr.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AsrShadow {
    /// Shafi'i, Maliki, Hanbali: shadow equals object length.
    Standard,
    /// Hanafi: shadow twice the object length.
    Hanafi,
}

/// What to do where Fajr or Isha twilight angles are never reached (high latitudes in summer).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HighLatitude {
    /// Fajr/Isha at most angle/60 of the night from sunrise/sunset.
    AngleBased,
    /// Fajr/Isha at most half the night from sunrise/sunset.
    MiddleOfNight,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PrayerTimes {
    pub fajr: Option<i64>,
    pub sunrise: Option<i64>,
    pub dhuhr: i64,
    pub asr: Option<i64>,
    pub maghrib: Option<i64>,
    pub isha: Option<i64>,
    /// True when Fajr or Isha came from the high-latitude rule rather than the twilight angle.
    pub adjusted: bool,
}

pub fn prayer_times(
    date: Date,
    lat: f64,
    lon: f64,
    zone_name: &str,
    method: Method,
    asr: AsrShadow,
    high: HighLatitude,
) -> Result<PrayerTimes, AstroError> {
    check_coords(lat, lon)?;
    let zone = tz::zone(zone_name)?;
    let day = solar_day(date, lon, &zone)?;
    let (fajr_angle, isha_rule) = method.params();
    let dhuhr = noon_on(day, lon);
    let sunrise = crossing(day, lat, lon, SUNRISE_ALT, true).at();
    let sunset = crossing(day, lat, lon, SUNRISE_ALT, false).at();

    let decl = sun_at(julian_day(dhuhr as f64)).decl_deg;
    let factor = match asr {
        AsrShadow::Standard => 1.0,
        AsrShadow::Hanafi => 2.0,
    };
    let asr_alt = (1.0 / (factor + (lat - decl).abs().to_radians().tan()))
        .atan()
        .to_degrees();
    let asr_time = match crossing(day, lat, lon, asr_alt, false) {
        Crossing::At(t) => Some(t),
        _ => None,
    };

    let mut fajr = crossing(day, lat, lon, -fajr_angle, true).at();
    let mut isha = match isha_rule {
        Isha::Angle(a) => crossing(day, lat, lon, -a, false).at(),
        Isha::Minutes(m) => sunset.map(|s| s + m * 60_000),
    };

    let mut adjusted = false;
    if let (Some(rise), Some(set)) = (sunrise, sunset) {
        let night = rise + DAY_MS - set;
        let portion = |angle: f64| match high {
            HighLatitude::AngleBased => (night as f64 * angle / 60.0) as i64,
            HighLatitude::MiddleOfNight => night / 2,
        };
        let fajr_limit = rise - portion(fajr_angle);
        if fajr.is_none_or(|f| f < fajr_limit) {
            fajr = Some(fajr_limit);
            adjusted = true;
        }
        if let Isha::Angle(a) = isha_rule {
            let isha_limit = set + portion(a);
            if isha.is_none_or(|i| i > isha_limit) {
                isha = Some(isha_limit);
                adjusted = true;
            }
        }
    }

    Ok(PrayerTimes {
        fajr,
        sunrise,
        dhuhr,
        asr: asr_time,
        maghrib: sunset,
        isha,
        adjusted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u8, day: u8) -> Date {
        Date::new(y, m, day).unwrap()
    }

    fn near(got: Option<i64>, want: i64, what: &str) {
        let g = got.unwrap_or_else(|| panic!("{what} missing"));
        assert!(
            (g - want).abs() <= 60_000,
            "{what}: off by {} s",
            (g - want) / 1000
        );
    }

    #[test]
    fn karachi_follows_the_18_degree_angles() {
        let p = prayer_times(
            d(2026, 11, 6),
            24.8607,
            67.0011,
            "Asia/Karachi",
            Method::Karachi,
            AsrShadow::Hanafi,
            HighLatitude::AngleBased,
        )
        .unwrap();
        // astral: sun at −18° rising / setting
        near(p.fajr, 1793924650180, "fajr");
        near(p.isha, 1793974000795, "isha");
        assert!(!p.adjusted);
        let order = [
            p.fajr.unwrap(),
            p.sunrise.unwrap(),
            p.dhuhr,
            p.asr.unwrap(),
            p.maghrib.unwrap(),
            p.isha.unwrap(),
        ];
        assert!(order.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn hanafi_asr_is_later_than_standard() {
        let args = (d(2026, 11, 6), 24.8607, 67.0011, "Asia/Karachi");
        let std = prayer_times(
            args.0,
            args.1,
            args.2,
            args.3,
            Method::Karachi,
            AsrShadow::Standard,
            HighLatitude::AngleBased,
        )
        .unwrap();
        let han = prayer_times(
            args.0,
            args.1,
            args.2,
            args.3,
            Method::Karachi,
            AsrShadow::Hanafi,
            HighLatitude::AngleBased,
        )
        .unwrap();
        let gap = han.asr.unwrap() - std.asr.unwrap();
        assert!((30 * 60_000..90 * 60_000).contains(&gap), "{gap}");
    }

    #[test]
    fn asr_shadow_rule_holds() {
        // At Asr the sun's altitude satisfies cot(alt) = factor + tan|lat − decl|.
        let p = prayer_times(
            d(2026, 3, 20),
            21.4225,
            39.8262,
            "Asia/Riyadh",
            Method::UmmAlQura,
            AsrShadow::Standard,
            HighLatitude::AngleBased,
        )
        .unwrap();
        let pos = super::super::sun::sun_position(p.asr.unwrap(), 21.4225, 39.8262).unwrap();
        let decl = sun_at(julian_day(p.dhuhr as f64)).decl_deg;
        let want = (1.0 / (1.0 + (21.4225 - decl).abs().to_radians().tan()))
            .atan()
            .to_degrees();
        assert!(
            (pos.altitude - want).abs() < 0.2,
            "{} vs {want}",
            pos.altitude
        );
    }

    #[test]
    fn umm_al_qura_isha_is_90_minutes_after_maghrib() {
        let p = prayer_times(
            d(2026, 11, 6),
            21.4225,
            39.8262,
            "Asia/Riyadh",
            Method::UmmAlQura,
            AsrShadow::Standard,
            HighLatitude::AngleBased,
        )
        .unwrap();
        assert_eq!(p.isha.unwrap() - p.maghrib.unwrap(), 90 * 60_000);
    }

    #[test]
    fn high_latitude_summer_is_adjusted_not_missing() {
        // London, June: the sun never reaches −18°, so Fajr/Isha come from the rule.
        let p = prayer_times(
            d(2026, 6, 21),
            51.5074,
            -0.1278,
            "Europe/London",
            Method::MuslimWorldLeague,
            AsrShadow::Standard,
            HighLatitude::AngleBased,
        )
        .unwrap();
        assert!(p.adjusted);
        let (f, r, m, i) = (
            p.fajr.unwrap(),
            p.sunrise.unwrap(),
            p.maghrib.unwrap(),
            p.isha.unwrap(),
        );
        assert!(f < r && i > m);
        let night = r + DAY_MS - m;
        assert_eq!(r - f, (night as f64 * 18.0 / 60.0) as i64);
        let mid = prayer_times(
            d(2026, 6, 21),
            51.5074,
            -0.1278,
            "Europe/London",
            Method::MuslimWorldLeague,
            AsrShadow::Standard,
            HighLatitude::MiddleOfNight,
        )
        .unwrap();
        assert!(mid.fajr.unwrap() < p.fajr.unwrap());
    }

    #[test]
    fn polar_night_leaves_sun_based_times_empty() {
        let p = prayer_times(
            d(2026, 12, 21),
            69.6492,
            18.9553,
            "Europe/Oslo",
            Method::MuslimWorldLeague,
            AsrShadow::Standard,
            HighLatitude::AngleBased,
        )
        .unwrap();
        assert_eq!((p.sunrise, p.maghrib), (None, None));
        assert!(p.dhuhr > 0);
    }

    #[test]
    fn methods_differ_as_expected() {
        let args = (d(2026, 11, 6), 40.7128, -74.006, "America/New_York");
        let isna = prayer_times(
            args.0,
            args.1,
            args.2,
            args.3,
            Method::NorthAmerica,
            AsrShadow::Standard,
            HighLatitude::AngleBased,
        )
        .unwrap();
        let egypt = prayer_times(
            args.0,
            args.1,
            args.2,
            args.3,
            Method::Egypt,
            AsrShadow::Standard,
            HighLatitude::AngleBased,
        )
        .unwrap();
        assert!(egypt.fajr.unwrap() < isna.fajr.unwrap());
        assert_eq!(isna.dhuhr, egypt.dhuhr);
    }
}
