//! JS bindings for time-core. No logic here — only conversion at the boundary.

use time_core::astro::{moon, prayer, seasons, sun};
use time_core::{calendar, city, convert, hijri, planner, sync, tz};
use wasm_bindgen::prelude::*;

fn to_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsError> {
    serde_wasm_bindgen::to_value(value).map_err(|e| JsError::new(&e.to_string()))
}

fn tz_err(e: tz::TzError) -> JsError {
    JsError::new(&e.to_string())
}

/// Clock-sync filter held inside the worker.
#[wasm_bindgen]
pub struct WasmSync {
    filter: sync::SyncFilter,
}

#[wasm_bindgen]
impl WasmSync {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            filter: sync::SyncFilter::default(),
        }
    }

    /// Returns false if the sample was rejected.
    pub fn add(&mut self, t0: f64, t1: f64, t2: f64, t3: f64) -> bool {
        self.filter.add(sync::Sample { t0, t1, t2, t3 })
    }

    pub fn estimate(&self, now_ms: f64) -> Result<JsValue, JsError> {
        to_js(&self.filter.estimate(now_ms))
    }

    pub fn clear(&mut self) {
        self.filter.clear();
    }
}

impl Default for WasmSync {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen(js_name = zoneTime)]
pub fn zone_time(unix_ms: f64, zone: &str) -> Result<JsValue, JsError> {
    to_js(&tz::zone_time(unix_ms as i64, zone).map_err(tz_err)?)
}

#[wasm_bindgen(js_name = nextTransition)]
pub fn next_transition(unix_ms: f64, zone: &str) -> Result<JsValue, JsError> {
    to_js(&tz::next_transition(unix_ms as i64, zone).map_err(tz_err)?)
}

#[wasm_bindgen(js_name = offsetDifference)]
pub fn offset_difference(unix_ms: f64, a: &str, b: &str) -> Result<i32, JsError> {
    tz::offset_difference(unix_ms as i64, a, b).map_err(tz_err)
}

#[wasm_bindgen(js_name = wallToUnixMs)]
pub fn wall_to_unix_ms(
    year: i32,
    month: i32,
    day: i32,
    hour: i32,
    minute: i32,
    second: i32,
    zone: &str,
) -> Result<f64, JsError> {
    let narrow =
        |v: i32| i8::try_from(v).map_err(|_| JsError::new("date or time field out of range"));
    let y = i16::try_from(year).map_err(|_| JsError::new("year out of range"))?;
    tz::wall_to_unix_ms(
        y,
        narrow(month)?,
        narrow(day)?,
        narrow(hour)?,
        narrow(minute)?,
        narrow(second)?,
        zone,
    )
    .map(|ms| ms as f64)
    .map_err(tz_err)
}

#[wasm_bindgen(js_name = tzdataVersion)]
pub fn tzdata_version() -> Option<String> {
    tz::tzdata_version().map(str::to_owned)
}

#[wasm_bindgen(js_name = findCity)]
pub fn find_city(slug: &str) -> Result<JsValue, JsError> {
    to_js(&city::find_city(slug))
}

fn conv_err(e: convert::ConvertError) -> JsError {
    JsError::new(&e.to_string())
}

fn make_date(year: i32, month: i32, day: i32) -> Result<convert::Date, JsError> {
    let narrow = |v: i32| u8::try_from(v).map_err(|_| JsError::new("invalid date"));
    convert::Date::new(year, narrow(month)?, narrow(day)?).map_err(conv_err)
}

/// `flat` is year, month, day repeated.
fn make_holidays(flat: &[i32]) -> Result<Vec<convert::Date>, JsError> {
    let (triples, rest) = flat.as_chunks::<3>();
    if !rest.is_empty() {
        return Err(JsError::new("holidays must be year, month, day triples"));
    }
    triples
        .iter()
        .map(|[y, m, d]| make_date(*y, *m, *d))
        .collect()
}

fn mask_u8(mask: i32) -> Result<u8, JsError> {
    u8::try_from(mask).map_err(|_| JsError::new("weekend mask out of range"))
}

#[wasm_bindgen(js_name = parseUnix)]
pub fn parse_unix(input: &str) -> Result<JsValue, JsError> {
    to_js(&convert::parse_unix(input).map_err(conv_err)?)
}

#[wasm_bindgen(js_name = dateDiff)]
pub fn date_diff(y1: i32, m1: i32, d1: i32, y2: i32, m2: i32, d2: i32) -> Result<JsValue, JsError> {
    let diff =
        convert::date_diff(make_date(y1, m1, d1)?, make_date(y2, m2, d2)?).map_err(conv_err)?;
    to_js(&diff)
}

#[wasm_bindgen(js_name = businessDays)]
#[allow(clippy::too_many_arguments)]
pub fn business_days(
    y1: i32,
    m1: i32,
    d1: i32,
    y2: i32,
    m2: i32,
    d2: i32,
    weekend_mask: i32,
    holidays: &[i32],
) -> Result<f64, JsError> {
    let n = convert::business_days(
        make_date(y1, m1, d1)?,
        make_date(y2, m2, d2)?,
        mask_u8(weekend_mask)?,
        &make_holidays(holidays)?,
    )
    .map_err(conv_err)?;
    Ok(n as f64)
}

#[wasm_bindgen(js_name = addBusinessDays)]
pub fn add_business_days(
    year: i32,
    month: i32,
    day: i32,
    n: f64,
    weekend_mask: i32,
    holidays: &[i32],
) -> Result<JsValue, JsError> {
    let date = convert::add_business_days(
        make_date(year, month, day)?,
        n as i64,
        mask_u8(weekend_mask)?,
        &make_holidays(holidays)?,
    )
    .map_err(conv_err)?;
    to_js(&date)
}

/// `zones` is comma-separated IANA names; `hours` is start, end minutes per zone.
#[wasm_bindgen(js_name = planDay)]
#[allow(clippy::too_many_arguments)]
pub fn plan_day(
    year: i32,
    month: i32,
    day: i32,
    anchor_zone: &str,
    zones: &str,
    hours: &[u16],
    step_min: u16,
    duration_min: u16,
    shoulder_min: u16,
) -> Result<JsValue, JsError> {
    let names: Vec<&str> = zones.split(',').filter(|z| !z.is_empty()).collect();
    let (pairs, rest) = hours.as_chunks::<2>();
    if !rest.is_empty() || pairs.len() != names.len() {
        return Err(JsError::new("need one start and end time per place"));
    }
    let people: Vec<planner::Participant<'_>> = names
        .iter()
        .zip(pairs)
        .map(|(zone, [start_min, end_min])| planner::Participant {
            zone,
            hours: planner::Hours {
                start_min: *start_min,
                end_min: *end_min,
            },
        })
        .collect();
    let opts = planner::Options {
        step_min,
        duration_min,
        shoulder_min,
    };
    let plan = planner::plan_day(make_date(year, month, day)?, anchor_zone, &people, opts)
        .map_err(|e| JsError::new(&e.to_string()))?;
    to_js(&plan)
}

#[wasm_bindgen(js_name = monthGrid)]
pub fn month_grid(year: i32, month: i32, sunday_first: bool) -> Result<JsValue, JsError> {
    let month = u8::try_from(month).map_err(|_| JsError::new("invalid date"))?;
    let start = if sunday_first {
        calendar::WeekStart::Sunday
    } else {
        calendar::WeekStart::Monday
    };
    to_js(&calendar::month_grid(year, month, start).map_err(conv_err)?)
}

#[wasm_bindgen(js_name = isoWeek)]
pub fn iso_week(year: i32, month: i32, day: i32) -> Result<JsValue, JsError> {
    to_js(&calendar::iso_week(make_date(year, month, day)?).map_err(conv_err)?)
}

/// Umm al-Qura date of a Gregorian date (1300-1600 AH only).
#[wasm_bindgen(js_name = toHijri)]
pub fn to_hijri(year: i32, month: i32, day: i32) -> Result<JsValue, JsError> {
    to_js(&hijri::gregorian_to_hijri(make_date(year, month, day)?).map_err(conv_err)?)
}

#[wasm_bindgen(js_name = fromHijri)]
pub fn from_hijri(year: i32, month: i32, day: i32) -> Result<JsValue, JsError> {
    let narrow = |v: i32| u8::try_from(v).map_err(|_| JsError::new("invalid date"));
    let h = hijri::HijriDate {
        year,
        month: narrow(month)?,
        day: narrow(day)?,
    };
    to_js(&hijri::hijri_to_gregorian(h).map_err(conv_err)?)
}

fn astro_err(e: time_core::astro::AstroError) -> JsError {
    JsError::new(&e.to_string())
}

#[wasm_bindgen(js_name = sunDay)]
pub fn sun_day(
    year: i32,
    month: i32,
    day: i32,
    lat: f64,
    lon: f64,
    zone: &str,
) -> Result<JsValue, JsError> {
    to_js(&sun::sun_day(make_date(year, month, day)?, lat, lon, zone).map_err(astro_err)?)
}

#[wasm_bindgen(js_name = sunPosition)]
pub fn sun_position(unix_ms: f64, lat: f64, lon: f64) -> Result<JsValue, JsError> {
    to_js(&sun::sun_position(unix_ms as i64, lat, lon).map_err(astro_err)?)
}

#[wasm_bindgen(js_name = moonInfo)]
pub fn moon_info(unix_ms: f64) -> Result<JsValue, JsError> {
    to_js(&moon::moon_info(unix_ms as i64))
}

#[wasm_bindgen(js_name = seasons)]
pub fn seasons_of(year: i32) -> Result<JsValue, JsError> {
    to_js(&seasons::seasons(year).ok_or_else(|| JsError::new("year must be 1000-3000"))?)
}

/// `method`: karachi | mwl | isna | egypt | umm_al_qura; `asr`: standard | hanafi;
/// `high`: angle | middle.
#[wasm_bindgen(js_name = prayerTimes)]
#[allow(clippy::too_many_arguments)]
pub fn prayer_times(
    year: i32,
    month: i32,
    day: i32,
    lat: f64,
    lon: f64,
    zone: &str,
    method: &str,
    asr: &str,
    high: &str,
) -> Result<JsValue, JsError> {
    let method = match method {
        "karachi" => prayer::Method::Karachi,
        "mwl" => prayer::Method::MuslimWorldLeague,
        "isna" => prayer::Method::NorthAmerica,
        "egypt" => prayer::Method::Egypt,
        "umm_al_qura" => prayer::Method::UmmAlQura,
        _ => return Err(JsError::new("unknown calculation method")),
    };
    let asr = match asr {
        "standard" => prayer::AsrShadow::Standard,
        "hanafi" => prayer::AsrShadow::Hanafi,
        _ => return Err(JsError::new("unknown Asr rule")),
    };
    let high = match high {
        "angle" => prayer::HighLatitude::AngleBased,
        "middle" => prayer::HighLatitude::MiddleOfNight,
        _ => return Err(JsError::new("unknown high-latitude rule")),
    };
    let t = prayer::prayer_times(
        make_date(year, month, day)?,
        lat,
        lon,
        zone,
        method,
        asr,
        high,
    )
    .map_err(astro_err)?;
    to_js(&t)
}
