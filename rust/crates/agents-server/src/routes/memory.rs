//! User memory management: `/api/dashboard/memory` and the mobile mirror `/api/mobile/memories`.
//! Old: `src/app/api/dashboard/memory/**`, `src/features/memory/service.ts`.
//!
//! Success bodies match the TypeScript so the current UI keeps working. Errors use the standard
//! body. Fixed on the way: an unknown `?type=` is a 400 (was a 500), the bulk delete validates its
//! body (it used to ignore the parse result), and deleting someone else's row is a 404, so ids
//! cannot be probed (was a 403).

use axum::extract::{Path, Query, State};
use axum::routing::{delete, get};
use axum::{Json, Router};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use agents_contracts::error_codes::ErrorCode;
use agents_core::validation::FieldError;
use agents_store::StoreError;
use agents_store::memory::{self, MemoryRow, MemoryType};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::json::Body;

/// How many rows the list returns, as before.
const LIST_LIMIT: i64 = 100;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/dashboard/memory", get(list).delete(clear))
        .route("/api/dashboard/memory/{id}", delete(delete_one))
        .route("/api/mobile/memories", get(list).delete(clear))
        .route("/api/mobile/memories/{id}", delete(delete_one))
}

fn iso(t: NaiveDateTime) -> String {
    t.and_utc().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    key: String,
    value: Value,
    confidence: Option<f64>,
    source: Option<String>,
    created_at: String,
    updated_at: String,
    expires_at: Option<String>,
}

impl From<MemoryRow> for Item {
    fn from(r: MemoryRow) -> Self {
        Self {
            id: r.id,
            kind: r.kind,
            key: r.key,
            value: r.value,
            confidence: r.confidence,
            source: r.source,
            created_at: iso(r.created_at),
            updated_at: iso(r.updated_at),
            expires_at: r.expires_at.map(iso),
        }
    }
}

fn store_error(e: &StoreError) -> ApiError {
    match e {
        StoreError::NotFound => ApiError::new(ErrorCode::NotFound),
        StoreError::Conflict => ApiError::new(ErrorCode::Conflict),
        StoreError::Db(err) => {
            tracing::error!(error = %err, "memory store");
            ApiError::new(ErrorCode::Internal)
        }
    }
}

fn parse_type(raw: Option<&str>, field: &str) -> Result<Option<MemoryType>, ApiError> {
    match raw.map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(s) => MemoryType::parse(s).map(Some).ok_or_else(|| {
            ApiError::from(vec![FieldError::new(
                field,
                "invalid_enum",
                "Must be WORKING, SEMANTIC or LONG_TERM.",
            )])
        }),
    }
}

#[derive(Deserialize)]
struct ListQuery {
    #[serde(rename = "type")]
    kind: Option<String>,
}

async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Value>, ApiError> {
    let kind = parse_type(q.kind.as_deref(), "type")?;
    let rows = memory::list(&state.db, &user.id, kind, LIST_LIMIT)
        .await
        .map_err(|e| store_error(&e))?;
    let counts = memory::counts(&state.db, &user.id)
        .await
        .map_err(|e| store_error(&e))?;
    let (mut working, mut semantic, mut long_term, mut total) = (0_i64, 0_i64, 0_i64, 0_i64);
    for (t, n) in counts {
        match t.as_str() {
            "WORKING" => working = n,
            "SEMANTIC" => semantic = n,
            "LONG_TERM" => long_term = n,
            _ => {}
        }
        total += n;
    }
    let memories: Vec<Item> = rows.into_iter().map(Item::from).collect();
    Ok(Json(json!({
        "memories": memories,
        "stats": { "working": working, "semantic": semantic, "longTerm": long_term, "total": total },
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ClearBody {
    #[serde(rename = "type")]
    kind: String,
}

async fn clear(
    State(state): State<AppState>,
    user: CurrentUser,
    body: Option<Body<ClearBody>>,
) -> Result<Json<Value>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(ApiError::from(vec![FieldError::new(
            "/type",
            "required",
            "Send {\"type\": \"WORKING\" | \"SEMANTIC\" | \"LONG_TERM\"}.",
        )]));
    };
    let kind = parse_type(Some(&body.kind), "/type")?.ok_or_else(|| {
        ApiError::from(vec![FieldError::new(
            "/type",
            "required",
            "type is required.",
        )])
    })?;
    memory::delete_all(&state.db, &user.id, Some(kind))
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_one(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    memory::delete_one(&state.db, &user.id, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(json!({ "success": true })))
}
