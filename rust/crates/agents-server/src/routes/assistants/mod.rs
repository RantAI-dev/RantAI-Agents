//! The assistant API: `/api/assistants/**` and the mobile mirror `/api/mobile/assistants/**`.
//!
//! Old: `src/app/api/assistants/**`, `src/app/api/mobile/assistants/**` and
//! `src/app/api/user/default-assistant/route.ts`, with the services in
//! `src/features/assistants/{core,bindings,default}/*`.
//!
//! The success bodies are the ones the TypeScript returned, so the current UI keeps working.
//! What changed on the way (docs/port/differences.md):
//! - every error uses the standard body, and a bad body is a 400 with every bad field listed;
//! - an assistant of another organisation is a 404, never a 403, so ids cannot be probed;
//! - the built-in assistants are read-only for everyone but a platform admin, and editing the
//!   bindings needs the same role as editing the assistant;
//! - the default is per organisation, not one global flag;
//! - an update is a compare-and-swap on `updatedAt`: a writer that lost the race gets a 409;
//! - the routes need an organisation: the open-source edition has no plan limits, but the cloud
//!   edition refuses a create or an update through [`crate::policy::AssistantPolicy`];
//! - every check goes through `agents_core::authz` (rows 80 and 120): building an agent is
//!   admin-only, using one needs a grant, and every list is filtered in SQL.

mod access;
mod bindings;
mod bodies;
mod core;
mod defaults;
mod mobile;
mod preferences;
mod wizard;
mod wizard_bodies;
mod wizard_tools;

use axum::Router;
use axum::http::HeaderMap;
use axum::routing::{get, post};
use chrono::NaiveDateTime;
use serde::Serialize;
use serde_json::Value;

use agents_contracts::error_codes::ErrorCode;
use agents_core::authz::{
    AgentRef, Decision, Grant, Permission, Principal, Resource, UnitTree, authorize,
};
use agents_core::org::OrgRole;
use agents_store::StoreError;
use agents_store::assistants::{self, AssistantRow};
use agents_store::grants::{self, GrantRow};

use crate::AppState;
use crate::auth::{CurrentUser, active_org};
use crate::http::ApiError;
use crate::http::time::iso;

/// The default model of a new assistant. The platform's own default model is a setting the
/// cloud edition owns, so the open-source port uses the house model.
const DEFAULT_MODEL: &str = "rantai/nano";

/// The emoji a new assistant gets when the caller names none.
const DEFAULT_EMOJI: &str = "🤖";

pub fn router() -> Router<AppState> {
    Router::new()
        // The web routes.
        .route("/api/assistants", get(core::list).post(core::create))
        .route(
            "/api/assistants/{id}",
            get(core::get_one)
                .put(core::update)
                .patch(core::update)
                .delete(core::delete),
        )
        .route(
            "/api/assistants/{id}/tools",
            get(bindings::list_tools).put(bindings::set_tools),
        )
        .route(
            "/api/assistants/{id}/skills",
            get(bindings::list_skills).put(bindings::set_skills),
        )
        .route(
            "/api/assistants/{id}/mcp-servers",
            get(bindings::list_mcp_servers).put(bindings::set_mcp_servers),
        )
        .route(
            "/api/assistants/{id}/workflows",
            get(bindings::list_workflows).put(bindings::set_workflows),
        )
        .route(
            "/api/assistants/{id}/default",
            post(defaults::set_org_default).delete(defaults::clear_org_default),
        )
        // Who may use or manage this one agent (§3.3).
        .route(
            "/api/assistants/{id}/access",
            get(access::list).put(access::replace),
        )
        .route(
            "/api/assistants/{id}/access/{grantId}",
            axum::routing::delete(access::revoke),
        )
        .route(
            "/api/user/default-assistant",
            get(defaults::get_user_default).put(defaults::set_user_default),
        )
        // The user's own settings: the assistant they chose and their sidebar.
        .route(
            "/api/user/preferences",
            get(preferences::get)
                .put(preferences::put)
                .patch(preferences::put),
        )
        // The agent-builder wizard.
        .route("/api/assistants/wizard/stream", post(wizard::stream))
        // The mobile mirror. The same handlers: they read the same rows and write the same
        // columns, only the way the caller signs in differs.
        .route(
            "/api/mobile/assistants",
            get(mobile::list).post(core::create),
        )
        .route(
            "/api/mobile/assistants/{id}",
            get(core::get_one)
                .put(core::update)
                .patch(core::update)
                .delete(core::delete),
        )
        .route(
            "/api/mobile/assistants/{id}/tools",
            get(bindings::list_tools).put(bindings::set_tools),
        )
        .route(
            "/api/mobile/assistants/{id}/skills",
            get(bindings::list_skills).put(bindings::set_skills),
        )
        .route(
            "/api/mobile/assistants/{id}/duplicate",
            post(mobile::duplicate),
        )
        .route(
            "/api/mobile/assistants/{id}/default",
            post(mobile::set_user_default),
        )
}

/// The caller and the organisation the request acts in.
pub(crate) struct Caller {
    pub user_id: String,
    /// The organisation the request acts in, when the caller has one.
    pub org_id: Option<String>,
    /// The caller's role in that organisation.
    pub role: Option<OrgRole>,
    pub is_platform_admin: bool,
}

impl Caller {
    /// The organisation the request acts in.
    ///
    /// The routes that read or write the assistants of an organisation need one: a caller
    /// without a membership gets a 403, where the old code carried on with no organisation at
    /// all and wrote a global assistant every user could see.
    pub(crate) fn org(&self) -> Result<&str, ApiError> {
        self.org_id.as_deref().ok_or_else(forbidden)
    }
}

/// The organisation the request acts in.
///
/// A caller without an accepted membership has none. A platform admin may edit a built-in
/// assistant without belonging to an organisation, so for one the organisation stays empty
/// instead of the request being refused.
pub(crate) async fn caller(
    state: &AppState,
    headers: &HeaderMap,
    user: &CurrentUser,
) -> Result<Caller, ApiError> {
    match active_org(state, headers, user).await {
        Ok(org) => Ok(Caller {
            user_id: user.id.clone(),
            org_id: Some(org.org_id),
            role: Some(org.role),
            is_platform_admin: user.is_platform_admin,
        }),
        Err(_) if user.is_platform_admin && !names_an_organisation(headers) => Ok(Caller {
            user_id: user.id.clone(),
            org_id: None,
            role: None,
            is_platform_admin: true,
        }),
        Err(e) => Err(e),
    }
}

/// Whether the caller named an organisation the request must act in.
fn names_an_organisation(headers: &HeaderMap) -> bool {
    headers
        .get("x-organization-id")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .is_some_and(|v| !v.is_empty())
}

/// The caller, and the organisation they act in when they have one.
///
/// A caller without an accepted membership has no organisation: the routes that only read
/// the caller's own rows (the preferences) use this one, so a user without an organisation
/// still gets their own settings. A caller who named an organisation they do not belong to
/// is refused.
pub(crate) async fn caller_or_no_org(
    state: &AppState,
    headers: &HeaderMap,
    user: &CurrentUser,
) -> Result<Caller, ApiError> {
    match active_org(state, headers, user).await {
        Ok(org) => Ok(Caller {
            user_id: user.id.clone(),
            org_id: Some(org.org_id),
            role: Some(org.role),
            is_platform_admin: user.is_platform_admin,
        }),
        Err(e) if e.code == ErrorCode::PermissionDenied && !names_an_organisation(headers) => {
            Ok(Caller {
                user_id: user.id.clone(),
                org_id: None,
                role: None,
                is_platform_admin: user.is_platform_admin,
            })
        }
        Err(e) => Err(e),
    }
}

/// The caller as `authz::authorize` sees them: their role and their units in the organisation
/// the request acts in.
///
/// A platform admin who belongs to no organisation may still edit a built-in assistant, so a
/// caller without one gets a principal of no organisation: it owns nothing, which is what
/// makes every org agent a 404 for it, while a built-in stays readable (and, for a platform
/// admin, editable).
pub(crate) async fn principal(db: &sqlx::PgPool, caller: &Caller) -> Result<Principal, ApiError> {
    let Some(org_id) = caller.org_id.as_deref() else {
        return Ok(Principal::new(
            caller.user_id.clone(),
            String::new(),
            caller.role.unwrap_or(OrgRole::Viewer),
            caller.is_platform_admin,
            Vec::new(),
            &UnitTree::default(),
        ));
    };
    agents_store::access::principal(db, &caller.user_id, org_id)
        .await
        .map_err(|e| store_error(&e))?
        .ok_or_else(forbidden)
}

/// The assistant reduced to what `authz` sees, with the grants stored in the caller's
/// organisation; a grant of another organisation never reaches the caller.
pub(crate) async fn agent_ref(
    db: &sqlx::PgPool,
    caller: &Caller,
    row: &AssistantRow,
) -> Result<AgentRef, ApiError> {
    let granted: Vec<Grant> = match caller.org_id.as_deref() {
        Some(org) if row.organization_id.as_deref() == Some(org) => grants::list(db, org, &row.id)
            .await
            .map_err(|e| store_error(&e))?
            .iter()
            .filter_map(GrantRow::to_grant)
            .collect(),
        _ => Vec::new(),
    };
    Ok(AgentRef {
        organization_id: row.organization_id.clone(),
        is_built_in: row.is_built_in,
        grants: granted,
    })
}

/// The decision, as the answer the caller gets: `Deny` is a 403 `permission_denied`, and
/// `NotFound` a 404 (§4: another organisation's resource is always 404, never 403).
pub(crate) fn decision(
    principal: &Principal,
    permission: Permission,
    resource: &Resource<'_>,
) -> Result<(), ApiError> {
    match authorize(principal, permission, resource) {
        Decision::Allow => Ok(()),
        Decision::Deny => Err(forbidden()),
        Decision::NotFound => Err(not_found()),
    }
}

/// Whether the caller may do `permission` on this assistant.
pub(crate) async fn authorize_agent(
    db: &sqlx::PgPool,
    caller: &Caller,
    row: &AssistantRow,
    permission: Permission,
) -> Result<(), ApiError> {
    let principal = principal(db, caller).await?;
    let agent = agent_ref(db, caller, row).await?;
    decision(&principal, permission, &Resource::Agent(&agent))
}

/// Whether the caller may do `permission` in the organisation itself: creating a agent,
/// listing or replacing an agent's grants. A grant never answers these: `agents.create` and
/// the grants of an agent are admin-only (§3.3).
pub(crate) async fn authorize_org(
    db: &sqlx::PgPool,
    caller: &Caller,
    permission: Permission,
) -> Result<(), ApiError> {
    let org_id = caller.org()?.to_owned();
    let principal = principal(db, caller).await?;
    decision(
        &principal,
        permission,
        &Resource::Org {
            organization_id: &org_id,
        },
    )
}

/// The assistant the request is about, when the caller may do `permission` on it.
///
/// An assistant that does not exist and one of another organisation are the same answer, a
/// 404; an assistant of the caller's own organisation that they may not act on is a 403.
pub(crate) async fn load_authorized(
    db: &sqlx::PgPool,
    caller: &Caller,
    id: &str,
    permission: Permission,
) -> Result<AssistantRow, ApiError> {
    let row = assistants::get(db, id).await.map_err(|e| store_error(&e))?;
    authorize_agent(db, caller, &row, permission).await?;
    Ok(row)
}

/// The answer to a request the caller may not make.
pub(crate) fn forbidden() -> ApiError {
    ApiError::new(ErrorCode::PermissionDenied)
}

/// The answer for a resource that does not exist, or belongs to another organisation.
pub(crate) fn not_found() -> ApiError {
    ApiError::new(ErrorCode::NotFound)
}

/// The store's failure, as the answer the caller sees.
pub(crate) fn store_error(e: &StoreError) -> ApiError {
    match e {
        StoreError::NotFound => ApiError::new(ErrorCode::NotFound),
        StoreError::Conflict => ApiError::new(ErrorCode::Conflict),
        StoreError::Db(err) => {
            tracing::error!(error = %err, "assistants store");
            ApiError::new(ErrorCode::Internal)
        }
    }
}

/// An assistant as the API returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssistantJson {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub emoji: String,
    pub system_prompt: String,
    pub model: String,
    pub use_knowledge_base: bool,
    pub knowledge_base_group_ids: Vec<String>,
    pub is_system_default: bool,
    pub is_built_in: bool,
    pub organization_id: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub live_chat_enabled: bool,
    pub avatar_s3_key: Option<String>,
    pub model_config: Option<Value>,
    pub opening_message: Option<String>,
    pub opening_questions: Vec<String>,
    pub guard_rails: Option<Value>,
    pub chat_config: Option<Value>,
    pub memory_config: Option<Value>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    /// How many tools are bound to it. Only the list carries it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_count: Option<i64>,
}

impl AssistantJson {
    /// The assistant as the single-assistant routes return it.
    pub(crate) fn from_row(row: &AssistantRow) -> Self {
        Self {
            id: row.id.clone(),
            name: row.name.clone(),
            description: row.description.clone(),
            emoji: row.emoji.clone(),
            system_prompt: row.system_prompt.clone(),
            model: row.model.clone(),
            use_knowledge_base: row.use_knowledge_base,
            knowledge_base_group_ids: row.knowledge_base_group_ids.clone(),
            is_system_default: row.is_system_default,
            is_built_in: row.is_built_in,
            organization_id: row.organization_id.clone(),
            created_by: row.created_by.clone(),
            updated_by: row.updated_by.clone(),
            live_chat_enabled: row.live_chat_enabled,
            avatar_s3_key: row.avatar_s3_key.clone(),
            model_config: row.model_config.clone(),
            opening_message: row.opening_message.clone(),
            opening_questions: row.opening_questions.clone(),
            guard_rails: row.guard_rails.clone(),
            chat_config: row.chat_config.clone(),
            memory_config: row.memory_config.clone(),
            tags: row.tags.clone(),
            created_at: iso(row.created_at),
            updated_at: iso(row.updated_at),
            tool_count: None,
        }
    }

    /// The assistant as the list returns it, with its tool count.
    pub(crate) fn from_row_with_tools(row: &AssistantRow, tool_count: i64) -> Self {
        Self {
            tool_count: Some(tool_count),
            ..Self::from_row(row)
        }
    }
}

/// The answer to a delete.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub(crate) struct SuccessJson {
    pub success: bool,
}

/// The version of the row a writer expects to change: the `If-Match` header, or the version the
/// row has now.
pub(crate) fn expected_version(
    headers: &HeaderMap,
    row: &AssistantRow,
) -> Result<NaiveDateTime, ApiError> {
    let Some(sent) = headers.get("if-match") else {
        return Ok(row.updated_at);
    };
    let Ok(text) = sent.to_str() else {
        return Err(bad_version());
    };
    let text = text.trim().trim_matches('"');
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(text) else {
        return Err(bad_version());
    };
    let parsed = parsed.naive_utc();
    if parsed != row.updated_at {
        // Somebody else saved the row since the caller read it.
        return Err(ApiError::new(ErrorCode::Conflict));
    }
    Ok(parsed)
}

/// A version the caller sent that is not a timestamp.
fn bad_version() -> ApiError {
    ApiError::from(vec![agents_core::validation::FieldError::new(
        "If-Match",
        "invalid_format",
        "This must be the updatedAt timestamp of the assistant.",
    )])
}

/// The body a request needs and did not send.
pub(crate) fn missing_body() -> ApiError {
    ApiError::from(vec![agents_core::validation::FieldError::new(
        "",
        "required",
        "A JSON body is required.",
    )])
}

/// A body that is not a JSON object.
pub(crate) fn not_an_object() -> ApiError {
    ApiError::from(vec![agents_core::validation::FieldError::new(
        "",
        "invalid_shape",
        "The body must be a JSON object.",
    )])
}
