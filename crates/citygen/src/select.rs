//! Which places get a page: pinned existing URLs, every capital, a minimum per country,
//! then the largest remaining cities until the target is reached.

use crate::parse::Place;
use std::collections::{HashMap, HashSet};
use time_core::city::City;

/// Feature codes that are not real, current populated places.
const EXCLUDED: &[&str] = &["PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH", "PPLF", "PPLR"];
const PIN_RADIUS_KM: f64 = 50.0;

pub fn eligible(p: &Place) -> bool {
    !EXCLUDED.contains(&p.feature.as_str())
        && (p.population > 0 || p.feature == "PPLC")
        && time_core::tz::is_known_zone(&p.zone)
}

fn km(a: (f64, f64), b: (f64, f64)) -> f64 {
    let (la1, lo1, la2, lo2) = (
        a.0.to_radians(),
        a.1.to_radians(),
        b.0.to_radians(),
        b.1.to_radians(),
    );
    let h = ((la2 - la1) / 2.0).sin().powi(2)
        + la1.cos() * la2.cos() * ((lo2 - lo1) / 2.0).sin().powi(2);
    2.0 * 6371.0 * h.sqrt().asin()
}

/// The place an existing URL refers to: same country, within 50 km, preferring a name match
/// (so Islamabad is not swapped for the larger Rawalpindi next door), then the largest.
pub fn find_pin(places: &[Place], pin: &City) -> Option<usize> {
    let near: Vec<usize> = (0..places.len())
        .filter(|&i| {
            let p = &places[i];
            p.cc == pin.country_code
                && eligible(p)
                && km((p.lat, p.lon), (pin.lat, pin.lon)) <= PIN_RADIUS_KM
        })
        .collect();
    let named: Vec<usize> = near
        .iter()
        .copied()
        .filter(|&i| {
            let s = crate::slug::slugify(&places[i].ascii);
            s == pin.slug || s.starts_with(&format!("{}-", pin.slug))
        })
        .collect();
    let pool = if named.is_empty() { &near } else { &named };
    pool.iter()
        .copied()
        .max_by_key(|&i| (places[i].population, std::cmp::Reverse(places[i].id)))
}

pub struct Selection {
    /// (index into places, pinned slug if any)
    pub chosen: Vec<(usize, Option<&'static str>)>,
    pub missing_pins: Vec<&'static str>,
}

/// Same name in the same country and region: only the largest gets a page (no near-duplicates).
fn name_key(p: &Place) -> (String, String, String) {
    (
        p.cc.clone(),
        p.admin1.clone(),
        crate::slug::slugify(&p.ascii),
    )
}

pub fn select(places: &[Place], pins: &[City], target: usize, per_country: usize) -> Selection {
    let mut chosen: Vec<(usize, Option<&'static str>)> = Vec::new();
    let mut seen: HashSet<usize> = HashSet::new();
    let mut names: HashSet<(String, String, String)> = HashSet::new();
    let mut missing_pins = Vec::new();
    for pin in pins {
        match find_pin(places, pin) {
            Some(i) if seen.insert(i) => {
                names.insert(name_key(&places[i]));
                chosen.push((i, Some(pin.slug)));
            }
            Some(_) | None => missing_pins.push(pin.slug),
        }
    }
    // Largest first (ties by id, for stable output); drop smaller same-name places in a region.
    let mut take =
        |i: usize, seen: &mut HashSet<usize>| seen.insert(i) && names.insert(name_key(&places[i]));

    let mut order: Vec<usize> = (0..places.len())
        .filter(|&i| eligible(&places[i]))
        .collect();
    order.sort_by_key(|&i| (std::cmp::Reverse(places[i].population), places[i].id));

    for &i in &order {
        if places[i].feature == "PPLC" && take(i, &mut seen) {
            chosen.push((i, None));
        }
    }
    let mut per: HashMap<&str, usize> = HashMap::new();
    for &(i, _) in &chosen {
        *per.entry(places[i].cc.as_str()).or_default() += 1;
    }
    for &i in &order {
        let n = per.entry(places[i].cc.as_str()).or_default();
        if *n < per_country && take(i, &mut seen) {
            *n += 1;
            chosen.push((i, None));
        }
    }
    for &i in &order {
        if chosen.len() >= target {
            break;
        }
        if take(i, &mut seen) {
            chosen.push((i, None));
        }
    }
    Selection {
        chosen,
        missing_pins,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::{cities, fixture::line};

    fn sample() -> Vec<Place> {
        cities(
            &[
                line(
                    1,
                    "Islamabad",
                    "Islamabad",
                    33.72,
                    73.04,
                    "PPLC",
                    "PK",
                    "08",
                    1_014_825,
                    "Asia/Karachi",
                ),
                line(
                    2,
                    "Rawalpindi",
                    "Rawalpindi",
                    33.60,
                    73.04,
                    "PPLA2",
                    "PK",
                    "04",
                    1_743_101,
                    "Asia/Karachi",
                ),
                line(
                    3,
                    "Karachi",
                    "Karachi",
                    24.86,
                    67.01,
                    "PPLA",
                    "PK",
                    "05",
                    11_624_219,
                    "Asia/Karachi",
                ),
                line(
                    4,
                    "Old Town",
                    "Old Town",
                    24.87,
                    67.02,
                    "PPLX",
                    "PK",
                    "05",
                    9_000_000,
                    "Asia/Karachi",
                ),
                line(
                    5,
                    "Ghost",
                    "Ghost",
                    10.0,
                    10.0,
                    "PPL",
                    "NG",
                    "01",
                    50_000,
                    "Mars/Olympus",
                ),
                line(
                    6,
                    "Vaduz",
                    "Vaduz",
                    47.14,
                    9.52,
                    "PPLC",
                    "LI",
                    "11",
                    5_197,
                    "Europe/Vaduz",
                ),
                line(
                    7,
                    "Schaan",
                    "Schaan",
                    47.16,
                    9.51,
                    "PPL",
                    "LI",
                    "07",
                    5_800,
                    "Europe/Vaduz",
                ),
                line(
                    8,
                    "Tokyo",
                    "Tokyo",
                    35.69,
                    139.69,
                    "PPLC",
                    "JP",
                    "40",
                    8_336_599,
                    "Asia/Tokyo",
                ),
                line(
                    9,
                    "Yokohama",
                    "Yokohama",
                    35.44,
                    139.64,
                    "PPLA",
                    "JP",
                    "19",
                    3_574_443,
                    "Asia/Tokyo",
                ),
                line(
                    10,
                    "Osaka",
                    "Osaka",
                    34.69,
                    135.50,
                    "PPLA",
                    "JP",
                    "32",
                    2_592_413,
                    "Asia/Tokyo",
                ),
            ]
            .join("\n"),
        )
    }

    #[test]
    fn excludes_sections_and_unknown_zones() {
        let p = sample();
        assert!(!eligible(&p[3]), "PPLX section");
        assert!(!eligible(&p[4]), "unknown zone");
        assert!(eligible(&p[0]));
    }

    #[test]
    fn pin_prefers_name_match_over_bigger_neighbour() {
        let p = sample();
        let pin = time_core::city::find_city("islamabad").expect("pin exists");
        assert_eq!(
            find_pin(&p, pin).map(|i| p[i].name.as_str()),
            Some("Islamabad")
        );
    }

    #[test]
    fn capitals_and_country_minimum_beat_raw_size() {
        let p = sample();
        // Target 5 with 1 per country: Tokyo, Islamabad, Vaduz (capitals), Karachi... then by size.
        let s = select(&p, &[], 5, 1);
        let names: Vec<&str> = s.chosen.iter().map(|&(i, _)| p[i].name.as_str()).collect();
        assert!(names.contains(&"Vaduz"), "small capital kept: {names:?}");
        assert!(names.contains(&"Islamabad"));
        assert!(!names.contains(&"Old Town") && !names.contains(&"Ghost"));
        assert_eq!(names.len(), 5);
        assert_eq!(names[..3], ["Tokyo", "Islamabad", "Vaduz"]);
    }

    #[test]
    fn same_name_same_region_keeps_only_the_larger() {
        let p = cities(
            &[
                line(
                    1,
                    "Sahiwal",
                    "Sahiwal",
                    30.66,
                    73.10,
                    "PPLA2",
                    "PK",
                    "04",
                    389_605,
                    "Asia/Karachi",
                ),
                line(
                    2,
                    "Sahiwal",
                    "Sahiwal",
                    31.97,
                    72.33,
                    "PPL",
                    "PK",
                    "04",
                    30_000,
                    "Asia/Karachi",
                ),
                line(
                    3,
                    "Sahiwal",
                    "Sahiwal",
                    25.00,
                    68.00,
                    "PPL",
                    "PK",
                    "05",
                    20_000,
                    "Asia/Karachi",
                ),
            ]
            .join("\n"),
        );
        let s = select(&p, &[], 10, 0);
        let ids: Vec<u32> = s.chosen.iter().map(|&(i, _)| p[i].id).collect();
        assert_eq!(
            ids,
            vec![1, 3],
            "keeps the bigger Punjab one and the Sindh one"
        );
    }

    #[test]
    fn pins_come_first_and_missing_pins_are_reported() {
        let p = sample();
        let pins: Vec<City> = ["karachi", "london"]
            .iter()
            .filter_map(|s| time_core::city::find_city(s).cloned())
            .collect();
        let s = select(&p, &pins, 3, 0);
        assert_eq!(s.chosen[0], (2, Some("karachi")));
        assert_eq!(s.missing_pins, vec!["london"]);
    }
}
