//! Sun times for a place and local date, and the sun's position at an instant.

use super::{AstroError, DAY_MS, check_coords, julian_day};
use crate::convert::Date;
use crate::tz;
use jiff::Timestamp;
use jiff::tz::TimeZone;
use serde::Serialize;

/// Altitudes (degrees) that define the events. Sunrise/sunset include 34′ refraction + 16′ semidiameter.
pub const SUNRISE_ALT: f64 = -0.833;
pub const CIVIL_ALT: f64 = -6.0;
pub const NAUTICAL_ALT: f64 = -12.0;
pub const ASTRONOMICAL_ALT: f64 = -18.0;
/// Photographers' golden hour: sun between −4° and +6°; blue hour: between −6° and −4°.
pub const GOLDEN_HIGH_ALT: f64 = 6.0;
pub const BLUE_HIGH_ALT: f64 = -4.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct SunAt {
    pub decl_deg: f64,
    pub eqt_min: f64,
    /// Geometric longitude corrected for aberration (no nutation), degrees.
    pub longitude_deg: f64,
}

/// NOAA solar formulas at Julian day `jd`.
pub(crate) fn sun_at(jd: f64) -> SunAt {
    let jc = (jd - 2_451_545.0) / 36_525.0;
    let l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)).rem_euclid(360.0);
    let m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    let e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
    let mr = m.to_radians();
    let c = mr.sin() * (1.914602 - jc * (0.004817 + 0.000014 * jc))
        + (2.0 * mr).sin() * (0.019993 - 0.000101 * jc)
        + (3.0 * mr).sin() * 0.000289;
    let true_long = l0 + c;
    let omega = (125.04 - 1934.136 * jc).to_radians();
    let app_long = true_long - 0.00569 - 0.00478 * omega.sin();
    let mean_obliq =
        23.0 + (26.0 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60.0) / 60.0;
    let obliq = (mean_obliq + 0.00256 * omega.cos()).to_radians();
    let decl = (obliq.sin() * app_long.to_radians().sin()).asin();
    let y = (obliq / 2.0).tan().powi(2);
    let l0r = l0.to_radians();
    let eqt = 4.0
        * (y * (2.0 * l0r).sin() - 2.0 * e * mr.sin() + 4.0 * e * y * mr.sin() * (2.0 * l0r).cos()
            - 0.5 * y * y * (4.0 * l0r).sin()
            - 1.25 * e * e * (2.0 * mr).sin())
        .to_degrees();
    SunAt {
        decl_deg: decl.to_degrees(),
        eqt_min: eqt,
        longitude_deg: (true_long - 0.00569).rem_euclid(360.0),
    }
}

/// When the sun crosses an altitude, or why it doesn't.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Crossing {
    At(i64),
    AlwaysAbove,
    AlwaysBelow,
}

impl Crossing {
    pub(crate) fn at(self) -> Option<i64> {
        match self {
            Self::At(t) => Some(t),
            _ => None,
        }
    }
}

fn minutes_after(mid_ms: i64, minutes: f64) -> i64 {
    mid_ms + (minutes * 60_000.0).round() as i64
}

/// Solar noon of UTC day `day` (days since 1970-01-01) at longitude `lon` (east positive).
pub(crate) fn noon_on(day: i64, lon: f64) -> i64 {
    let mid = day * DAY_MS;
    let mut t = minutes_after(mid, 720.0 - 4.0 * lon);
    for _ in 0..3 {
        t = minutes_after(
            mid,
            720.0 - 4.0 * lon - sun_at(julian_day(t as f64)).eqt_min,
        );
    }
    t
}

/// Rising or setting crossing of `alt` around the solar noon of UTC day `day`.
pub(crate) fn crossing(day: i64, lat: f64, lon: f64, alt: f64, rising: bool) -> Crossing {
    let mid = day * DAY_MS;
    let phi = lat.to_radians();
    let mut t = noon_on(day, lon);
    for _ in 0..5 {
        let s = sun_at(julian_day(t as f64));
        let d = s.decl_deg.to_radians();
        let cos_h = (alt.to_radians().sin() - phi.sin() * d.sin()) / (phi.cos() * d.cos());
        if cos_h.is_nan() || cos_h > 1.0 {
            return Crossing::AlwaysBelow;
        }
        if cos_h < -1.0 {
            return Crossing::AlwaysAbove;
        }
        let h = cos_h.acos().to_degrees();
        let shift = if rising { -4.0 * h } else { 4.0 * h };
        t = minutes_after(mid, 720.0 - 4.0 * lon - s.eqt_min + shift);
    }
    Crossing::At(t)
}

/// Local day number (days since 1970-01-01) of an instant in a zone.
pub(crate) fn local_day(zone: &TimeZone, unix_ms: i64) -> Result<i64, AstroError> {
    let ts = Timestamp::from_millisecond(unix_ms).map_err(|_| tz::TzError::OutOfRange(unix_ms))?;
    Ok((unix_ms.div_euclid(1000) + i64::from(zone.to_offset(ts).seconds())).div_euclid(86_400))
}

/// The UTC day whose solar noon falls on local date `date` in `zone`.
pub(crate) fn solar_day(date: Date, lon: f64, zone: &TimeZone) -> Result<i64, AstroError> {
    let want = date.to_days();
    let mut day = want;
    for _ in 0..3 {
        let have = local_day(zone, noon_on(day, lon))?;
        if have == want {
            break;
        }
        day += want - have;
    }
    Ok(day)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DayKind {
    Normal,
    /// The sun stays up all day (midnight sun).
    PolarDay,
    /// The sun stays down all day.
    PolarNight,
}

/// All instants are Unix milliseconds; `None` means the event does not happen that day.
/// Events are grouped around the day's solar noon, so a sunset just after midnight
/// (Reykjavik in June) belongs to the day it ends.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SunDay {
    pub kind: DayKind,
    pub solar_noon: i64,
    /// Sun's altitude at solar noon, degrees (no refraction).
    pub noon_altitude: f64,
    pub sunrise: Option<i64>,
    pub sunset: Option<i64>,
    /// Seconds of daylight; 86 400 in polar day, 0 in polar night.
    pub day_length_s: i64,
    /// Change in day length from the previous day, seconds.
    pub day_length_change_s: i64,
    pub civil_dawn: Option<i64>,
    pub civil_dusk: Option<i64>,
    pub nautical_dawn: Option<i64>,
    pub nautical_dusk: Option<i64>,
    pub astronomical_dawn: Option<i64>,
    pub astronomical_dusk: Option<i64>,
    /// Morning golden hour ends / evening golden hour starts (sun at +6°).
    pub golden_morning_end: Option<i64>,
    pub golden_evening_start: Option<i64>,
    /// Morning blue hour ends and golden hour starts / evening golden hour ends and blue hour starts (sun at −4°).
    pub blue_morning_end: Option<i64>,
    pub blue_evening_start: Option<i64>,
}

fn day_length(day: i64, lat: f64, lon: f64) -> i64 {
    match (
        crossing(day, lat, lon, SUNRISE_ALT, true),
        crossing(day, lat, lon, SUNRISE_ALT, false),
    ) {
        (Crossing::At(r), Crossing::At(s)) => (s - r) / 1000,
        (Crossing::AlwaysAbove, _) | (_, Crossing::AlwaysAbove) => 86_400,
        _ => 0,
    }
}

pub fn sun_day(date: Date, lat: f64, lon: f64, zone_name: &str) -> Result<SunDay, AstroError> {
    check_coords(lat, lon)?;
    let zone = tz::zone(zone_name)?;
    let day = solar_day(date, lon, &zone)?;
    let rise = crossing(day, lat, lon, SUNRISE_ALT, true);
    let kind = match rise {
        Crossing::AlwaysAbove => DayKind::PolarDay,
        Crossing::AlwaysBelow => DayKind::PolarNight,
        Crossing::At(_) => DayKind::Normal,
    };
    let noon = noon_on(day, lon);
    let decl = sun_at(julian_day(noon as f64)).decl_deg;
    let ev = |alt: f64, rising: bool| crossing(day, lat, lon, alt, rising).at();
    let length = day_length(day, lat, lon);
    Ok(SunDay {
        kind,
        solar_noon: noon,
        noon_altitude: 90.0 - (lat - decl).abs(),
        sunrise: rise.at(),
        sunset: ev(SUNRISE_ALT, false),
        day_length_s: length,
        day_length_change_s: length - day_length(day - 1, lat, lon),
        civil_dawn: ev(CIVIL_ALT, true),
        civil_dusk: ev(CIVIL_ALT, false),
        nautical_dawn: ev(NAUTICAL_ALT, true),
        nautical_dusk: ev(NAUTICAL_ALT, false),
        astronomical_dawn: ev(ASTRONOMICAL_ALT, true),
        astronomical_dusk: ev(ASTRONOMICAL_ALT, false),
        golden_morning_end: ev(GOLDEN_HIGH_ALT, true),
        golden_evening_start: ev(GOLDEN_HIGH_ALT, false),
        blue_morning_end: ev(BLUE_HIGH_ALT, true),
        blue_evening_start: ev(BLUE_HIGH_ALT, false),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct SunPosition {
    /// Degrees above the horizon, including atmospheric refraction.
    pub altitude: f64,
    /// Degrees clockwise from north.
    pub azimuth: f64,
}

/// NOAA refraction correction in degrees for a geometric altitude.
fn refraction(alt: f64) -> f64 {
    let te = alt.to_radians().tan();
    let arcsec = if alt > 85.0 {
        0.0
    } else if alt > 5.0 {
        58.1 / te - 0.07 / te.powi(3) + 0.000086 / te.powi(5)
    } else if alt > -0.575 {
        1735.0 + alt * (-518.2 + alt * (103.4 + alt * (-12.79 + alt * 0.711)))
    } else {
        -20.774 / te
    };
    arcsec / 3600.0
}

pub fn sun_position(unix_ms: i64, lat: f64, lon: f64) -> Result<SunPosition, AstroError> {
    check_coords(lat, lon)?;
    let s = sun_at(julian_day(unix_ms as f64));
    let minutes = unix_ms.rem_euclid(DAY_MS) as f64 / 60_000.0;
    let tst = (minutes + s.eqt_min + 4.0 * lon).rem_euclid(1440.0);
    let ha = (tst / 4.0 - 180.0).to_radians();
    let (phi, d) = (lat.to_radians(), s.decl_deg.to_radians());
    let cos_z = (phi.sin() * d.sin() + phi.cos() * d.cos() * ha.cos()).clamp(-1.0, 1.0);
    let zenith = cos_z.acos();
    let alt = 90.0 - zenith.to_degrees();
    let denom = phi.cos() * zenith.sin();
    let azimuth = if denom.abs() < 1e-12 {
        if lat > 0.0 { 180.0 } else { 0.0 }
    } else {
        let a = ((phi.sin() * cos_z - d.sin()) / denom)
            .clamp(-1.0, 1.0)
            .acos()
            .to_degrees();
        if ha > 0.0 {
            (a + 180.0).rem_euclid(360.0)
        } else {
            (540.0 - a).rem_euclid(360.0)
        }
    };
    Ok(SunPosition {
        altitude: alt + refraction(alt),
        azimuth,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// (name, lat, lon, zone, date, sunrise, noon, sunset, civil dawn, civil dusk) from the
    /// independent `astral` Python library; 0 means "does not happen".
    type Ref = (
        &'static str,
        f64,
        f64,
        &'static str,
        (i32, u8, u8),
        i64,
        i64,
        i64,
        i64,
        i64,
    );
    #[rustfmt::skip]
    const REF: &[Ref] = &[
        ("Karachi", 24.8607, 67.0011, "Asia/Karachi", (2026,3,20), 1773970588514, 1773992374000, 1774014171495, 1773969196154, 1774015565417),
        ("Karachi", 24.8607, 67.0011, "Asia/Karachi", (2026,6,21), 1782002609299, 1782027222000, 1782051844274, 1782001033534, 1782053420042),
        ("Karachi", 24.8607, 67.0011, "Asia/Karachi", (2026,11,6), 1793929339341, 1793949333000, 1793969311797, 1793927889644, 1793970761493),
        ("Karachi", 24.8607, 67.0011, "Asia/Karachi", (2026,12,21), 1797819141209, 1797838189000, 1797857256100, 1797817612180, 1797858785136),
        ("London", 51.5074, -0.1278, "Europe/London", (2026,3,20), 1773986619295, 1774008485000, 1774030394100, 1773984585750, 1774032434205),
        ("London", 51.5074, -0.1278, "Europe/London", (2026,6,21), 1782013407642, 1782043333000, 1782073272327, 1782010485016, 1782076194830),
        ("London", 51.5074, -0.1278, "Europe/London", (2026,11,6), 1793948580954, 1793965444000, 1793982269306, 1793946392145, 1793984456269),
        ("London", 51.5074, -0.1278, "Europe/London", (2026,12,21), 1797840246461, 1797854300000, 1797868383666, 1797837779743, 1797870850375),
        ("New York", 40.7128, -74.006, "America/New_York", (2026,3,20), 1774004370627, 1774026216000, 1774048077907, 1774002702726, 1774049749398),
        ("New York", 40.7128, -74.006, "America/New_York", (2026,6,21), 1782033917595, 1782061064000, 1782088229169, 1782031873063, 1782090273606),
        ("New York", 40.7128, -74.006, "America/New_York", (2026,11,6), 1793964750573, 1793983174000, 1794001573630, 1793962992302, 1794003331053),
        ("New York", 40.7128, -74.006, "America/New_York", (2026,12,21), 1797855411027, 1797872031000, 1797888693104, 1797853515289, 1797890588842),
        ("Sydney", -33.8688, 151.2093, "Australia/Sydney", (2026,3,20), 1773950289948, 1773972164000, 1773994003981, 1773948765161, 1773995526213),
        ("Sydney", -33.8688, 151.2093, "Australia/Sydney", (2026,6,21), 1781989211751, 1782007012000, 1782024815611, 1781987516102, 1782026511260),
        ("Sydney", -33.8688, 151.2093, "Australia/Sydney", (2026,11,6), 1793904644038, 1793929123000, 1793953633177, 1793903006418, 1793955275449),
        ("Sydney", -33.8688, 151.2093, "Australia/Sydney", (2026,12,21), 1797792053398, 1797817979000, 1797843911077, 1797790269826, 1797845694799),
        ("Reykjavik", 64.1466, -21.9426, "Atlantic/Reykjavik", (2026,3,20), 1773991739336, 1774013721000, 1774035782069, 1773988823263, 1774038714755),
        ("Reykjavik", 64.1466, -21.9426, "Atlantic/Reykjavik", (2026,6,21), 1782010580562, 1782048569000, 0, 0, 0),
        ("Reykjavik", 64.1466, -21.9426, "Atlantic/Reykjavik", (2026,11,6), 1793957257371, 1793970679000, 1793984044494, 1793953864729, 1793987432964),
        ("Reykjavik", 64.1466, -21.9426, "Atlantic/Reykjavik", (2026,12,21), 1797852191672, 1797859535000, 1797866913082, 1797847337809, 1797871766924),
        ("Quito", -0.1807, -78.4678, "America/Guayaquil", (2026,3,20), 1774005489337, 1774027287000, 1774049059071, 1774004225794, 1774050322607),
        ("Quito", -0.1807, -78.4678, "America/Guayaquil", (2026,6,21), 1782040353681, 1782062135000, 1782083935489, 1782038975589, 1782085313566),
        ("Quito", -0.1807, -78.4678, "America/Guayaquil", (2026,11,6), 1793962437232, 1793984245000, 1794006058033, 1793961121852, 1794007374498),
        ("Quito", -0.1807, -78.4678, "America/Guayaquil", (2026,12,21), 1797851290598, 1797873102000, 1797894956065, 1797849912003, 1797896334667),
        ("Auckland", -36.8485, 174.7633, "Pacific/Auckland", (2026,3,20), 1773944619123, 1773966511000, 1773988367413, 1773943036364, 1773989947193),
        ("Auckland", -36.8485, 174.7633, "Pacific/Auckland", (2026,6,21), 1781984035467, 1782001359000, 1782018684211, 1781982262708, 1782020456969),
        ("Auckland", -36.8485, 174.7633, "Pacific/Auckland", (2026,11,6), 1793898672897, 1793923470000, 1793948302294, 1793896961166, 1793950019474),
        ("Auckland", -36.8485, 174.7633, "Pacific/Auckland", (2026,12,21), 1797785895262, 1797812326000, 1797838759592, 1797784012864, 1797840642186),
        ("Honolulu", 21.3069, -157.8583, "Pacific/Honolulu", (2026,3,20), 1774024522244, 1774046340000, 1774068144557, 1774023166133, 1774069501969),
        ("Honolulu", 21.3069, -157.8583, "Pacific/Honolulu", (2026,6,21), 1782057036133, 1782081188000, 1782105365964, 1782055515669, 1782106886374),
        ("Honolulu", 21.3069, -157.8583, "Pacific/Honolulu", (2026,11,6), 1793983041993, 1794003299000, 1794023547686, 1793981630335, 1794024959510),
        ("Honolulu", 21.3069, -157.8583, "Pacific/Honolulu", (2026,12,21), 1797872688694, 1797892155000, 1797911678552, 1797871204766, 1797913162480),
        ("Tromso", 69.6492, 18.9553, "Europe/Oslo", (2026,3,20), 1773981862661, 1774003905000, 1774026062700, 1773978186944, 1774029767491),
        ("Tromso", 69.6492, 18.9553, "Europe/Oslo", (2026,6,21), 0, 1782038753000, 0, 0, 0),
        ("Tromso", 69.6492, 18.9553, "Europe/Oslo", (2026,11,6), 1793950565975, 1793960864000, 1793971090604, 1793945794936, 1793975855569),
        ("Tromso", 69.6492, 18.9553, "Europe/Oslo", (2026,12,21), 0, 1797849720000, 0, 1797841797556, 1797857669105),
    ];

    const TOL_MS: i64 = 60_000;

    fn within(name: &str, what: &str, got: Option<i64>, want: i64, tol_ms: i64) {
        if want == 0 {
            return;
        }
        let g = got.unwrap_or_else(|| panic!("{name} {what}: missing"));
        assert!(
            (g - want).abs() <= tol_ms,
            "{name} {what}: off by {} s",
            (g - want) / 1000
        );
    }

    fn close(name: &str, what: &str, got: Option<i64>, want: i64) {
        within(name, what, got, want, TOL_MS);
    }

    #[test]
    fn matches_independent_reference_within_a_minute() {
        for &(name, lat, lon, zone, (y, m, d), rise, noon, set, cdawn, cdusk) in REF {
            let s = sun_day(Date::new(y, m, d).unwrap(), lat, lon, zone).unwrap();
            let label = format!("{name} {y}-{m}-{d}");
            // Near the poles the sun crosses the horizon at a shallow angle, so tiny
            // differences between models become minutes.
            let tol = if lat.abs() > 60.0 { 3 * TOL_MS } else { TOL_MS };
            within(&label, "noon", Some(s.solar_noon), noon, TOL_MS);
            within(&label, "sunrise", s.sunrise, rise, tol);
            within(&label, "sunset", s.sunset, set, tol);
            within(&label, "civil dawn", s.civil_dawn, cdawn, tol);
            within(&label, "civil dusk", s.civil_dusk, cdusk, tol);
        }
    }

    /// PyEphem (centre of the sun at −50′, no pressure) agrees to a few seconds.
    #[test]
    fn matches_pyephem_within_15_seconds() {
        let cases = [
            (
                24.8607,
                67.0011,
                "Asia/Karachi",
                (2026, 11, 6),
                1793929330511,
                1793969326152,
            ),
            (
                51.5074,
                -0.1278,
                "Europe/London",
                (2026, 6, 21),
                1782013385888,
                1782073293219,
            ),
            (
                -0.1807,
                -78.4678,
                "America/Guayaquil",
                (2026, 3, 20),
                1774005479532,
                1774049069365,
            ),
            (
                64.1466,
                -21.9426,
                "Atlantic/Reykjavik",
                (2026, 12, 21),
                1797852141523,
                1797866961818,
            ),
        ];
        for (lat, lon, zone, (y, m, d), rise, set) in cases {
            let s = sun_day(Date::new(y, m, d).unwrap(), lat, lon, zone).unwrap();
            within(zone, "sunrise", s.sunrise, rise, 15_000);
            within(zone, "sunset", s.sunset, set, 15_000);
        }
        let k = sun_day(
            Date::new(2026, 11, 6).unwrap(),
            24.8607,
            67.0011,
            "Asia/Karachi",
        )
        .unwrap();
        within("Karachi", "civil dawn", k.civil_dawn, 1793927908082, 15_000);
    }

    #[test]
    fn photographer_and_twilight_times() {
        let s = sun_day(
            Date::new(2026, 11, 6).unwrap(),
            24.8607,
            67.0011,
            "Asia/Karachi",
        )
        .unwrap();
        // astral time_at_elevation references
        close("khi", "astro dawn", s.astronomical_dawn, 1793924650180);
        close("khi", "astro dusk", s.astronomical_dusk, 1793974000795);
        close("khi", "golden end", s.golden_morning_end, 1793931199786);
        close("khi", "golden start", s.golden_evening_start, 1793967451316);
        close("khi", "blue end", s.blue_morning_end, 1793928430579);
        close("khi", "blue start", s.blue_evening_start, 1793970220562);
        let order = [
            s.astronomical_dawn,
            s.nautical_dawn,
            s.civil_dawn,
            s.blue_morning_end,
            s.sunrise,
            s.golden_morning_end,
            Some(s.solar_noon),
            s.golden_evening_start,
            s.sunset,
            s.blue_evening_start,
            s.civil_dusk,
            s.nautical_dusk,
            s.astronomical_dusk,
        ];
        let times: Vec<i64> = order.iter().map(|t| t.unwrap()).collect();
        assert!(times.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn polar_day_and_night() {
        let june = sun_day(
            Date::new(2026, 6, 21).unwrap(),
            69.6492,
            18.9553,
            "Europe/Oslo",
        )
        .unwrap();
        assert_eq!(june.kind, DayKind::PolarDay);
        assert_eq!(
            (june.sunrise, june.sunset, june.day_length_s),
            (None, None, 86_400)
        );
        let dec = sun_day(
            Date::new(2026, 12, 21).unwrap(),
            69.6492,
            18.9553,
            "Europe/Oslo",
        )
        .unwrap();
        assert_eq!(dec.kind, DayKind::PolarNight);
        assert_eq!((dec.sunrise, dec.day_length_s), (None, 0));
        assert!(dec.civil_dawn.is_some());
        let pole = sun_day(Date::new(2026, 6, 21).unwrap(), 90.0, 0.0, "UTC").unwrap();
        assert_eq!(pole.kind, DayKind::PolarDay);
    }

    #[test]
    fn late_sunset_belongs_to_its_day() {
        // Reykjavik, 21 June: sunset is just after local midnight, after the day's sunrise.
        let s = sun_day(
            Date::new(2026, 6, 21).unwrap(),
            64.1466,
            -21.9426,
            "Atlantic/Reykjavik",
        )
        .unwrap();
        let (rise, set) = (s.sunrise.unwrap(), s.sunset.unwrap());
        assert!(set > rise);
        assert!(s.day_length_s > 20 * 3600);
        assert!(s.civil_dawn.is_none());
    }

    #[test]
    fn date_line_zones_get_their_own_local_day() {
        // Kiritimati is UTC+14: its solar noon must land on the requested local date.
        let date = Date::new(2026, 11, 6).unwrap();
        let s = sun_day(date, 1.87, -157.4, "Pacific/Kiritimati").unwrap();
        let zone = tz::zone("Pacific/Kiritimati").unwrap();
        assert_eq!(local_day(&zone, s.solar_noon).unwrap(), date.to_days());
        let t = sun_day(date, -21.13, -175.2, "Pacific/Tongatapu").unwrap();
        let zone = tz::zone("Pacific/Tongatapu").unwrap();
        assert_eq!(local_day(&zone, t.solar_noon).unwrap(), date.to_days());
    }

    #[test]
    fn day_length_trend() {
        let june = sun_day(
            Date::new(2026, 6, 1).unwrap(),
            51.5074,
            -0.1278,
            "Europe/London",
        )
        .unwrap();
        assert!(june.day_length_change_s > 0);
        let oct = sun_day(
            Date::new(2026, 10, 1).unwrap(),
            51.5074,
            -0.1278,
            "Europe/London",
        )
        .unwrap();
        assert!(oct.day_length_change_s < -150);
        let eq = sun_day(
            Date::new(2026, 3, 20).unwrap(),
            -0.1807,
            -78.4678,
            "America/Guayaquil",
        )
        .unwrap();
        assert!((eq.day_length_s - 12 * 3600).abs() < 600);
    }

    #[test]
    fn position_matches_reference() {
        // astral elevation/azimuth (with refraction)
        let p = sun_position(1793944800000, 24.8607, 67.0011).unwrap();
        assert!((p.altitude - 45.2044).abs() < 0.1, "{p:?}");
        assert!((p.azimuth - 153.7937).abs() < 0.1, "{p:?}");
        let q = sun_position(1782064800000, 51.5074, -0.1278).unwrap();
        assert!((q.altitude - 18.5456).abs() < 0.1, "{q:?}");
        assert!((q.azimuth - 284.6643).abs() < 0.1, "{q:?}");
    }

    #[test]
    fn position_at_sunrise_is_on_the_horizon() {
        let s = sun_day(
            Date::new(2026, 11, 6).unwrap(),
            51.5074,
            -0.1278,
            "Europe/London",
        )
        .unwrap();
        let p = sun_position(s.sunrise.unwrap(), 51.5074, -0.1278).unwrap();
        // Geometric altitude is −0.833°; the position adds NOAA's refraction for that altitude.
        let want = SUNRISE_ALT + refraction(SUNRISE_ALT);
        assert!((p.altitude - want).abs() < 0.05, "{p:?} vs {want}");
        assert!(p.azimuth > 90.0 && p.azimuth < 135.0);
    }

    #[test]
    fn rejects_bad_input() {
        let d = Date::new(2026, 1, 1).unwrap();
        assert_eq!(sun_day(d, 95.0, 0.0, "UTC"), Err(AstroError::Coordinates));
        assert!(matches!(
            sun_day(d, 0.0, 0.0, "Mars/Base"),
            Err(AstroError::Tz(_))
        ));
        assert_eq!(sun_position(0, 0.0, 200.0), Err(AstroError::Coordinates));
    }
}
