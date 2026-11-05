//! Astronomy for everyday use: sun times, sun position, moon phases, seasons and prayer times.
//! Algorithms: NOAA solar calculator (after Meeus) for the sun, Meeus ch. 47 (main terms) for the
//! moon's longitude, Meeus ch. 27 for equinoxes and solstices. Accuracy is about a minute for
//! sun events and phases between 1900 and 2100; refraction near the horizon varies more than that.

pub mod moon;
pub mod prayer;
pub mod seasons;
pub mod sun;

use crate::convert::ConvertError;
use crate::tz::TzError;
use std::fmt;

pub(crate) const DAY_MS: i64 = 86_400_000;

#[derive(Debug, Clone, PartialEq)]
pub enum AstroError {
    Coordinates,
    Tz(TzError),
    Convert(ConvertError),
}

impl fmt::Display for AstroError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Coordinates => f.write_str("latitude must be -90..90 and longitude -180..180"),
            Self::Tz(e) => e.fmt(f),
            Self::Convert(e) => e.fmt(f),
        }
    }
}

impl std::error::Error for AstroError {}

impl From<TzError> for AstroError {
    fn from(e: TzError) -> Self {
        Self::Tz(e)
    }
}

impl From<ConvertError> for AstroError {
    fn from(e: ConvertError) -> Self {
        Self::Convert(e)
    }
}

pub(crate) fn check_coords(lat: f64, lon: f64) -> Result<(), AstroError> {
    if lat.is_finite()
        && lon.is_finite()
        && (-90.0..=90.0).contains(&lat)
        && (-180.0..=180.0).contains(&lon)
    {
        Ok(())
    } else {
        Err(AstroError::Coordinates)
    }
}

/// Julian day (UT) of a Unix millisecond instant.
pub(crate) fn julian_day(unix_ms: f64) -> f64 {
    unix_ms / DAY_MS as f64 + 2_440_587.5
}

pub(crate) fn unix_ms_from_jd(jd: f64) -> i64 {
    ((jd - 2_440_587.5) * DAY_MS as f64).round() as i64
}

pub(crate) fn norm360(deg: f64) -> f64 {
    deg.rem_euclid(360.0)
}

/// Wraps to (-180, 180].
pub(crate) fn wrap180(deg: f64) -> f64 {
    let d = norm360(deg);
    if d > 180.0 { d - 360.0 } else { d }
}

/// TT − UT in seconds (Espenak & Meeus polynomials). Good to a few seconds 1961-2050,
/// tens of seconds outside; it only shifts moon phases and seasons by that much.
pub fn delta_t_seconds(year: f64) -> f64 {
    if year < 1961.0 {
        let u = (year - 1820.0) / 100.0;
        -20.0 + 32.0 * u * u
    } else if year < 1986.0 {
        let t = year - 1975.0;
        45.45 + 1.067 * t - t * t / 260.0 - t * t * t / 718.0
    } else if year < 2005.0 {
        let t = year - 2000.0;
        63.86 + 0.3345 * t - 0.060374 * t.powi(2)
            + 0.0017275 * t.powi(3)
            + 0.000651814 * t.powi(4)
            + 0.00002373599 * t.powi(5)
    } else if year < 2050.0 {
        let t = year - 2000.0;
        62.92 + 0.32217 * t + 0.005589 * t * t
    } else if year < 2150.0 {
        let u = (year - 1820.0) / 100.0;
        -20.0 + 32.0 * u * u - 0.5628 * (2150.0 - year)
    } else {
        let u = (year - 1820.0) / 100.0;
        -20.0 + 32.0 * u * u
    }
}

/// Approximate decimal year of an instant, for ΔT only.
pub(crate) fn decimal_year(unix_ms: f64) -> f64 {
    1970.0 + unix_ms / (365.2425 * DAY_MS as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helpers() {
        assert_eq!(julian_day(0.0), 2_440_587.5);
        assert_eq!(unix_ms_from_jd(2_451_545.0), 946_728_000_000);
        assert_eq!(wrap180(270.0), -90.0);
        assert_eq!(wrap180(-190.0), 170.0);
        assert_eq!(norm360(-1.0), 359.0);
        assert!(check_coords(91.0, 0.0).is_err());
        assert!(check_coords(0.0, f64::NAN).is_err());
        assert!(check_coords(-90.0, 180.0).is_ok());
    }

    #[test]
    fn delta_t_is_plausible() {
        assert!((delta_t_seconds(2000.0) - 63.86).abs() < 0.1);
        let now = delta_t_seconds(2026.0);
        assert!((65.0..80.0).contains(&now), "{now}");
        assert!((delta_t_seconds(2049.99) - delta_t_seconds(2050.0)).abs() < 2.0);
        assert!((delta_t_seconds(1985.99) - delta_t_seconds(1986.0)).abs() < 1.0);
    }
}
