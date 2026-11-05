//! JS bindings for time-core. No logic here — only conversion at the boundary.

use time_core::{city, sync, tz};
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
