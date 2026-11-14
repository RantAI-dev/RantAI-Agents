//! One module per route group. Add a group with `.merge(group::router())`.

pub(crate) mod agent_api;
pub(crate) mod assistants;
mod auth;
mod chat;
mod health;
mod memory;
mod organizations;
mod sessions;
mod sharing;

use axum::Router;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(agent_api::router())
        .merge(assistants::router())
        .merge(auth::router())
        .merge(chat::router())
        .merge(health::router())
        .merge(memory::router())
        .merge(organizations::router())
        .merge(sessions::router())
        .merge(sharing::router())
}
