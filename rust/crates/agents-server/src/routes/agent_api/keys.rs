//! `GET`/`POST /api/dashboard/agent-api-keys` and
//! `GET`/`PATCH`/`PUT`/`DELETE /api/dashboard/agent-api-keys/{id}`.
//!
//! Old: `src/app/api/dashboard/agent-api-keys/{route,[id]/route}.ts` over
//! `src/features/agent-api-keys/service.ts`. The success bodies are the ones the dashboard
//! reads today, so that UI keeps working; the errors are the standard body (differences.md
//! row 140).
//!
//! Who may manage keys is `api_keys.manage` (§3.2: owner and admin), decided through
//! `authz::authorize` like every other route, and a key's agent has to be one of the caller's
//! own organisation: another tenant's agent, or a built-in, is a 404, so the route never mints
//! a key for something the caller cannot reach. Every read and write is scoped in SQL by the
//! organisation, so another tenant's key is a 404 as well.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use agents_core::authz::Permission;
use agents_store::api_keys::{self, ApiKeyRow, KeyPatch, NewKey};
use agents_store::assistants;
use agents_store::audit::Actor;

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::client_ip::ClientIp;
use crate::http::json::Body;
use crate::http::time::iso;
use crate::routes::assistants::{authorize_org, caller, store_error};

use super::bodies;
use super::secret;

/// `?assistantId=` narrows the list to one agent.
#[derive(Debug, Clone, Deserialize)]
pub struct ListQuery {
    #[serde(rename = "assistantId")]
    assistant_id: Option<String>,
}

/// An agent as the key list shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSummary {
    pub id: String,
    pub name: String,
    pub emoji: String,
}

/// One key, as the dashboard reads it.
///
/// `key` is the masked value (the whole key is in the create response only), and `assistant` is
/// `null` for an agent that has been deleted since.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyJson {
    pub id: String,
    pub name: String,
    pub key: String,
    pub assistant_id: String,
    pub scopes: Vec<String>,
    pub ip_whitelist: Vec<String>,
    pub request_count: i32,
    pub last_used_at: Option<String>,
    pub enabled: bool,
    pub expires_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub assistant: Option<AssistantSummary>,
}

impl KeyJson {
    /// The key as the dashboard reads it, with `shown` in place of the masked value.
    fn new(row: &ApiKeyRow, assistant: Option<AssistantSummary>, shown: Option<&str>) -> Self {
        Self {
            id: row.id.clone(),
            name: row.name.clone(),
            key: shown.map_or_else(|| secret::mask(&row.key), str::to_owned),
            assistant_id: row.assistant_id.clone(),
            scopes: row.scopes.clone(),
            ip_whitelist: row.ip_whitelist.clone(),
            request_count: row.request_count,
            last_used_at: row.last_used_at.map(iso),
            enabled: row.enabled,
            expires_at: row.expires_at.map(iso),
            created_at: iso(row.created_at),
            updated_at: iso(row.updated_at),
            assistant,
        }
    }
}

/// The keys of the caller's organisation, newest first.
pub async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<KeyJson>>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    authorize_org(&state.db, &caller, Permission::ApiKeysManage).await?;
    let org_id = caller.org()?;

    let rows = api_keys::list(&state.db, org_id, query.assistant_id.as_deref())
        .await
        .map_err(|e| store_error(&e))?;
    let mut summaries = Summaries::default();
    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        let assistant = summaries.get(&state.db, &row.assistant_id).await;
        out.push(KeyJson::new(row, assistant, None));
    }
    Ok(Json(out))
}

/// Mints a key. The whole key is in this response and in no other: the row keeps the hash and
/// the mask.
pub async fn create(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: HeaderMap,
    ip: ClientIp,
    body: Option<Body<Value>>,
) -> Result<(axum::http::StatusCode, Json<KeyJson>), ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    authorize_org(&state.db, &caller, Permission::ApiKeysManage).await?;
    let org_id = caller.org()?;
    let Some(Body(body)) = body else {
        return Err(crate::routes::organizations::missing_body());
    };
    let input = bodies::parse_create(&body)?;

    let generated = secret::generate()?;
    let address = ip.text();
    let actor = Actor {
        user_id: &caller.user_id,
        ip_address: address.as_deref(),
    };
    let row = api_keys::create(
        &state.db,
        org_id,
        &NewKey {
            name: &input.name,
            assistant_id: &input.assistant_id,
            key_hash: &generated.hash,
            key_hint: &generated.hint,
            scopes: input
                .scopes
                .unwrap_or_else(|| vec!["chat".to_owned(), "chat:stream".to_owned()]),
            ip_whitelist: input.ip_whitelist.unwrap_or_default(),
            expires_at: input.expires_at,
            created_by: &caller.user_id,
        },
        &actor,
    )
    .await
    .map_err(|e| store_error(&e))?;

    let mut summaries = Summaries::default();
    let assistant = summaries.get(&state.db, &row.assistant_id).await;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(KeyJson::new(&row, assistant, Some(&generated.key))),
    ))
}

/// One key. Another organisation's key is a 404.
pub async fn get_one(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<KeyJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    authorize_org(&state.db, &caller, Permission::ApiKeysManage).await?;
    let org_id = caller.org()?;
    let row = api_keys::get(&state.db, org_id, &id)
        .await
        .map_err(|e| store_error(&e))?;
    let mut summaries = Summaries::default();
    let assistant = summaries.get(&state.db, &row.assistant_id).await;
    Ok(Json(KeyJson::new(&row, assistant, None)))
}

/// Changes a key's name, scopes, allowlist, expiry or the switch.
pub async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: HeaderMap,
    ip: ClientIp,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<KeyJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    authorize_org(&state.db, &caller, Permission::ApiKeysManage).await?;
    let org_id = caller.org()?;
    let Some(Body(body)) = body else {
        return Err(crate::routes::organizations::missing_body());
    };
    let input = bodies::parse_update(&body)?;

    let patch = KeyPatch {
        name: input.name,
        scopes: input.scopes,
        ip_whitelist: input.ip_whitelist,
        enabled: input.enabled,
        expires_at: input.expires_at,
    };
    let address = ip.text();
    let actor = Actor {
        user_id: &caller.user_id,
        ip_address: address.as_deref(),
    };
    let row = api_keys::update(&state.db, org_id, &id, &patch, &actor)
        .await
        .map_err(|e| store_error(&e))?;
    let mut summaries = Summaries::default();
    let assistant = summaries.get(&state.db, &row.assistant_id).await;
    Ok(Json(KeyJson::new(&row, assistant, None)))
}

/// Revokes a key. The `{"success": true}` body is the one the dashboard reads.
pub async fn delete(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: HeaderMap,
    ip: ClientIp,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    authorize_org(&state.db, &caller, Permission::ApiKeysManage).await?;
    let org_id = caller.org()?;
    let address = ip.text();
    let actor = Actor {
        user_id: &caller.user_id,
        ip_address: address.as_deref(),
    };
    api_keys::delete(&state.db, org_id, &id, &actor)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(json!({ "success": true })))
}

/// The agents the list names, read once each.
///
/// A key whose agent has been deleted since shows `assistant: null` rather than failing the
/// list, which is what the old `assistantMap.get(...)` did.
#[derive(Default)]
struct Summaries {
    seen: std::collections::HashMap<String, Option<AssistantSummary>>,
}

impl Summaries {
    async fn get(
        &mut self,
        db: &agents_store::PgPool,
        assistant_id: &str,
    ) -> Option<AssistantSummary> {
        if let Some(cached) = self.seen.get(assistant_id) {
            return cached.clone();
        }
        let summary = match assistants::get(db, assistant_id).await {
            Ok(row) => Some(AssistantSummary {
                id: row.id,
                name: row.name,
                emoji: row.emoji,
            }),
            Err(agents_store::StoreError::NotFound) => None,
            Err(error) => {
                tracing::error!(error = %error, "a key's agent could not be read");
                None
            }
        };
        self.seen.insert(assistant_id.to_owned(), summary.clone());
        summary
    }
}
