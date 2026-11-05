//! Server clock. On production hosts this is disciplined by Chrony.

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch, with sub-millisecond precision.
pub fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// `SERVER_ID` if set; on Fly.io `fly-<region>-<machine prefix>`; otherwise `local`.
pub fn server_id() -> String {
    let var = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
    server_id_from(var("SERVER_ID"), var("FLY_REGION"), var("FLY_MACHINE_ID"))
}

fn server_id_from(explicit: Option<String>, region: Option<String>, machine: Option<String>) -> String {
    if let Some(id) = explicit {
        return id;
    }
    match (region, machine) {
        (Some(r), Some(m)) => format!("fly-{r}-{}", m.chars().take(6).collect::<String>()),
        (Some(r), None) => format!("fly-{r}"),
        _ => "local".to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::server_id_from;

    #[test]
    fn server_id_prefers_explicit_then_fly_then_local() {
        let s = |v: &str| Some(v.to_owned());
        assert_eq!(server_id_from(s("edge-1"), s("sin"), s("185de29f73de78")), "edge-1");
        assert_eq!(server_id_from(None, s("sin"), s("185de29f73de78")), "fly-sin-185de2");
        assert_eq!(server_id_from(None, s("sin"), None), "fly-sin");
        assert_eq!(server_id_from(None, None, None), "local");
    }
}
