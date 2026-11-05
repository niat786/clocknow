//! Seed list of cities for `/time/[city]` pages. Coordinates are approximate (city centre).

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct City {
    pub slug: &'static str,
    pub name: &'static str,
    pub country: &'static str,
    /// ISO 3166-1 alpha-2.
    pub country_code: &'static str,
    pub zone: &'static str,
    pub lat: f64,
    pub lon: f64,
}

const fn c(
    slug: &'static str,
    name: &'static str,
    country: &'static str,
    country_code: &'static str,
    zone: &'static str,
    lat: f64,
    lon: f64,
) -> City {
    City {
        slug,
        name,
        country,
        country_code,
        zone,
        lat,
        lon,
    }
}

pub const CITIES: &[City] = &[
    c(
        "karachi",
        "Karachi",
        "Pakistan",
        "PK",
        "Asia/Karachi",
        24.86,
        67.01,
    ),
    c(
        "lahore",
        "Lahore",
        "Pakistan",
        "PK",
        "Asia/Karachi",
        31.55,
        74.34,
    ),
    c(
        "islamabad",
        "Islamabad",
        "Pakistan",
        "PK",
        "Asia/Karachi",
        33.68,
        73.05,
    ),
    c(
        "dubai",
        "Dubai",
        "United Arab Emirates",
        "AE",
        "Asia/Dubai",
        25.20,
        55.27,
    ),
    c(
        "riyadh",
        "Riyadh",
        "Saudi Arabia",
        "SA",
        "Asia/Riyadh",
        24.71,
        46.68,
    ),
    c(
        "tehran",
        "Tehran",
        "Iran",
        "IR",
        "Asia/Tehran",
        35.69,
        51.39,
    ),
    c(
        "istanbul",
        "Istanbul",
        "Türkiye",
        "TR",
        "Europe/Istanbul",
        41.01,
        28.98,
    ),
    c(
        "moscow",
        "Moscow",
        "Russia",
        "RU",
        "Europe/Moscow",
        55.76,
        37.62,
    ),
    c(
        "london",
        "London",
        "United Kingdom",
        "GB",
        "Europe/London",
        51.51,
        -0.13,
    ),
    c(
        "paris",
        "Paris",
        "France",
        "FR",
        "Europe/Paris",
        48.86,
        2.35,
    ),
    c(
        "berlin",
        "Berlin",
        "Germany",
        "DE",
        "Europe/Berlin",
        52.52,
        13.40,
    ),
    c(
        "cairo",
        "Cairo",
        "Egypt",
        "EG",
        "Africa/Cairo",
        30.04,
        31.24,
    ),
    c(
        "lagos",
        "Lagos",
        "Nigeria",
        "NG",
        "Africa/Lagos",
        6.52,
        3.38,
    ),
    c(
        "johannesburg",
        "Johannesburg",
        "South Africa",
        "ZA",
        "Africa/Johannesburg",
        -26.20,
        28.05,
    ),
    c(
        "new-york",
        "New York",
        "United States",
        "US",
        "America/New_York",
        40.71,
        -74.01,
    ),
    c(
        "chicago",
        "Chicago",
        "United States",
        "US",
        "America/Chicago",
        41.88,
        -87.63,
    ),
    c(
        "los-angeles",
        "Los Angeles",
        "United States",
        "US",
        "America/Los_Angeles",
        34.05,
        -118.24,
    ),
    c(
        "toronto",
        "Toronto",
        "Canada",
        "CA",
        "America/Toronto",
        43.65,
        -79.38,
    ),
    c(
        "mexico-city",
        "Mexico City",
        "Mexico",
        "MX",
        "America/Mexico_City",
        19.43,
        -99.13,
    ),
    c(
        "sao-paulo",
        "São Paulo",
        "Brazil",
        "BR",
        "America/Sao_Paulo",
        -23.55,
        -46.63,
    ),
    c(
        "mumbai",
        "Mumbai",
        "India",
        "IN",
        "Asia/Kolkata",
        19.08,
        72.88,
    ),
    c(
        "delhi",
        "Delhi",
        "India",
        "IN",
        "Asia/Kolkata",
        28.61,
        77.21,
    ),
    c(
        "dhaka",
        "Dhaka",
        "Bangladesh",
        "BD",
        "Asia/Dhaka",
        23.81,
        90.41,
    ),
    c(
        "kathmandu",
        "Kathmandu",
        "Nepal",
        "NP",
        "Asia/Kathmandu",
        27.72,
        85.32,
    ),
    c(
        "singapore",
        "Singapore",
        "Singapore",
        "SG",
        "Asia/Singapore",
        1.35,
        103.82,
    ),
    c(
        "jakarta",
        "Jakarta",
        "Indonesia",
        "ID",
        "Asia/Jakarta",
        -6.21,
        106.85,
    ),
    c(
        "hong-kong",
        "Hong Kong",
        "Hong Kong",
        "HK",
        "Asia/Hong_Kong",
        22.32,
        114.17,
    ),
    c(
        "shanghai",
        "Shanghai",
        "China",
        "CN",
        "Asia/Shanghai",
        31.23,
        121.47,
    ),
    c(
        "seoul",
        "Seoul",
        "South Korea",
        "KR",
        "Asia/Seoul",
        37.57,
        126.98,
    ),
    c("tokyo", "Tokyo", "Japan", "JP", "Asia/Tokyo", 35.68, 139.69),
    c(
        "sydney",
        "Sydney",
        "Australia",
        "AU",
        "Australia/Sydney",
        -33.87,
        151.21,
    ),
];

pub fn find_city(slug: &str) -> Option<&'static City> {
    CITIES.iter().find(|c| c.slug == slug)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_city_zone_resolves() {
        for c in CITIES {
            assert!(crate::tz::is_known_zone(c.zone), "{} -> {}", c.slug, c.zone);
        }
    }

    #[test]
    fn slugs_are_unique_and_url_safe() {
        let mut seen = HashSet::new();
        for c in CITIES {
            assert!(seen.insert(c.slug), "duplicate {}", c.slug);
            assert!(
                c.slug
                    .chars()
                    .all(|ch| ch.is_ascii_lowercase() || ch == '-')
            );
        }
    }

    #[test]
    fn finds_by_slug() {
        assert_eq!(find_city("karachi").map(|c| c.zone), Some("Asia/Karachi"));
        assert!(find_city("atlantis").is_none());
    }
}
