use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::AppState;
use crate::http::ApiError;
use agents_contracts::error_codes::ErrorCode;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/healthz", get(live))
        .route("/readyz", get(ready))
}

async fn live() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn ready(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "database not ready");
            ApiError::new(ErrorCode::Unavailable)
        })?;
    Ok(Json(json!({ "status": "ready" })))
}
