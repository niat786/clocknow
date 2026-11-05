//! Parsers for the GeoNames dump files. Malformed lines are skipped, never fatal.

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct Place {
    pub id: u32,
    pub name: String,
    pub ascii: String,
    pub lat: f64,
    pub lon: f64,
    pub feature: String,
    pub cc: String,
    pub admin1: String,
    pub population: u64,
    pub zone: String,
}

/// `cities15000.txt`: tab-separated, 19 columns.
pub fn cities(text: &str) -> Vec<Place> {
    text.lines()
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            if c.len() < 18 || c.get(6) != Some(&"P") {
                return None;
            }
            Some(Place {
                id: c[0].parse().ok()?,
                name: c[1].trim().to_owned(),
                ascii: c[2].trim().to_owned(),
                lat: c[4].parse().ok()?,
                lon: c[5].parse().ok()?,
                feature: c[7].to_owned(),
                cc: c[8].to_owned(),
                admin1: c[10].to_owned(),
                population: c[14].parse().unwrap_or(0),
                zone: c[17].trim().to_owned(),
            })
            .filter(|p| !p.name.is_empty() && !p.cc.is_empty() && !p.zone.is_empty())
        })
        .collect()
}

/// `admin1CodesASCII.txt`: `CC.CODE<TAB>name<TAB>asciiname<TAB>geonameid` -> (name, ascii).
pub fn admin1(text: &str) -> HashMap<String, (String, String)> {
    text.lines()
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            (c.len() >= 3).then(|| (c[0].to_owned(), (c[1].to_owned(), c[2].to_owned())))
        })
        .collect()
}

/// `countryInfo.txt`: comment lines start with `#`; column 0 is ISO code, column 4 the name.
pub fn countries(text: &str) -> HashMap<String, String> {
    text.lines()
        .filter(|l| !l.starts_with('#'))
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            (c.len() >= 5 && c[0].len() == 2).then(|| (c[0].to_owned(), c[4].to_owned()))
        })
        .collect()
}

#[cfg(test)]
pub mod fixture {
    /// One line in cities15000 format.
    #[allow(clippy::too_many_arguments)]
    pub fn line(
        id: u32,
        name: &str,
        ascii: &str,
        lat: f64,
        lon: f64,
        code: &str,
        cc: &str,
        adm1: &str,
        pop: u64,
        zone: &str,
    ) -> String {
        format!(
            "{id}\t{name}\t{ascii}\t\t{lat}\t{lon}\tP\t{code}\t{cc}\t\t{adm1}\t\t\t\t{pop}\t\t10\t{zone}\t2026-01-01"
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_city_lines_and_skips_junk() {
        let text = [
            fixture::line(
                1174872,
                "Karachi",
                "Karachi",
                24.8608,
                67.0104,
                "PPLA",
                "PK",
                "05",
                11_624_219,
                "Asia/Karachi",
            ),
            "garbage line".to_owned(),
            "1\tX\tX\t\tnot-a-number\t0\tP\tPPL\tPK\t\t05\t\t\t\t1\t\t1\tAsia/Karachi\t2026"
                .to_owned(),
        ]
        .join("\n");
        let p = cities(&text);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].name, "Karachi");
        assert_eq!(p[0].population, 11_624_219);
        assert_eq!(p[0].zone, "Asia/Karachi");
    }

    #[test]
    fn parses_admin1_and_countries() {
        let a = admin1("PK.05\tSindh\tSindh\t1164807\nbad");
        assert_eq!(
            a.get("PK.05"),
            Some(&("Sindh".to_owned(), "Sindh".to_owned()))
        );
        let c = countries("#ISO\tISO3\n PK\nPK\tPAK\t586\tPK\tPakistan\tIslamabad\n");
        assert_eq!(c.get("PK").map(String::as_str), Some("Pakistan"));
        assert_eq!(c.len(), 1);
    }
}
