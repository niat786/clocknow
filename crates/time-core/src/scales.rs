//! Offsets between UTC and atomic time scales, in whole seconds.
//! Unchanged since the last leap second (2016-12-31); continuous UTC from 2027-05-20
//! (CGPM 2026, Resolution 5) means no further leap seconds are planned.

/// TAI − UTC.
pub const TAI_MINUS_UTC_S: i32 = 37;
/// GPS − UTC (GPS time = TAI − 19 s).
pub const GPS_MINUS_UTC_S: i32 = TAI_MINUS_UTC_S - 19;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gps_is_tai_minus_19() {
        assert_eq!(GPS_MINUS_UTC_S, 18);
    }
}
