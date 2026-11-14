//! The body of a "replace the shares" request, and what is wrong with it.
//!
//! The body is a bare array of `{ subjectType, subjectId }`: the whole set of subjects the chat
//! is shared with. The level is always `view`, so it is not part of the body; the old zod schema
//! for grants had one, and this one deliberately does not.

use serde_json::Value;

use agents_core::authz::{Subject, SubjectType};
use agents_core::validation::FieldError;

use crate::http::ApiError;

/// The longest subject id the route takes.
const MAX_SUBJECT_ID: usize = 200;

/// The subjects a replace request asks for, with every bad entry listed.
///
/// # Errors
/// The body is not an array, an entry is not an object, a subject type or id is missing or
/// wrong, an entry names a field the request does not take, or two entries name the same
/// subject: every bad field is listed.
pub(super) fn parse_shares(body: &Value) -> Result<Vec<Subject>, ApiError> {
    let Some(items) = body.as_array() else {
        return Err(ApiError::from(vec![FieldError::new(
            "",
            "invalid_shape",
            "The body must be an array of shares.",
        )]));
    };
    let mut errors: Vec<FieldError> = Vec::new();
    let mut wanted: Vec<Subject> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let at = |field: &str| format!("/{index}/{field}");
        let Some(object) = item.as_object() else {
            errors.push(FieldError::new(
                format!("/{index}"),
                "invalid_type",
                "A share must be an object.",
            ));
            continue;
        };
        for name in object.keys() {
            if name != "subjectType" && name != "subjectId" {
                errors.push(FieldError::new(
                    at(name),
                    "unknown_field",
                    "This field is not part of the request.",
                ));
            }
        }
        let kind = match object.get("subjectType").and_then(Value::as_str) {
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
        let id = match object.get("subjectId").and_then(Value::as_str) {
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
        if let (Some(kind), Some(id)) = (kind, id) {
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
            wanted.push(Subject { kind, id });
        }
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(wanted)
}
