//! clocknow API. Run: `cargo run -p api` (PORT, ALLOWED_ORIGINS, SERVER_ID from env).

mod astro;
mod clock;
mod cors;
mod now;
mod sync;

use axum::{Router, middleware, routing::get};

#[tokio::main]
async fn main() {
    let origins = cors::Origins::from_env();
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/v1/now", get(now::handler))
        .route("/v1/sync", get(sync::handler))
        .route("/v1/sun", get(astro::sun_handler))
        .route("/v1/moon", get(astro::moon_handler))
        .route("/v1/seasons", get(astro::seasons_handler))
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
