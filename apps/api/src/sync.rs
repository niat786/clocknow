//! `WS /v1/sync` — client sends `{"t0": ms}`, server replies `{"t0","t1","t2"}`.
//! Browsers from other sites are refused (Origin check); non-browser clients may connect.

use crate::{clock, cors::Origins};
use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MAX_PINGS: u32 = 64;
const IDLE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Deserialize)]
struct Ping {
    t0: f64,
}

#[derive(Serialize)]
struct Pong {
    t0: f64,
    t1: f64,
    t2: f64,
}

pub async fn handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    State(origins): State<Origins>,
) -> Response {
    let origin_ok = match headers.get(header::ORIGIN).map(|v| v.to_str()) {
        None => true,
        Some(Ok(o)) => origins.allows(o),
        Some(Err(_)) => false,
    };
    if !origin_ok {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.on_upgrade(session)
}

async fn session(mut socket: WebSocket) {
    let mut pings = 0;
    while let Ok(Some(Ok(msg))) = tokio::time::timeout(IDLE_TIMEOUT, socket.recv()).await {
        let t1 = clock::now_ms();
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };
        pings += 1;
        if pings > MAX_PINGS {
            break;
        }
        let Some(reply) = reply_for(text.as_str(), t1) else {
            continue;
        };
        if socket.send(Message::Text(reply.into())).await.is_err() {
            break;
        }
    }
}

fn reply_for(text: &str, t1: f64) -> Option<String> {
    let ping: Ping = serde_json::from_str(text).ok()?;
    if !ping.t0.is_finite() {
        return None;
    }
    serde_json::to_string(&Pong {
        t0: ping.t0,
        t1,
        t2: clock::now_ms(),
    })
    .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn echoes_t0_with_server_stamps() {
        let out = reply_for(r#"{"t0": 123.5}"#, 1_000.0).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["t0"], 123.5);
        assert_eq!(v["t1"], 1_000.0);
        assert!(v["t2"].as_f64().unwrap() >= 1_000.0);
    }

    #[test]
    fn ignores_garbage() {
        assert!(reply_for("hello", 0.0).is_none());
        assert!(reply_for(r#"{"t0":"x"}"#, 0.0).is_none());
    }
}
