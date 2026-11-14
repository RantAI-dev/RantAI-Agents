//! `GET` and `PUT /api/user/preferences` — the user's own settings.
//!
//! Old: `src/app/api/user/preferences/route.ts` and
//! `src/features/user/preferences/{service,repository,schema}.ts`.
//!
//! The row holds the assistant the user chose and their sidebar settings. The dashboard
//! reads them (`src/hooks/use-default-assistant.ts`,
//! `src/hooks/use-sidebar-preferences.ts`).
//!
//! What changed on the way (docs/port/differences.md):
//! - the assistant the user chooses must be one they may see: the old route looked the id
//!   up without the organisation, so any assistant in the database could be chosen;
//! - the errors use the standard body, and a bad body is a 400 with every bad field.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use serde::Serialize;
use serde_json::Value;

use agents_core::validation::FieldError;

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::json::Body;

use super::{caller_or_no_org, load_visible, missing_body, store_error};

/// `GET /api/user/preferences` — the user's settings.
pub(super) async fn get(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<PreferencesJson>, ApiError> {
    let preferences = agents_store::assistants::user_preference(&state.db, &user.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(preferences_json(
        &user.id,
        preferences
            .as_ref()
            .and_then(|p| p.default_assistant_id.clone()),
        preferences.as_ref().and_then(|p| p.sidebar_config.clone()),
    )))
}

/// `PUT /api/user/preferences` — the user's settings.
///
/// Only the fields the body carries are written: the old service updated "the fields
/// explicitly provided by the client".
pub(super) async fn put(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    body: Option<Body<Value>>,
) -> Result<Json<PreferencesJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let update = parse_update(&body)?;
    let caller = caller_or_no_org(&state, &headers, &user).await?;
    if let Some(Some(assistant_id)) = update.default_assistant_id.as_ref() {
        // An assistant the caller may not see is not found, not forbidden.
        load_visible(&state.db, &caller, assistant_id).await?;
    }
    if let Some(assistant_id) = update.default_assistant_id.clone() {
        agents_store::assistants::set_user_default(&state.db, &user.id, assistant_id.as_deref())
            .await
            .map_err(|e| store_error(&e))?;
    }
    if let Some(sidebar_config) = update.sidebar_config.clone() {
        agents_store::assistants::set_user_sidebar_config(
            &state.db,
            &user.id,
            sidebar_config.as_ref(),
        )
        .await
        .map_err(|e| store_error(&e))?;
    }
    let preferences = agents_store::assistants::user_preference(&state.db, &user.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(preferences_json(
        &user.id,
        preferences
            .as_ref()
            .and_then(|p| p.default_assistant_id.clone()),
        preferences.as_ref().and_then(|p| p.sidebar_config.clone()),
    )))
}

/// The user's settings, as the API returns them.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PreferencesJson {
    pub user_id: String,
    pub default_assistant_id: Option<String>,
    pub sidebar_config: Option<Value>,
}

/// The settings as the API returns them.
fn preferences_json(
    user_id: &str,
    default_assistant_id: Option<String>,
    sidebar_config: Option<Value>,
) -> PreferencesJson {
    PreferencesJson {
        user_id: user_id.to_owned(),
        default_assistant_id,
        sidebar_config,
    }
}

/// What the body asks to change.
#[derive(Debug, Default)]
struct Update {
    /// `Some(None)` clears the assistant, `None` leaves it as it is.
    default_assistant_id: Option<Option<String>>,
    /// `Some(None)` clears the sidebar settings, `None` leaves them as they are.
    sidebar_config: Option<Option<Value>>,
}

/// The body of a preferences update.
///
/// # Errors
/// The body is not an object, a field is of the wrong type, or a field is not part of the
/// request: every bad field is listed.
fn parse_update(body: &Value) -> Result<Update, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(super::not_an_object());
    };
    let mut errors: Vec<FieldError> = Vec::new();
    for name in object.keys() {
        if name != "defaultAssistantId" && name != "sidebarConfig" {
            errors.push(FieldError::new(
                format!("/{name}"),
                "unknown_field",
                "This field is not part of the request.",
            ));
        }
    }
    let mut update = Update::default();
    match object.get("defaultAssistantId") {
        None => {}
        Some(Value::Null) => update.default_assistant_id = Some(None),
        Some(Value::String(text)) => {
            // The old service trimmed the id and read an empty one as "no assistant".
            let trimmed = text.trim();
            update.default_assistant_id = Some((!trimmed.is_empty()).then(|| trimmed.to_owned()));
        }
        Some(_) => errors.push(FieldError::new(
            "/defaultAssistantId",
            "invalid_type",
            "This field must be an id or null.",
        )),
    }
    match object.get("sidebarConfig") {
        None => {}
        Some(Value::Null) => update.sidebar_config = Some(None),
        Some(value) => update.sidebar_config = Some(Some(value.clone())),
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(update)
}
