//! Server clock. On production hosts this is disciplined by Chrony.

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch, with sub-millisecond precision.
pub fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

pub fn server_id() -> String {
    std::env::var("SERVER_ID").unwrap_or_else(|_| "local".to_owned())
}
