//! Usage: cargo run -p citygen --release -- <raw-dir> <out.json> [target=2000] [per-country=3]
//! <raw-dir> holds cities15000.txt, admin1CodesASCII.txt and countryInfo.txt from geonames.org.

use std::time::{SystemTime, UNIX_EPOCH};

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some(raw), Some(out_path)) = (args.first(), args.get(1)) else {
        return Err("usage: citygen <raw-dir> <out.json> [target] [per-country]".into());
    };
    let num = |i: usize, d: usize| {
        args.get(i).map_or(Ok(d), |s| {
            s.parse::<usize>().map_err(|e| format!("arg {i}: {e}"))
        })
    };
    let read = |f: &str| {
        std::fs::read_to_string(format!("{raw}/{f}")).map_err(|e| format!("{raw}/{f}: {e}"))
    };
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;
    let year = time_core::tz::zone_time(now_ms, "UTC")
        .map_err(|e| e.to_string())?
        .year;

    let (cities, admin1, countries) = (
        read("cities15000.txt")?,
        read("admin1CodesASCII.txt")?,
        read("countryInfo.txt")?,
    );
    let inputs = citygen::Inputs {
        cities: &cities,
        admin1: &admin1,
        countries: &countries,
    };
    let opts = citygen::Options {
        target: num(2, 2000)?,
        per_country: num(3, 3)?,
        first_year: year,
        years: 3,
    };
    let (out, notes) = citygen::build(&inputs, &opts)?;
    std::fs::write(out_path, citygen::to_json(&out)?).map_err(|e| format!("{out_path}: {e}"))?;
    for n in notes {
        eprintln!("citygen: {n}");
    }
    eprintln!("citygen: wrote {out_path} (years {year}-{})", year + 2);
    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("citygen: {e}");
        std::process::exit(1);
    }
}
