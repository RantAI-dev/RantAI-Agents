//! Chat sharing: `/api/dashboard/chat/sessions/{id}/shares` and `/api/dashboard/chat/shared`.
//!
//! New in slice S5 (`docs/design/identity-and-access.md` §3.4, §4); the TypeScript had no way to
//! share a chat. A share names the organisation, one of its units (and so every unit below it) or
//! one of its members, and is always read-only (`view`). What the design says, and what this
//! follows when it is silent:
//!
//! - Only the owner of the chat, or an admin, shares and revokes: it is `authz::authorize` with
//!   `chats.share` on `Resource::Chat`, never a role compared here.
//! - A recipient reads the transcript through `/shared/{id}` and forks it. The normal session
//!   routes stay owner-only: they answer 404 for a recipient, so a share never becomes an edit
//!   right.
//! - A unit share follows the same inheritance as a grant, and a user removed from a unit loses
//!   the access with it because the visibility query resolves membership at read time.
//! - A revoked share is invisible: both the list and the transcript see `revokedAt IS NULL`.
//! - Every change writes an `AuditLog` row in the change's own transaction (`rbac.share.create`,
//!   `rbac.share.revoke`, resource `session:<id>`).
//! - A session written before sessions carried an organisation is attached to the caller's
//!   organisation on its first share when its agent belongs to exactly that organisation; a
//!   global agent leaves it unshareable (a 409 with a sentence).

mod bodies;

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::{delete, get, post};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use agents_contracts::error_codes::ErrorCode;
use agents_core::authz::{ChatRef, Permission, Principal, Resource};
use agents_store::StoreError;
use agents_store::access::{self, SharedCursor};
use agents_store::assistants;
use agents_store::audit::Actor;
use agents_store::grants;
use agents_store::sessions;
use agents_store::shares::{self, ShareRow};

use crate::AppState;
use crate::auth::{CurrentUser, active_org};
use crate::http::ApiError;
use crate::http::json::Body;
use crate::http::time::iso;
use crate::routes::assistants::{
    SuccessJson, decision, missing_body, not_found, store_error as assistant_store_error,
};
use crate::routes::organizations::ip_address;

use bodies::parse_shares;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/dashboard/chat/sessions/{id}/shares",
            get(list).put(replace),
        )
        .route(
            "/api/dashboard/chat/sessions/{id}/shares/{shareId}",
            delete(revoke),
        )
        .route("/api/dashboard/chat/shared", get(shared_list))
        .route("/api/dashboard/chat/shared/{id}", get(shared_transcript))
        .route("/api/dashboard/chat/shared/{id}/fork", post(fork))
}

/// How many sessions a page of `/shared` returns when the caller names no `limit`.
const DEFAULT_LIMIT: i64 = 50;
/// The most sessions one page returns. A larger `limit` is lowered to this.
const MAX_LIMIT: i64 = 100;

/// `GET /api/dashboard/chat/sessions/{id}/shares` — the active shares of one chat.
pub(super) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<SharesJson>, ApiError> {
    let (principal, org_id) = caller(&state, &headers, &user).await?;
    let chat = chat_ref_or_orgless(&state, &org_id, &id).await?;
    decision(&principal, Permission::ChatsShare, &Resource::Chat(&chat))?;
    let rows = shares::list_for_session(&state.db, &org_id, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SharesJson {
        data: rows.iter().map(share_json).collect(),
        next_cursor: None,
    }))
}

/// `PUT /api/dashboard/chat/sessions/{id}/shares` — replace every share with the body's list.
///
/// The body is a bare array `[{ "subjectType": "org"|"unit"|"user", "subjectId": "<id>" }]`. An
/// empty array leaves the chat shared with nobody. The level is always `view`; it is not part of
/// the body.
pub(super) async fn replace(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<SharesJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let wanted = parse_shares(&body)?;
    let (principal, org_id) = caller(&state, &headers, &user).await?;
    let chat = chat_ref_or_orgless(&state, &org_id, &id).await?;
    decision(&principal, Permission::ChatsShare, &Resource::Chat(&chat))?;
    let ip = ip_address(&headers);
    let actor = Actor {
        user_id: &principal.user_id,
        ip_address: ip.as_deref(),
    };
    let rows = shares::replace_all(&state.db, &org_id, &id, &wanted, &actor)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SharesJson {
        data: rows.iter().map(share_json).collect(),
        next_cursor: None,
    }))
}

/// `DELETE /api/dashboard/chat/sessions/{id}/shares/{shareId}` — revoke one share by its id.
pub(super) async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path((id, share_id)): Path<(String, String)>,
) -> Result<Json<SuccessJson>, ApiError> {
    let (principal, org_id) = caller(&state, &headers, &user).await?;
    let chat = chat_ref_or_orgless(&state, &org_id, &id).await?;
    decision(&principal, Permission::ChatsShare, &Resource::Chat(&chat))?;
    let ip = ip_address(&headers);
    let actor = Actor {
        user_id: &principal.user_id,
        ip_address: ip.as_deref(),
    };
    shares::revoke_by_id(&state.db, &org_id, &id, &share_id, &actor)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SuccessJson { success: true }))
}

/// `GET /api/dashboard/chat/shared` — other users' chats an active share reaches the caller
/// through, newest activity first.
pub(super) async fn shared_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Query(query): Query<SharedQuery>,
) -> Result<Json<SharedPageJson>, ApiError> {
    let limit = parse_limit(query.limit.as_deref())?;
    let cursor = parse_cursor(query.cursor.as_deref())?;
    let (principal, _org_id) = caller(&state, &headers, &user).await?;
    // One extra row decides whether there is a next page.
    let mut rows = access::sessions_shared_with(&state.db, &principal, cursor.as_ref(), limit + 1)
        .await
        .map_err(|e| store_error(&e))?;
    let more = rows.len() as i64 > limit;
    rows.truncate(limit as usize);
    let next_cursor = if more {
        rows.last().map(|row| SharedCursor::after(row).encode())
    } else {
        None
    };
    Ok(Json(SharedPageJson {
        data: rows.iter().map(shared_session_json).collect(),
        next_cursor,
    }))
}

/// `GET /api/dashboard/chat/shared/{id}` — the read-only transcript of a shared chat.
pub(super) async fn shared_transcript(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<TranscriptJson>, ApiError> {
    let (principal, org_id) = caller(&state, &headers, &user).await?;
    let session = readable(&state, &principal, &org_id, &id).await?;
    let agent_name = assistant_name(&state, &session.assistant_id).await?;
    let messages = sessions::messages_any(&state.db, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(TranscriptJson {
        id: session.id.clone(),
        title: session.title.clone(),
        assistant_id: session.assistant_id.clone(),
        assistant_name: agent_name,
        owner_id: session.user_id.clone(),
        created_at: iso(session.created_at),
        updated_at: iso(session.updated_at),
        messages: messages.iter().map(transcript_message_json).collect(),
    }))
}

/// `POST /api/dashboard/chat/shared/{id}/fork` — copy a shared transcript into the caller's own
/// sessions. The copy needs `agents.use` on the agent: reading somebody's chat is not a right to
/// chat with the agent it used.
pub(super) async fn fork(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<ForkJson>, ApiError> {
    let (principal, org_id) = caller(&state, &headers, &user).await?;
    let session = readable(&state, &principal, &org_id, &id).await?;
    let agent = grants::agent_ref(&state.db, &org_id, &session.assistant_id)
        .await
        .map_err(|e| store_error(&e))?;
    decision(&principal, Permission::AgentsUse, &Resource::Agent(&agent))?;
    let row = sessions::fork_session(
        &state.db,
        &principal.user_id,
        Some(&org_id),
        &id,
        &session.title,
    )
    .await
    .map_err(|e| store_error(&e))?;
    let message_count: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "DashboardMessage" WHERE "sessionId" = $1"#)
            .bind(&row.id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| store_error(&StoreError::Db(e)))?;
    Ok(Json(ForkJson {
        id: row.id.clone(),
        title: row.title.clone(),
        assistant_id: row.assistant_id.clone(),
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
        message_count,
    }))
}

// ---------------------------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------------------------

/// The caller as `authz` sees them in the organisation the request acts in. Chat sharing is an
/// organisation feature: a caller without one is refused before anything is read.
async fn caller(
    state: &AppState,
    headers: &HeaderMap,
    user: &CurrentUser,
) -> Result<(Principal, String), ApiError> {
    let org = active_org(state, headers, user).await?;
    let principal = access::principal(&state.db, &user.id, &org.org_id)
        .await
        .map_err(|e| store_error(&e))?
        .ok_or_else(not_found)?;
    Ok((principal, org.org_id))
}

/// The chat as `authz` sees it. A session with no organisation yet is presented as this
/// organisation's with no shares, so its owner or an admin may share it and the store can attach
/// it (or refuse with the 409); another organisation's chat stays `NotFound`.
async fn chat_ref_or_orgless(
    state: &AppState,
    org_id: &str,
    session_id: &str,
) -> Result<ChatRef, ApiError> {
    let row = sessions::get_session_any(&state.db, session_id)
        .await
        .map_err(|e| store_error(&e))?;
    if row.organization_id.is_some() {
        return shares::chat_ref(&state.db, org_id, session_id)
            .await
            .map_err(|e| store_error(&e));
    }
    Ok(ChatRef {
        organization_id: org_id.to_owned(),
        owner_id: row.user_id,
        shares: Vec::new(),
    })
}

/// A shared chat the caller may read, or the answer they get instead.
async fn readable(
    state: &AppState,
    principal: &Principal,
    org_id: &str,
    session_id: &str,
) -> Result<sessions::SessionRow, ApiError> {
    let chat = shares::chat_ref(&state.db, org_id, session_id)
        .await
        .map_err(|e| store_error(&e))?;
    decision(
        principal,
        Permission::ChatsReadShared,
        &Resource::Chat(&chat),
    )?;
    sessions::get_session_any(&state.db, session_id)
        .await
        .map_err(|e| store_error(&e))
}

async fn assistant_name(state: &AppState, assistant_id: &str) -> Result<String, ApiError> {
    match assistants::get(&state.db, assistant_id).await {
        Ok(row) => Ok(row.name),
        Err(StoreError::NotFound) => Err(not_found()),
        Err(e) => Err(store_error(&e)),
    }
}

/// The store's failure, as the answer the caller sees. `Conflict` here is the unshareable
/// org-less chat, and it gets the sentence the caller needs; every other module's `Conflict`
/// keeps the registry's message.
fn store_error(e: &StoreError) -> ApiError {
    match e {
        StoreError::Conflict => ApiError::new(ErrorCode::Conflict).message(
            "This chat belongs to no organisation and cannot be shared. Its assistant either \
             belongs to none or to another organisation.",
        ),
        other => assistant_store_error(other),
    }
}

// ---------------------------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub(super) struct SharedQuery {
    limit: Option<String>,
    cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SharesJson {
    pub data: Vec<ShareJson>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ShareJson {
    pub id: String,
    pub subject_type: String,
    pub subject_id: String,
    pub level: String,
    pub shared_by: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SharedPageJson {
    pub data: Vec<SharedSessionJson>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SharedSessionJson {
    id: String,
    title: String,
    assistant_id: String,
    owner_id: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TranscriptJson {
    id: String,
    title: String,
    assistant_id: String,
    assistant_name: String,
    owner_id: String,
    created_at: String,
    updated_at: String,
    messages: Vec<TranscriptMessageJson>,
}

/// One message of a shared transcript. Its edit history stays home: the earlier drafts of
/// somebody else's answer are not part of what they shared.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptMessageJson {
    id: String,
    role: String,
    content: String,
    created_at: String,
    reply_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sources: Option<Value>,
    metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ForkJson {
    id: String,
    title: String,
    assistant_id: String,
    created_at: String,
    updated_at: String,
    message_count: i64,
}

fn share_json(row: &ShareRow) -> ShareJson {
    ShareJson {
        id: row.id.clone(),
        subject_type: row.subject_type.clone(),
        subject_id: row.subject_id.clone(),
        level: row.level.clone(),
        shared_by: row.shared_by.clone(),
        created_at: iso(row.created_at),
    }
}

fn shared_session_json(row: &sessions::SessionRow) -> SharedSessionJson {
    SharedSessionJson {
        id: row.id.clone(),
        title: row.title.clone(),
        assistant_id: row.assistant_id.clone(),
        owner_id: row.user_id.clone(),
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
    }
}

fn transcript_message_json(row: &sessions::MessageRow) -> TranscriptMessageJson {
    TranscriptMessageJson {
        id: row.id.clone(),
        role: row.role.clone(),
        content: row.content.clone(),
        created_at: iso(row.created_at),
        reply_to: row.reply_to.clone(),
        sources: row.sources.clone(),
        metadata: row.metadata.clone(),
    }
}

// ---------------------------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------------------------

fn parse_limit(raw: Option<&str>) -> Result<i64, ApiError> {
    let Some(text) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(DEFAULT_LIMIT);
    };
    let Ok(limit) = text.parse::<i64>() else {
        return Err(ApiError::from(vec![
            agents_core::validation::FieldError::new(
                "limit",
                "invalid_format",
                "The limit must be a whole number.",
            ),
        ]));
    };
    if limit < 0 {
        return Err(ApiError::from(vec![
            agents_core::validation::FieldError::new(
                "limit",
                "too_small",
                "The limit must not be negative.",
            ),
        ]));
    }
    Ok(limit.min(MAX_LIMIT))
}

fn parse_cursor(raw: Option<&str>) -> Result<Option<SharedCursor>, ApiError> {
    match raw.map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(text) => SharedCursor::parse(text).map(Some).ok_or_else(|| {
            ApiError::from(vec![agents_core::validation::FieldError::new(
                "cursor",
                "invalid_format",
                "The cursor is not one this route returned.",
            )])
        }),
    }
}
