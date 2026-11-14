//! The request bodies of the assistant routes, and what is wrong with them.
//!
//! The create and update bodies are the ones `agents_core::assistant::input` knows: the same
//! fields, the same rules and the same JSON Pointer paths as the old zod schema. The binding
//! bodies are read by hand, because a deserializer stops at the first field it cannot read and
//! the caller must get every bad field at once.

use serde_json::Value;

use agents_core::assistant::input::{
    AssistantCreate, AssistantUpdate, validate_create_value, validate_update_value,
};
use agents_core::validation::FieldError;

use crate::http::ApiError;

/// The body of a create request.
pub(super) fn parse_create(body: &Value) -> Result<AssistantCreate, ApiError> {
    let errors = validate_create_value(body);
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    serde_json::from_value(body.clone()).map_err(|_| unreadable())
}

/// The body of an update request.
pub(super) fn parse_update(body: &Value) -> Result<AssistantUpdate, ApiError> {
    let errors = validate_update_value(body);
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    serde_json::from_value(body.clone()).map_err(|_| unreadable())
}

/// A body the validation passed but the reader cannot read.
fn unreadable() -> ApiError {
    ApiError::from(vec![FieldError::new(
        "",
        "invalid_shape",
        "The request body is not valid.",
    )])
}

/// The body of a binding request: one list of ids.
///
/// `min_len` is the shortest id the list accepts: the old schema wanted at least one character
/// for tools, MCP servers and workflows, and allowed an empty string for skills (the service
/// dropped those).
pub(super) fn parse_id_list(
    body: &Value,
    key: &str,
    min_len: usize,
) -> Result<Vec<Value>, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(crate::routes::assistants::not_an_object());
    };
    let mut errors = Vec::new();
    for name in object.keys() {
        if name != key {
            errors.push(FieldError::new(
                format!("/{name}"),
                "unknown_field",
                "This field is not part of the request.",
            ));
        }
    }
    let mut ids = Vec::new();
    match object.get(key) {
        None => errors.push(FieldError::new(
            format!("/{key}"),
            "required",
            "This field is required.",
        )),
        Some(Value::Array(items)) => {
            for (index, item) in items.iter().enumerate() {
                let pointer = format!("/{key}/{index}");
                match item {
                    Value::String(text) if text.chars().count() >= min_len => {
                        ids.push(item.clone());
                    }
                    Value::String(_) => errors.push(FieldError::new(
                        pointer,
                        "required",
                        "This id must not be empty.",
                    )),
                    _ => errors.push(FieldError::new(
                        pointer,
                        "invalid_type",
                        "This id must be a string.",
                    )),
                }
            }
        }
        Some(_) => errors.push(FieldError::new(
            format!("/{key}"),
            "invalid_type",
            "This field must be an array of ids.",
        )),
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(ids)
}

/// The body of a "make this the user's default assistant" request.
pub(super) fn parse_user_default(body: &Value) -> Result<Option<String>, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(crate::routes::assistants::not_an_object());
    };
    let mut errors = Vec::new();
    for name in object.keys() {
        if name != "assistantId" {
            errors.push(FieldError::new(
                format!("/{name}"),
                "unknown_field",
                "This field is not part of the request.",
            ));
        }
    }
    let mut assistant_id = None;
    match object.get("assistantId") {
        None => errors.push(FieldError::new(
            "/assistantId",
            "required",
            "This field is required.",
        )),
        Some(Value::Null) => {}
        Some(Value::String(text)) => {
            if text.trim().is_empty() {
                errors.push(FieldError::new(
                    "/assistantId",
                    "required",
                    "This id must not be empty.",
                ));
            } else {
                assistant_id = Some(text.trim().to_owned());
            }
        }
        Some(_) => errors.push(FieldError::new(
            "/assistantId",
            "invalid_type",
            "This id must be a string or null.",
        )),
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(assistant_id)
}
