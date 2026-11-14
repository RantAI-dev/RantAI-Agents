//! Who may use or manage one agent: `/api/assistants/{id}/access`.
//!
//! New in slice S4 (`docs/design/identity-and-access.md` §3.3, §3.7); the TypeScript had no
//! such route. A grant names the organisation, one of its units (and so every unit below it) or
//! one of its members, and gives `use` or `manage`.
//!
//! What the design says, and what this follows when it is silent:
//!
//! - Editing an agent's grants is `agents.manage` *in the organisation*: a holder of a `manage`
//!   grant edits the agent, but never its grants and never creates one (§3.3: "`manage` on a
//!   grant lets a non-admin edit that one agent. This is optional delegation; `agents.create`
//!   stays admin-only"). The design does not say who may change grants; the safer reading is
//!   that a delegate cannot widen their own audience, so the check is on the organisation
//!   itself, where a grant never answers.
//! - A built-in agent has no grants and no organisation (`grants::set` refuses one), so all
//!   three routes answer 404 for it: there is nothing to share.
//! - Every change writes an `AuditLog` row (§3.7) in the change's own transaction (the store
//!   does it): `rbac.grant.set` for a grant that was added or whose level changed,
//!   `rbac.grant.revoke` for one that went.

use std::collections::BTreeMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use serde::Serialize;
use serde_json::Value;

use agents_core::authz::{GrantLevel, Permission, Subject, SubjectType};
use agents_core::validation::FieldError;
use agents_store::assistants::AssistantRow;
use agents_store::audit::Actor;
use agents_store::grants::{self, GrantRow};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::client_ip::ClientIp;
use crate::http::json::Body;
use crate::http::time::iso;

use super::{
    Caller, SuccessJson, authorize_org, caller, load_authorized, missing_body, not_found,
    store_error,
};

/// The longest subject id the route takes.
const MAX_SUBJECT_ID: usize = 200;

/// `GET /api/assistants/{id}/access` — the grants on one agent, with what they name.
pub(super) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<GrantsJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let row = manageable(&state, &caller, &id).await?;
    let org_id = caller.org()?.to_owned();
    let rows = grants::list(&state.db, &org_id, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(grants_json(&state, &org_id, rows).await?))
}

/// `PUT /api/assistants/{id}/access` — replace every grant on the agent with the body's list.
///
/// The body is a bare array: `[{ "subjectType": "org"|"unit"|"user", "subjectId": "<id>",
/// "level": "use"|"manage" }]`. An empty array shares it with nobody but the organisation's
/// admins.
pub(super) async fn replace(
    State(state): State<AppState>,
    headers: HeaderMap,
    ip: ClientIp,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<GrantsJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let wanted = parse_grants(&body)?;
    let caller = caller(&state, &headers, &user).await?;
    let row = manageable(&state, &caller, &id).await?;
    let org_id = caller.org()?.to_owned();
    let ip = ip.text();
    let actor = Actor {
        user_id: &caller.user_id,
        ip_address: ip.as_deref(),
    };
    let after = grants::replace_all(&state.db, &org_id, &row.id, &wanted, &actor)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(grants_json(&state, &org_id, after).await?))
}

/// `DELETE /api/assistants/{id}/access/{grantId}` — take one grant away.
pub(super) async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    ip: ClientIp,
    user: CurrentUser,
    Path((id, grant_id)): Path<(String, String)>,
) -> Result<Json<SuccessJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let row = manageable(&state, &caller, &id).await?;
    let org_id = caller.org()?.to_owned();
    let ip = ip.text();
    let actor = Actor {
        user_id: &caller.user_id,
        ip_address: ip.as_deref(),
    };
    grants::revoke_by_id(&state.db, &org_id, &row.id, &grant_id, &actor)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SuccessJson { success: true }))
}

/// The agent whose grants this request changes: one the caller may reach, and whose
/// organisation they administer. A `manage` grant is not enough (§3.3, the module doc).
async fn manageable(state: &AppState, caller: &Caller, id: &str) -> Result<AssistantRow, ApiError> {
    let row = load_authorized(&state.db, caller, id, Permission::AgentsUse).await?;
    authorize_org(&state.db, caller, Permission::AgentsManage).await?;
    if row.is_built_in {
        // A built-in belongs to no organisation: there is nothing to share, and no grant a
        // caller could add (§3.3).
        return Err(not_found());
    }
    Ok(row)
}

/// The grants as the API returns them.
///
/// The list is not paginated, unlike the rest of `docs/conventions.md`: `PUT` replaces the
/// whole set, so the panel has to show every grant of the agent, and an agent's grants are
/// bounded by its organisation's subjects. `nextCursor` is therefore always null.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GrantsJson {
    pub data: Vec<GrantJson>,
    pub next_cursor: Option<String>,
}

/// One grant, with the name of what it names.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GrantJson {
    pub id: String,
    pub subject_type: String,
    pub subject_id: String,
    /// The organisation's, the unit's or the user's name. Absent when the subject is gone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject_name: Option<String>,
    pub level: String,
    pub granted_by: String,
    pub created_at: String,
}

/// The rows as the API returns them, with the names of their subjects.
async fn grants_json(
    state: &AppState,
    org_id: &str,
    rows: Vec<GrantRow>,
) -> Result<GrantsJson, ApiError> {
    let mut names: BTreeMap<String, Option<String>> = BTreeMap::new();
    let mut data = Vec::with_capacity(rows.len());
    for row in rows {
        let subject = row.to_grant().map(|g| g.subject);
        let subject_name = match &subject {
            Some(subject) => {
                if let Some(name) = names.get(&row.subject_id) {
                    name.clone()
                } else {
                    let name = grants::subject_name(&state.db, org_id, subject)
                        .await
                        .map_err(|e| store_error(&e))?;
                    names.insert(row.subject_id.clone(), name.clone());
                    name
                }
            }
            None => None,
        };
        data.push(GrantJson {
            id: row.id,
            subject_type: row.subject_type,
            subject_id: row.subject_id,
            subject_name,
            level: row.level,
            granted_by: row.granted_by,
            created_at: iso(row.created_at),
        });
    }
    Ok(GrantsJson {
        data,
        next_cursor: None,
    })
}

/// The grant list a replace request asks for, with every bad entry listed.
///
/// # Errors
/// The body is not an array, an entry is not an object, a subject type or level is unknown, a
/// subject id is empty or too long, an entry names a field the request does not take, or two
/// entries name the same subject: every bad field is listed.
fn parse_grants(body: &Value) -> Result<Vec<(Subject, GrantLevel)>, ApiError> {
    let Some(items) = body.as_array() else {
        return Err(ApiError::from(vec![FieldError::new(
            "",
            "invalid_shape",
            "The body must be an array of grants.",
        )]));
    };
    let mut errors: Vec<FieldError> = Vec::new();
    let mut wanted: Vec<(Subject, GrantLevel)> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let at = |field: &str| format!("/{index}/{field}");
        let Some(object) = item.as_object() else {
            errors.push(FieldError::new(
                format!("/{index}"),
                "invalid_type",
                "A grant must be an object.",
            ));
            continue;
        };
        for name in object.keys() {
            if name != "subjectType" && name != "subjectId" && name != "level" {
                errors.push(FieldError::new(
                    at(name),
                    "unknown_field",
                    "This field is not part of the request.",
                ));
            }
        }
        let subject_type = match object.get("subjectType").and_then(Value::as_str) {
            Some(text) => match SubjectType::parse(text) {
                Some(kind) => Some(kind),
                None => {
                    errors.push(FieldError::new(
                        at("subjectType"),
                        "invalid_value",
                        "This field must be one of: org, unit, user.",
                    ));
                    None
                }
            },
            None => {
                errors.push(FieldError::new(
                    at("subjectType"),
                    "required",
                    "This field is required.",
                ));
                None
            }
        };
        let subject_id = match object.get("subjectId").and_then(Value::as_str) {
            Some(text) if text.trim().is_empty() => {
                errors.push(FieldError::new(
                    at("subjectId"),
                    "too_short",
                    "This field must not be empty.",
                ));
                None
            }
            Some(text) if text.chars().count() > MAX_SUBJECT_ID => {
                errors.push(FieldError::new(
                    at("subjectId"),
                    "too_long",
                    format!("This field must be at most {MAX_SUBJECT_ID} characters."),
                ));
                None
            }
            Some(text) => Some(text.to_owned()),
            None => {
                errors.push(FieldError::new(
                    at("subjectId"),
                    "required",
                    "This field is required.",
                ));
                None
            }
        };
        let level = match object.get("level").and_then(Value::as_str) {
            Some(text) => match GrantLevel::parse(text) {
                Some(level) => Some(level),
                None => {
                    errors.push(FieldError::new(
                        at("level"),
                        "invalid_value",
                        "This field must be one of: use, manage.",
                    ));
                    None
                }
            },
            None => {
                errors.push(FieldError::new(
                    at("level"),
                    "required",
                    "This field is required.",
                ));
                None
            }
        };
        if let (Some(kind), Some(id), Some(level)) = (subject_type, subject_id, level) {
            let key = format!("{}:{id}", kind.as_str());
            if seen.contains(&key) {
                errors.push(FieldError::new(
                    at("subjectId"),
                    "duplicate",
                    "This subject is named twice in the same request.",
                ));
                continue;
            }
            seen.push(key);
            wanted.push((Subject { kind, id }, level));
        }
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(wanted)
}
