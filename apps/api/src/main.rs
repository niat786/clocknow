//! clocknow API. Run: `cargo run -p api` (PORT, ALLOWED_ORIGINS, SERVER_ID from env).

mod astro;
mod clock;
mod cors;
mod gate;
mod now;
mod signed;
mod sync;
mod v1;

use axum::{Extension, Router, middleware, routing::get};
use std::sync::Arc;

#[tokio::main]
async fn main() {
    let origins = cors::Origins::from_env();
    let signer: signed::SharedSigner = match signed::Signer::from_env() {
        None => {
            eprintln!("SIGNING_KEY not set: /v1/signed is disabled");
            None
        }
        Some(Ok(s)) => Some(Arc::new(s)),
        Some(Err(e)) => {
            eprintln!("invalid signing configuration: {e}");
            std::process::exit(1);
        }
    };
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/v1/now", get(now::handler))
        .route("/v1/sync", get(sync::handler))
        .route("/v1/zone", get(v1::zone_handler))
        .route("/v1/convert", get(v1::convert_handler))
        .route("/v1/difference", get(v1::difference_handler))
        .route("/v1/sun", get(astro::sun_handler))
        .route("/v1/moon", get(astro::moon_handler))
        .route("/v1/seasons", get(astro::seasons_handler))
        .route("/v1/signed", get(signed::signed_handler))
        .route("/.well-known/clocknow-keys.json", get(signed::keys_handler))
        .layer(Extension(signer))
        .layer(middleware::from_fn_with_state(
            gate::from_env(),
            gate::layer,
        ))
        .layer(middleware::from_fn_with_state(origins.clone(), cors::layer))
        .with_state(origins);

    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8787);
    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("cannot bind port {port}: {e}");
            std::process::exit(1);
        }
    };
    println!("clocknow api listening on :{port}");
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("server error: {e}");
        std::process::exit(1);
    }
}
