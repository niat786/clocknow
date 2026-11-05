//! citygen: GeoNames dumps -> the city data used to build /time/* pages.
//! Build-time only. Never shipped to browsers.

pub mod parse;
pub mod select;
pub mod slug;

use serde::Serialize;
use std::collections::BTreeMap;
use time_core::tz;

#[derive(Debug, Serialize)]
pub struct CityOut {
    pub slug: String,
    pub name: String,
    pub ascii: String,
    pub country_code: String,
    pub admin1: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub population: u64,
    pub zone: String,
    pub capital: bool,
}

#[derive(Debug, Serialize)]
pub struct Change {
    pub at: i64,
    pub before: i32,
    pub after: i32,
    pub abbr: String,
}

#[derive(Debug, Serialize)]
pub struct ZoneYear {
    /// UTC offset (seconds) and abbreviation at local midnight on 1 January.
    pub start_offset: i32,
    pub start_abbr: String,
    pub changes: Vec<Change>,
}

#[derive(Debug, Serialize)]
pub struct Output {
    pub source: &'static str,
    pub tzdata: Option<&'static str>,
    pub first_year: i16,
    pub countries: BTreeMap<String, String>,
    pub zones: BTreeMap<String, BTreeMap<i16, ZoneYear>>,
    pub cities: Vec<CityOut>,
}

pub struct Inputs<'a> {
    pub cities: &'a str,
    pub admin1: &'a str,
    pub countries: &'a str,
}

pub struct Options {
    pub target: usize,
    pub per_country: usize,
    pub first_year: i16,
    pub years: i16,
}

fn zone_year(zone: &str, year: i16) -> Result<ZoneYear, String> {
    let jan1 = tz::wall_to_unix_ms(year, 1, 1, 0, 0, 0, zone).map_err(|e| e.to_string())?;
    let start = tz::zone_time(jan1, zone).map_err(|e| e.to_string())?;
    let changes = tz::clock_changes(zone, year)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|t| Change {
            at: t.at_unix_ms,
            before: t.offset_before_seconds,
            after: t.offset_after_seconds,
            abbr: t.abbreviation_after,
        })
        .collect();
    Ok(ZoneYear {
        start_offset: start.offset_seconds,
        start_abbr: start.abbreviation,
        changes,
    })
}

/// The whole pipeline. Fails (rather than writing thin pages) when required data is missing.
pub fn build(input: &Inputs, opts: &Options) -> Result<(Output, Vec<String>), String> {
    let places = parse::cities(input.cities);
    let admin1 = parse::admin1(input.admin1);
    let country_names = parse::countries(input.countries);
    let sel = select::select(
        &places,
        time_core::city::CITIES,
        opts.target,
        opts.per_country,
    );
    let mut notes = Vec::new();
    if !sel.missing_pins.is_empty() {
        return Err(format!(
            "existing city URLs not found in GeoNames data: {:?}",
            sel.missing_pins
        ));
    }

    let rows: Vec<_> = sel
        .chosen
        .iter()
        .map(|&(i, pin)| (&places[i], pin))
        .collect();
    let mut no_country: Vec<String> = Vec::new();
    let inputs: Vec<slug::SlugInput> = rows
        .iter()
        .map(|(p, pin)| {
            let adm = admin1
                .get(&format!("{}.{}", p.cc, p.admin1))
                .map(|(_, a)| a.as_str())
                .unwrap_or("");
            let country = country_names
                .get(&p.cc)
                .map(String::as_str)
                .unwrap_or_else(|| {
                    no_country.push(p.cc.clone());
                    ""
                });
            slug::SlugInput {
                id: p.id,
                ascii: &p.ascii,
                admin1_ascii: adm,
                cc: &p.cc,
                country,
                pinned: *pin,
            }
        })
        .collect();
    if !no_country.is_empty() {
        no_country.sort();
        no_country.dedup();
        return Err(format!(
            "country codes missing from countryInfo.txt: {no_country:?}"
        ));
    }
    let slugs = slug::assign(&inputs);

    let mut cities: Vec<CityOut> = rows
        .iter()
        .zip(slugs)
        .map(|((p, _), slug)| CityOut {
            slug,
            name: p.name.clone(),
            ascii: p.ascii.clone(),
            country_code: p.cc.clone(),
            admin1: admin1
                .get(&format!("{}.{}", p.cc, p.admin1))
                .map(|(n, _)| n.clone())
                .filter(|n| !n.is_empty()),
            lat: (p.lat * 1e4).round() / 1e4,
            lon: (p.lon * 1e4).round() / 1e4,
            population: p.population,
            zone: p.zone.clone(),
            capital: p.feature == "PPLC",
        })
        .collect();
    cities.sort_by(|a, b| a.slug.cmp(&b.slug));

    let mut zones: BTreeMap<String, BTreeMap<i16, ZoneYear>> = BTreeMap::new();
    for c in &cities {
        if zones.contains_key(&c.zone) {
            continue;
        }
        let mut years = BTreeMap::new();
        for y in opts.first_year..opts.first_year + opts.years {
            years.insert(y, zone_year(&c.zone, y)?);
        }
        zones.insert(c.zone.clone(), years);
    }
    let countries: BTreeMap<String, String> = cities
        .iter()
        .filter_map(|c| {
            country_names
                .get(&c.country_code)
                .map(|n| (c.country_code.clone(), n.clone()))
        })
        .collect();
    notes.push(format!(
        "{} places read, {} chosen, {} countries, {} zones",
        places.len(),
        cities.len(),
        countries.len(),
        zones.len()
    ));
    Ok((
        Output {
            source: "GeoNames cities15000 (geonames.org), CC BY 4.0",
            tzdata: tz::tzdata_version(),
            first_year: opts.first_year,
            countries,
            zones,
            cities,
        },
        notes,
    ))
}

/// JSON with one city per line, so regenerated files give readable git diffs.
pub fn to_json(out: &Output) -> Result<String, String> {
    let e = |e: serde_json::Error| e.to_string();
    let mut s = String::from("{\n");
    s += &format!(
        "\"source\": {},\n",
        serde_json::to_string(&out.source).map_err(e)?
    );
    s += &format!(
        "\"tzdata\": {},\n",
        serde_json::to_string(&out.tzdata).map_err(e)?
    );
    s += &format!("\"first_year\": {},\n", out.first_year);
    s += &format!(
        "\"countries\": {},\n",
        serde_json::to_string(&out.countries).map_err(e)?
    );
    s += "\"zones\": {\n";
    let zl: Vec<String> = out
        .zones
        .iter()
        .map(|(k, v)| {
            Ok(format!(
                "{}: {}",
                serde_json::to_string(k).map_err(e)?,
                serde_json::to_string(v).map_err(e)?
            ))
        })
        .collect::<Result<_, String>>()?;
    s += &zl.join(",\n");
    s += "\n},\n\"cities\": [\n";
    let cl: Vec<String> = out
        .cities
        .iter()
        .map(|c| serde_json::to_string(c).map_err(e))
        .collect::<Result<_, String>>()?;
    s += &cl.join(",\n");
    s += "\n]\n}\n";
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::fixture::line;

    /// A tiny world containing every pinned city plus a few extras.
    fn world() -> String {
        let mut lines: Vec<String> = time_core::city::CITIES
            .iter()
            .enumerate()
            .map(|(n, c)| {
                let ascii = c.slug.replace('-', " ");
                line(
                    100 + n as u32,
                    c.name,
                    &ascii,
                    c.lat,
                    c.lon,
                    "PPLA",
                    c.country_code,
                    "01",
                    1_000_000,
                    c.zone,
                )
            })
            .collect();
        lines.push(line(
            9001,
            "Hyderabad",
            "Hyderabad",
            17.38,
            78.46,
            "PPLA",
            "IN",
            "40",
            3_597_816,
            "Asia/Kolkata",
        ));
        lines.push(line(
            9002,
            "Hyderabad",
            "Hyderabad",
            25.39,
            68.37,
            "PPL",
            "PK",
            "05",
            1_386_330,
            "Asia/Karachi",
        ));
        lines.push(line(
            9003,
            "Vaduz",
            "Vaduz",
            47.14,
            9.52,
            "PPLC",
            "LI",
            "11",
            5_197,
            "Europe/Vaduz",
        ));
        lines.join("\n")
    }

    fn countries() -> String {
        let mut ccs: Vec<&str> = time_core::city::CITIES
            .iter()
            .map(|c| c.country_code)
            .collect();
        ccs.extend(["IN", "LI"]);
        ccs.iter()
            .map(|cc| format!("{cc}\tXXX\t0\t{cc}\tCountry {cc}\tCap"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn opts() -> Options {
        Options {
            target: 100,
            per_country: 3,
            first_year: 2026,
            years: 3,
        }
    }

    #[test]
    fn end_to_end_keeps_existing_urls_and_disambiguates() {
        let (out, _) = build(
            &Inputs {
                cities: &world(),
                admin1: "IN.40\tTelangana\tTelangana\t1",
                countries: &countries(),
            },
            &opts(),
        )
        .unwrap();
        let slugs: Vec<&str> = out.cities.iter().map(|c| c.slug.as_str()).collect();
        for c in time_core::city::CITIES {
            assert!(slugs.contains(&c.slug), "lost existing URL {}", c.slug);
        }
        assert!(
            slugs.contains(&"hyderabad-country-in") && slugs.contains(&"hyderabad-country-pk"),
            "{slugs:?}"
        );
        assert!(slugs.contains(&"vaduz"));
        assert!(
            out.cities
                .iter()
                .find(|c| c.slug == "vaduz")
                .is_some_and(|c| c.capital)
        );
        let ny = &out.zones["America/New_York"][&2027];
        assert_eq!(ny.start_offset, -5 * 3600);
        assert_eq!(ny.changes.len(), 2);
        assert!(out.zones["Asia/Karachi"][&2026].changes.is_empty());
        assert_eq!(out.zones["Asia/Karachi"][&2026].start_abbr, "PKT");
        let json = to_json(&out).unwrap();
        let back: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(
            back["cities"].as_array().map(Vec::len),
            Some(out.cities.len())
        );
    }

    #[test]
    fn fails_loudly_on_missing_data() {
        let err = build(
            &Inputs {
                cities: "",
                admin1: "",
                countries: &countries(),
            },
            &opts(),
        )
        .unwrap_err();
        assert!(err.contains("existing city URLs"), "{err}");
        let err = build(
            &Inputs {
                cities: &world(),
                admin1: "",
                countries: "",
            },
            &opts(),
        )
        .unwrap_err();
        assert!(err.contains("country codes missing"), "{err}");
    }
}
