//! The HTTP service: routes, auth extraction and the composition root.

pub mod auth;
pub mod config;
pub mod http;
pub mod llm;
pub mod policy;
pub mod routes;

use std::sync::Arc;

use axum::Router;
use sqlx::PgPool;

use policy::{AssistantPolicy, ChatMeter};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub auth: auth::AuthConfig,
    /// The plan limits and the model policy. The open-source edition allows everything; the
    /// cloud edition passes its own.
    pub policy: Arc<dyn AssistantPolicy>,
    /// The model policy, the usage and the credits of a chat. The open-source edition allows
    /// every chat and records nothing; the cloud edition passes its own.
    pub meter: Arc<dyn ChatMeter>,
    /// Where the model is called and with which key.
    pub llm: llm::LlmConfig,
    /// How many model calls one chat may make.
    pub chat_max_steps: u32,
    /// Whether the identity and date block is part of the system prompt.
    pub platform_context: bool,
    /// The HTTP client the model is called with. One for the process: the connection pool is
    /// what keeps the chat fast.
    pub http: reqwest::Client,
}

impl AppState {
    /// The state of a deployment that allows everything.
    #[must_use]
    pub fn new(db: PgPool, auth: auth::AuthConfig) -> Self {
        Self {
            db,
            auth,
            policy: Arc::new(policy::AllowAll),
            meter: Arc::new(policy::AllowAllChat),
            llm: llm::LlmConfig::default(),
            chat_max_steps: 20,
            platform_context: true,
            http: reqwest::Client::new(),
        }
    }
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
