//! The HTTP service: routes, auth extraction and the composition root.

pub mod auth;
pub mod config;
pub mod http;
pub mod policy;
pub mod routes;

use std::sync::Arc;

use axum::Router;
use sqlx::PgPool;

use config::LlmSettings;
use policy::{AssistantPolicy, WizardModel};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub auth: auth::AuthConfig,
    /// The plan limits and the model policy. The open-source edition allows everything; the
    /// cloud edition passes its own.
    pub policy: Arc<dyn AssistantPolicy>,
    /// The model the wizard runs on and the catalogue it offers. The open-source edition
    /// offers the house models; the cloud edition passes its own.
    pub wizard: Arc<dyn WizardModel>,
    /// Where the wizard's model is served from.
    pub llm: LlmSettings,
}

/// The whole router. Each route module registers its own routes in `routes::router`.
pub fn app(state: AppState) -> Router {
    routes::router()
        .fallback(|| async {
            http::ApiError::new(agents_contracts::error_codes::ErrorCode::NotFound)
        })
        .layer(axum::middleware::from_fn(http::request_id::middleware))
        .with_state(state)
}
