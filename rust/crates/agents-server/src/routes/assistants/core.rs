//! The assistant rows themselves: list, create, read, update and delete.
//!
//! Old: `src/app/api/assistants/route.ts`, `src/app/api/assistants/[id]/route.ts` and
//! `src/features/assistants/core/service.ts`.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use serde_json::Value;

use agents_core::assistant::input::{AssistantCreate, AssistantUpdate};
use agents_core::authz::Permission;
use agents_core::org::OrgRole;
use agents_store::assistants::{self, AssistantFields, AssistantRow};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::json::Body;
use crate::policy::{PolicyAction, PolicyContext};

use super::bodies::{parse_create, parse_update};
use super::{
    AssistantJson, DEFAULT_EMOJI, DEFAULT_MODEL, SuccessJson, authorize_org, caller,
    expected_version, forbidden, load_authorized, missing_body, principal, store_error,
};

/// `GET /api/assistants` — the assistants the caller may use.
///
/// The list is filtered in SQL (`access::visible_assistants`), by the same rule as
/// `authz::authorize`: never loaded broadly and filtered in memory (§4).
pub(super) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<Json<Vec<AssistantJson>>, ApiError> {
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
    Ok(Json(items))
}

/// `POST /api/assistants` — a new assistant in the caller's organisation.
pub(super) async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    body: Option<Body<Value>>,
) -> Result<(StatusCode, Json<AssistantJson>), ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let input = parse_create(&body)?;
    let caller = caller(&state, &headers, &user).await?;
    let org_id = caller.org()?.to_owned();
    // Only an owner or an admin builds agents (§3.2; differences row 80). The check is on the
    // organisation, so a `manage` grant on one agent never answers it.
    authorize_org(&state.db, &caller, Permission::AgentsCreate).await?;
    let assistant_count = assistants::list_for_org(&state.db, &org_id)
        .await
        .map_err(|e| store_error(&e))?
        .len();
    state.policy.check_create(&PolicyContext {
        user_id: &caller.user_id,
        organization_id: Some(&org_id),
        role: caller.role.unwrap_or(OrgRole::Viewer),
        action: PolicyAction::Create,
        name: &input.name,
        model: input
            .model
            .as_ref()
            .and_then(|m| m.as_ref())
            .map(String::as_str),
        assistant_count,
    })?;
    let fields = fields_from_create(&input);
    let row = assistants::create(&state.db, &org_id, &user.id, &fields)
        .await
        .map_err(|e| store_error(&e))?;
    Ok((StatusCode::CREATED, Json(AssistantJson::from_row(&row))))
}

/// `GET /api/assistants/{id}` — one assistant.
pub(super) async fn get_one(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<AssistantJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let row = load_authorized(&state.db, &caller, &id, Permission::AgentsUse).await?;
    Ok(Json(AssistantJson::from_row(&row)))
}

/// `PUT` and `PATCH /api/assistants/{id}` — change an assistant.
///
/// The write is a compare-and-swap on `updatedAt`: a writer that lost the race gets a 409 and
/// changes nothing. The version the caller expects to change travels in the `If-Match` header;
/// without it the row's own version is used, so two writers that overlap still conflict.
pub(super) async fn update(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<AssistantJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let input = parse_update(&body)?;
    let caller = caller(&state, &headers, &user).await?;
    let row = load_authorized(&state.db, &caller, &id, Permission::AgentsManage).await?;
    // A built-in keeps its name and its knowledge-base settings: only a platform admin gets
    // here, and the old service dropped those three fields for a built-in.
    let input = if row.is_built_in {
        input.for_built_in()
    } else {
        input
    };
    let fields = merge_fields(&row, &input);
    state.policy.check_update(&PolicyContext {
        user_id: &caller.user_id,
        organization_id: row.organization_id.as_deref(),
        role: caller.role.unwrap_or(OrgRole::Viewer),
        action: PolicyAction::Update,
        name: &fields.name,
        model: Some(fields.model.as_str()),
        assistant_count: 0,
    })?;
    let expected = expected_version(&headers, &row)?;
    let updated = assistants::update(&state.db, &id, &user.id, &fields, expected)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(AssistantJson::from_row(&updated)))
}

/// `DELETE /api/assistants/{id}` — remove an assistant.
pub(super) async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<SuccessJson>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let row = load_authorized(&state.db, &caller, &id, Permission::AgentsManage).await?;
    // A built-in cannot be deleted by anyone, a platform admin included (differences row 25,
    // which `parity_assistants.rs` pins).
    if row.is_built_in {
        return Err(forbidden());
    }
    // A `manage` grant edits one agent but never removes it (§3.3, row 124): deleting is
    // `agents.manage` in the organisation, which no grant answers.
    authorize_org(&state.db, &caller, Permission::AgentsManage).await?;
    assistants::delete(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SuccessJson { success: true }))
}

/// The columns a create request writes. A field the caller did not send keeps the default the
/// row already has.
fn fields_from_create(input: &AssistantCreate) -> AssistantFields {
    AssistantFields {
        name: input.name.clone(),
        description: input.description.clone().flatten(),
        emoji: input
            .emoji
            .clone()
            .flatten()
            .unwrap_or_else(|| DEFAULT_EMOJI.to_owned()),
        system_prompt: input.system_prompt.clone(),
        model: input
            .model
            .clone()
            .flatten()
            .unwrap_or_else(|| DEFAULT_MODEL.to_owned()),
        use_knowledge_base: input.use_knowledge_base.unwrap_or(false),
        knowledge_base_group_ids: input.knowledge_base_group_ids.clone().unwrap_or_default(),
        live_chat_enabled: input.live_chat_enabled.unwrap_or(false),
        avatar_s3_key: input.avatar_s3_key.clone().flatten(),
        model_config: input.model_config.clone().flatten(),
        opening_message: input.opening_message.clone().flatten(),
        opening_questions: input.opening_questions.clone().unwrap_or_default(),
        guard_rails: input.guard_rails.clone().flatten(),
        chat_config: input.chat_config.clone().flatten(),
        memory_config: input.memory_config.clone().flatten(),
        tags: input.tags.clone().unwrap_or_default(),
    }
}

/// The columns an update request writes: the request's fields on top of the row's own values.
fn merge_fields(row: &AssistantRow, input: &AssistantUpdate) -> AssistantFields {
    AssistantFields {
        name: input.name.clone().unwrap_or_else(|| row.name.clone()),
        description: input
            .description
            .clone()
            .unwrap_or_else(|| row.description.clone()),
        emoji: input
            .emoji
            .clone()
            .flatten()
            .unwrap_or_else(|| row.emoji.clone()),
        system_prompt: input
            .system_prompt
            .clone()
            .unwrap_or_else(|| row.system_prompt.clone()),
        model: input
            .model
            .clone()
            .flatten()
            .unwrap_or_else(|| row.model.clone()),
        use_knowledge_base: input.use_knowledge_base.unwrap_or(row.use_knowledge_base),
        knowledge_base_group_ids: input
            .knowledge_base_group_ids
            .clone()
            .unwrap_or_else(|| row.knowledge_base_group_ids.clone()),
        live_chat_enabled: input.live_chat_enabled.unwrap_or(row.live_chat_enabled),
        avatar_s3_key: input
            .avatar_s3_key
            .clone()
            .unwrap_or_else(|| row.avatar_s3_key.clone()),
        model_config: input
            .model_config
            .clone()
            .unwrap_or_else(|| row.model_config.clone()),
        opening_message: input
            .opening_message
            .clone()
            .unwrap_or_else(|| row.opening_message.clone()),
        opening_questions: input
            .opening_questions
            .clone()
            .unwrap_or_else(|| row.opening_questions.clone()),
        guard_rails: input
            .guard_rails
            .clone()
            .unwrap_or_else(|| row.guard_rails.clone()),
        chat_config: input
            .chat_config
            .clone()
            .unwrap_or_else(|| row.chat_config.clone()),
        memory_config: input
            .memory_config
            .clone()
            .unwrap_or_else(|| row.memory_config.clone()),
        tags: input.tags.clone().unwrap_or_else(|| row.tags.clone()),
    }
}
