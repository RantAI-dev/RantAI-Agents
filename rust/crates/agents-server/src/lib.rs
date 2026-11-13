//! The HTTP service: routes, auth extraction and the composition root.

pub mod config;
pub mod http;
pub mod routes;

use axum::Router;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}

/// The whole router. Each route module registers its own routes in `routes::router`.
pub fn app(state: AppState) -> Router {
    routes::router()
        .layer(axum::middleware::from_fn(http::request_id::middleware))
        .with_state(state)
}
