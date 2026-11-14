//! The default assistant: the organisation's, and the user's own.
//!
//! Old: `src/app/api/assistants/[id]/default/route.ts`, `src/app/api/user/default-assistant/route.ts`
//! and `src/features/assistants/default/*`.
//!
//! The organisation's default lives on the assistant row and belongs to that organisation only
//! (docs/port/differences.md, row 27). Setting it needs a manager of the organisation; a built-in
//! cannot be an organisation's default.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use serde::Serialize;
use serde_json::Value;

use agents_contracts::error_codes::ErrorCode;
use agents_core::assistant::access::{self, Action};
use agents_store::assistants::{self, DefaultSource};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::json::Body;

use super::bodies::parse_user_default;
use super::{
    AssistantJson, actor, caller, forbidden, load_visible, missing_body, store_error, target,
};

/// `POST /api/assistants/{id}/default` — make this the organisation's default.
pub(super) async fn set_org_default(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<AssistantJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let org_id = caller.org()?.to_owned();
    let row = load_visible(&state.db, &caller, &id).await?;
    if !access::can(&actor(&caller), Action::SetDefault, &target(&row)) {
        return Err(forbidden());
    }
    assistants::set_org_default(&state.db, &org_id, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    let updated = assistants::get(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(AssistantJson::from_row(&updated)))
}

/// `DELETE /api/assistants/{id}/default` — the organisation has no default any more.
pub(super) async fn clear_org_default(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<AssistantJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let org_id = caller.org()?.to_owned();
    let row = load_visible(&state.db, &caller, &id).await?;
    if !access::can(&actor(&caller), Action::SetDefault, &target(&row)) {
        return Err(forbidden());
    }
    if !row.is_system_default {
        // The row is not the default: the state is not what the request needs.
        return Err(ApiError::new(ErrorCode::Conflict)
            .message("This assistant is not the default of the organisation."));
    }
    assistants::clear_org_default(&state.db, &org_id)
        .await
        .map_err(|e| store_error(&e))?;
    let updated = assistants::get(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(AssistantJson::from_row(&updated)))
}

/// `GET /api/user/default-assistant` — the assistant a new chat starts with.
pub(super) async fn get_user_default(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<Json<DefaultJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    Ok(Json(default_json(&state, &caller, &user.id).await?))
}

/// `PUT /api/user/default-assistant` — the user's own default assistant.
///
/// The body is `{ "assistantId": "<id>" }`; `null` clears it. The assistant must be one the
/// caller may see.
pub(super) async fn set_user_default(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    body: Option<Body<Value>>,
) -> Result<Json<DefaultJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let assistant_id = parse_user_default(&body)?;
    let caller = caller(&state, &headers, &user).await?;
    if let Some(id) = &assistant_id {
        // An assistant of another organisation is not found, not forbidden.
        load_visible(&state.db, &caller, id).await?;
    }
    assistants::set_user_default(&state.db, &user.id, assistant_id.as_deref())
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(default_json(&state, &caller, &user.id).await?))
}

/// The default assistant and where it came from.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DefaultJson {
    pub assistant: Option<AssistantJson>,
    pub source: String,
}

/// The default of the user in the organisation, as the API returns it.
pub(super) async fn default_json(
    state: &AppState,
    caller: &super::Caller,
    user_id: &str,
) -> Result<DefaultJson, ApiError> {
    let org_id = caller.org()?;
    let resolved = assistants::resolve_default_with_source(&state.db, user_id, org_id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(DefaultJson {
        assistant: resolved.assistant.as_ref().map(AssistantJson::from_row),
        source: source_name(resolved.source).to_owned(),
    })
}

/// The name the API sends for a source.
pub(super) fn source_name(source: DefaultSource) -> &'static str {
    source.as_str()
}
