//! One module per route group. Add a group with `.merge(group::router())`.

mod assistants;
mod health;
mod memory;
mod sessions;

use axum::Router;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(assistants::router())
        .merge(health::router())
        .merge(memory::router())
        .merge(sessions::router())
}
