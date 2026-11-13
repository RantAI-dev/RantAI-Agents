//! Dashboard chat sessions and their messages: `/api/dashboard/chat/sessions/**`.
//! Old: `src/app/api/dashboard/chat/sessions/**`, `src/features/conversations/sessions/*`.
//!
//! The success bodies are the ones the TypeScript returned, so the current UI keeps working.
//! What changed on the way (docs/port/differences.md):
//! - every error uses the standard body;
//! - another user's session, message or assistant is a 404, never a 403, so ids cannot be
//!   probed;
//! - a body that is not JSON, or a field that is wrong, is a 400 with every bad field listed,
//!   not a 500;
//! - the edit history of a message keeps the user text and the assistant reply of every
//!   version (QA TC-944).
//!
//! The request bodies are read by `bodies`, which owns their shape.

mod bodies;

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::routing::{get, post};
use chrono::NaiveDateTime;
use serde::Serialize;
use serde_json::Value;

use agents_contracts::error_codes::ErrorCode;
use agents_core::validation::FieldError;
use agents_store::StoreError;
use agents_store::sessions;

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::json::Body;

use bodies::EditHistoryEntry;
use bodies::{parse_create, parse_message_ids, parse_message_update, parse_messages, parse_rename};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/dashboard/chat/sessions",
            get(list_sessions).post(create_session),
        )
        .route(
            "/api/dashboard/chat/sessions/{id}",
            get(get_session)
                .patch(update_session)
                .delete(delete_session),
        )
        .route(
            "/api/dashboard/chat/sessions/{id}/messages",
            post(add_messages)
                .patch(update_message)
                .delete(delete_messages),
        )
}

/// An instant as the API prints it: RFC 3339 in UTC with three decimals. `routes/memory.rs`
/// has the same formatter; it belongs in `http::time` once that route is next touched.
fn iso(t: NaiveDateTime) -> String {
    t.and_utc().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

// ---------------------------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------------------------

/// A message as the API returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageJson {
    id: String,
    role: String,
    content: String,
    created_at: String,
    reply_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    edit_history: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sources: Option<Value>,
    metadata: Option<Value>,
}

/// A session as the sidebar shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionSummaryJson {
    id: String,
    title: String,
    assistant_id: String,
    created_at: String,
    /// Only the list and the detail carry it; a new session has none yet.
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
    message_count: i64,
    last_message: Option<String>,
}

/// A session with its messages and artifacts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionDetailJson {
    id: String,
    title: String,
    assistant_id: String,
    created_at: String,
    messages: Vec<MessageJson>,
    artifacts: Vec<ArtifactJson>,
}

/// A session after a rename.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionRenameJson {
    id: String,
    title: String,
    assistant_id: String,
    created_at: String,
}

/// An artifact created in a session.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactJson {
    id: String,
    title: String,
    content: String,
    artifact_type: Option<String>,
    metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MessagesJson {
    messages: Vec<MessageJson>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
struct SuccessJson {
    success: bool,
}

// ---------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------

async fn list_sessions(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<SessionSummaryJson>>, ApiError> {
    let rows = sessions::list_sessions(&state.db, &user.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(rows.iter().map(summary_json).collect()))
}

async fn create_session(
    State(state): State<AppState>,
    user: CurrentUser,
    body: Option<Body<Value>>,
) -> Result<Json<SessionSummaryJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let (assistant_id, title) = parse_create(&body)?;
    // An assistant that does not exist and an assistant of another organisation are the same
    // answer: the caller must not learn which.
    let visible = sessions::may_use_assistant(&state.db, &user.id, &assistant_id)
        .await
        .map_err(|e| store_error(&e))?;
    if !visible {
        return Err(ApiError::new(ErrorCode::NotFound));
    }
    let row = sessions::create_session(&state.db, &user.id, &assistant_id, &title)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(new_session_json(&row)))
}

async fn get_session(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<SessionDetailJson>, ApiError> {
    let detail = sessions::get_session_detail(&state.db, &user.id, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SessionDetailJson {
        id: detail.session.id.clone(),
        title: detail.session.title.clone(),
        assistant_id: detail.session.assistant_id.clone(),
        created_at: iso(detail.session.created_at),
        messages: detail.messages.iter().map(message_json).collect(),
        artifacts: detail.artifacts.iter().map(artifact_json).collect(),
    }))
}

async fn update_session(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<SessionRenameJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let title = parse_rename(&body)?;
    let existing = sessions::get_session(&state.db, &user.id, &id)
        .await
        .map_err(|e| store_error(&e))?;
    // No title in the body keeps the one the session has.
    let title = title.unwrap_or_else(|| existing.title.clone());
    let row = sessions::update_title(&state.db, &user.id, &id, &title)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SessionRenameJson {
        id: row.id.clone(),
        title: row.title.clone(),
        assistant_id: row.assistant_id.clone(),
        created_at: iso(row.created_at),
    }))
}

async fn delete_session(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<SuccessJson>, ApiError> {
    sessions::delete_session(&state.db, &user.id, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SuccessJson { success: true }))
}

async fn add_messages(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<MessagesJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let messages = parse_messages(&body)?;
    let rows = sessions::add_messages(&state.db, &user.id, &id, &messages)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(MessagesJson {
        messages: rows.iter().map(message_json).collect(),
    }))
}

async fn update_message(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<MessageJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let (message_id, changes) = parse_message_update(&body)?;
    let row = sessions::update_message(&state.db, &user.id, &id, &message_id, &changes)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(message_json(&row)))
}

async fn delete_messages(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<SuccessJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let ids = parse_message_ids(&body)?;
    sessions::delete_messages(&state.db, &user.id, &id, &ids)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SuccessJson { success: true }))
}

// ---------------------------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------------------------

fn summary_json(row: &sessions::SessionSummary) -> SessionSummaryJson {
    SessionSummaryJson {
        id: row.id.clone(),
        title: row.title.clone(),
        assistant_id: row.assistant_id.clone(),
        created_at: iso(row.created_at),
        updated_at: Some(iso(row.updated_at)),
        message_count: row.message_count,
        last_message: preview(row.last_message.as_deref()),
    }
}

/// A new session: it has no messages yet.
fn new_session_json(row: &sessions::SessionRow) -> SessionSummaryJson {
    SessionSummaryJson {
        id: row.id.clone(),
        title: row.title.clone(),
        assistant_id: row.assistant_id.clone(),
        created_at: iso(row.created_at),
        updated_at: None,
        message_count: 0,
        last_message: None,
    }
}

fn message_json(row: &sessions::MessageRow) -> MessageJson {
    MessageJson {
        id: row.id.clone(),
        role: row.role.clone(),
        content: row.content.clone(),
        created_at: iso(row.created_at),
        reply_to: row.reply_to.clone(),
        edit_history: edit_history_value(row.edit_history.as_ref()),
        sources: row.sources.clone(),
        metadata: row.metadata.clone(),
    }
}

fn artifact_json(row: &sessions::ArtifactRow) -> ArtifactJson {
    ArtifactJson {
        id: row.id.clone(),
        title: row.title.clone(),
        content: row.content.clone(),
        artifact_type: row.artifact_type.clone(),
        metadata: row.metadata.clone(),
    }
}

/// The edit history as the API returns it: the user text and the assistant reply of every
/// version, in a fixed field order. A row written with another shape is returned as it is
/// stored.
fn edit_history_value(raw: Option<&Value>) -> Option<Value> {
    let raw = raw?;
    match serde_json::from_value::<Vec<EditHistoryEntry>>(raw.clone()) {
        Ok(entries) => Some(serde_json::to_value(entries).unwrap_or_else(|_| raw.clone())),
        Err(_) => Some(raw.clone()),
    }
}

/// The preview of the last message in the sidebar: its first 100 characters.
fn preview(content: Option<&str>) -> Option<String> {
    let text = content?;
    let trimmed: String = text.chars().take(100).collect();
    (!trimmed.is_empty()).then_some(trimmed)
}

fn store_error(e: &StoreError) -> ApiError {
    match e {
        StoreError::NotFound => ApiError::new(ErrorCode::NotFound),
        StoreError::Conflict => ApiError::new(ErrorCode::Conflict),
        StoreError::Db(err) => {
            tracing::error!(error = %err, "sessions store");
            ApiError::new(ErrorCode::Internal)
        }
    }
}

fn missing_body() -> ApiError {
    ApiError::from(vec![FieldError::new(
        "",
        "required",
        "A JSON body is required.",
    )])
}
