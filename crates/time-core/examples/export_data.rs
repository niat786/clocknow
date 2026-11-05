//! Writes build-time data for the website from time-core (single source of truth).
//! Run: cargo run -q -p time-core --example export_data > apps/web/src/data/core-data.json

use time_core::{city::CITIES, scales};

fn main() {
    let mut out = String::from("{\n");
    out += &format!("  \"tai_minus_utc_s\": {},\n", scales::TAI_MINUS_UTC_S);
    out += &format!("  \"gps_minus_utc_s\": {},\n", scales::GPS_MINUS_UTC_S);
    out += "  \"cities\": [\n";
    let rows: Vec<String> = CITIES
        .iter()
        .map(|c| {
            format!(
                "    {{ \"slug\": {:?}, \"name\": {:?}, \"country\": {:?}, \"country_code\": {:?}, \"zone\": {:?}, \"lat\": {}, \"lon\": {} }}",
                c.slug, c.name, c.country, c.country_code, c.zone, c.lat, c.lon
            )
        })
        .collect();
    out += &rows.join(",\n");
    out += "\n  ]\n}\n";
    print!("{out}");
}
