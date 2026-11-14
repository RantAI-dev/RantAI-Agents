//! The mobile mirror of the assistant API: `/api/mobile/assistants/**`.
//!
//! Old: `src/app/api/mobile/assistants/**`. The mobile app signs in with a Bearer token; the
//! routes read the same rows and write the same columns as the web ones, so they share the
//! handlers.
//!
//! What changed on the way: the mobile create, duplicate and update run the same policy hook as
//! the web ones (the old mobile routes skipped the cloud plan cap and the model plan check),
//! and the routes take the session cookie as well as the Bearer token.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use serde::Serialize;
use serde_json::Value;

use agents_core::authz::Permission;
use agents_core::org::OrgRole;
use agents_store::assistants::{self, AssistantFields, UserPreference};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::policy::{PolicyAction, PolicyContext};

use super::{AssistantJson, caller, load_authorized, principal, store_error};

/// `GET /api/mobile/assistants` — the assistants of the organisation and the user's own default.
pub(super) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<Json<MobileListJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let org_id = caller.org()?.to_owned();
    let principal = principal(&state.db, &caller).await?;
    let rows = agents_store::access::visible_assistants(&state.db, &principal)
        .await
        .map_err(|e| store_error(&e))?;
    let counts = assistants::tool_counts(&state.db, &org_id)
        .await
        .map_err(|e| store_error(&e))?;
    let items = rows
        .iter()
        .map(|row| {
            let count = counts
                .iter()
                .find(|(id, _)| id == &row.id)
                .map_or(0, |(_, count)| *count);
            AssistantJson::from_row_with_tools(row, count)
        })
        .collect();
    let preference = assistants::user_preference(&state.db, &user.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(MobileListJson {
        assistants: items,
        default_assistant_id: preference.and_then(|p| p.default_assistant_id),
    }))
}

/// The mobile list: the assistants and the user's own default.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MobileListJson {
    pub assistants: Vec<AssistantJson>,
    pub default_assistant_id: Option<String>,
}

/// `POST /api/mobile/assistants/{id}/duplicate` — a copy of an assistant.
///
/// The copy carries the configuration over; the bindings are not copied, as before.
pub(super) async fn duplicate(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<(StatusCode, Json<AssistantJson>), ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let org_id = caller.org()?.to_owned();
    let source = load_authorized(&state.db, &caller, &id, Permission::AgentsUse).await?;
    // A copy is a new assistant: only an owner or an admin creates one (§3.2), and no grant
    // answers that.
    super::authorize_org(&state.db, &caller, Permission::AgentsCreate).await?;
    let mut fields = AssistantFields::from(&source);
    fields.name = format!("{} (Copy)", source.name);
    let assistant_count = assistants::list_for_org(&state.db, &org_id)
        .await
        .map_err(|e| store_error(&e))?
        .len();
    state.policy.check_create(&PolicyContext {
        user_id: &caller.user_id,
        organization_id: Some(&org_id),
        role: caller.role.unwrap_or(OrgRole::Viewer),
        action: PolicyAction::Create,
        name: &fields.name,
        model: Some(fields.model.as_str()),
        assistant_count,
    })?;
    let created = assistants::create(&state.db, &org_id, &user.id, &fields)
        .await
        .map_err(|e| store_error(&e))?;
    Ok((StatusCode::CREATED, Json(AssistantJson::from_row(&created))))
}

/// `POST /api/mobile/assistants/{id}/default` — the user's own default assistant.
///
/// Every member may set it: it is the user's choice, not the organisation's.
pub(super) async fn set_user_default(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<PreferencesJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    // Only an assistant the user may use may become their default.
    load_authorized(&state.db, &caller, &id, Permission::AgentsUse).await?;
    assistants::set_user_default(&state.db, &user.id, Some(&id))
        .await
        .map_err(|e| store_error(&e))?;
    let preference = assistants::user_preference(&state.db, &user.id)
        .await
        .map_err(|e| store_error(&e))?
        .unwrap_or(UserPreference {
            default_assistant_id: None,
            sidebar_config: None,
        });
    Ok(Json(PreferencesJson {
        user_id: user.id.clone(),
        default_assistant_id: preference.default_assistant_id,
        sidebar_config: preference.sidebar_config,
    }))
}

/// The user's preferences, as the old route returned them.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PreferencesJson {
    pub user_id: String,
    pub default_assistant_id: Option<String>,
    pub sidebar_config: Option<Value>,
}
