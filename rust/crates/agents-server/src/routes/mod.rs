//! One module per route group. Add a group with `.merge(group::router())`.

pub(crate) mod assistants;
mod auth;
mod chat;
mod health;
mod memory;
mod sessions;

use axum::Router;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(assistants::router())
        .merge(auth::router())
        .merge(chat::router())
        .merge(health::router())
        .merge(memory::router())
        .merge(sessions::router())
}
