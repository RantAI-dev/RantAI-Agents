//! The HTTP service: routes, auth extraction and the composition root.

pub mod auth;
pub mod config;
pub mod http;
pub mod policy;
pub mod routes;
pub mod signin;
pub mod sso;

use std::sync::Arc;

use axum::Router;
use sqlx::PgPool;

use config::LlmSettings;
use policy::{AssistantPolicy, ChatMeter, WizardModel};

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
    /// Where the wizard's and the chat's model is served from.
    pub llm: LlmSettings,
    /// The model policy, the usage and the credits of a chat. The open-source edition allows
    /// every chat and records nothing; the cloud edition passes its own.
    pub meter: Arc<dyn ChatMeter>,
    /// How many model calls a chat with tools may make, unless the assistant asks for another
    /// number (`RANTAI_DEFAULT_MAX_STEPS`). A chat without tools makes at most two.
    pub chat_max_steps: u32,
    /// The most model calls an assistant may ask for (`RANTAI_MAX_STEPS_HARD_CAP`).
    pub chat_max_steps_cap: u32,
    /// How a chat waits for the user's decision on a gated tool call.
    pub tool_approval: config::ToolApprovalTiming,
    /// Whether the identity and date block is part of the system prompt.
    pub platform_context: bool,
    /// The HTTP client the model is called with. One for the process: the connection pool is
    /// what keeps the chat fast.
    pub http: reqwest::Client,
    /// Sign-in: the public URL, the throttle, the SSO client and the provider from the
    /// environment.
    pub signin: Arc<signin::SignIn>,
    /// `TRUSTED_PROXIES`: the proxies whose `X-Forwarded-For` is believed. Empty means the
    /// socket peer is the caller ([`http::client_ip`]).
    pub trusted_proxies: Arc<[agents_core::net::Cidr]>,
    /// The agent API: the conversations of the open sockets and the limits they run under.
    pub api: routes::agent_api::ApiState,
}

impl AppState {
    /// The state of a deployment that allows everything.
    #[must_use]
    pub fn new(db: PgPool, auth: auth::AuthConfig) -> Self {
        Self {
            db,
            auth,
            policy: Arc::new(policy::AllowAll),
            wizard: Arc::new(policy::ConfiguredWizard::new(
                policy::WIZARD_MODEL_ID,
                false,
            )),
            meter: Arc::new(policy::AllowAllChat),
            llm: LlmSettings::default(),
            chat_max_steps: agents_core::chat::step_budget::PLATFORM_DEFAULT,
            chat_max_steps_cap: agents_core::chat::step_budget::HARD_CAP,
            tool_approval: config::ToolApprovalTiming::default(),
            platform_context: true,
            http: reqwest::Client::new(),
            signin: Arc::new(signin::SignIn::default()),
            trusted_proxies: Arc::from(Vec::new()),
            api: routes::agent_api::ApiState::default(),
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
