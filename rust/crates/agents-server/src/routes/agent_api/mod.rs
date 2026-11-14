//! The agent API: keys, `/v1/chat/completions` and the WebSocket (design §3.6).
//!
//! An agent is reachable from another platform in three pieces:
//!
//! - **keys** (`keys.rs`): the dashboard mints, lists, edits and revokes a key for one agent.
//!   The whole key is shown once, in the create response; the row keeps its hash. Managing a
//!   key needs `api_keys.manage` (§3.2), and a key's agent has to be the caller's own.
//! - **HTTP** (`chat.rs`): `POST /v1/chat/completions`, OpenAI-compatible, streaming and not,
//!   authenticated by `Authorization: Bearer rantai_sk_…`.
//! - **the socket** (`ws.rs`): one conversation per socket, UI-stream chunks out.
//!
//! What the key is checked against, in both transports, is `key_auth.rs`: the hash, then
//! `enabled`, `expiresAt`, the IP allowlist and the scope. The turn behind either transport is
//! prepared by `turn.rs`, so an agent answers the same way wherever it is reached from — and
//! the knowledge base, which this phase keeps off, gets the same 409 in both places.
//!
//! The client's address comes from `crate::http::client_ip` and nowhere else: the socket peer,
//! unless the peer is one of `TRUSTED_PROXIES`, and only then `X-Forwarded-For` walked from the
//! right (differences.md row 146).

mod bodies;
mod chat;
mod key_auth;
mod keys;
mod secret;
mod sessions;
mod turn;
mod ws;

use std::sync::Arc;

use axum::Router;
use axum::routing::get;

use crate::AppState;

pub use sessions::{Conversations, Limits};

/// What the agent API keeps in the process: the conversations of the open sockets, and the
/// limits they run under. Lives in [`AppState`] so a test can shorten a timeout.
#[derive(Debug, Clone, Default)]
pub struct ApiState {
    pub conversations: Arc<Conversations>,
    pub limits: Limits,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/dashboard/agent-api-keys",
            get(keys::list).post(keys::create),
        )
        .route(
            "/api/dashboard/agent-api-keys/{id}",
            get(keys::get_one)
                .patch(keys::update)
                // The dashboard sends PUT; the conventions' verb is PATCH.
                .put(keys::update)
                .delete(keys::delete),
        )
        .merge(chat::router())
        .merge(ws::router())
}
