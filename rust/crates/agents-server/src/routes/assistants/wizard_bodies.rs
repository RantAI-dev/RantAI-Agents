//! The body of a wizard stream request, and what is wrong with it.
//!
//! Old: `src/features/assistants/wizard/schema.ts` (`WizardStreamRequestSchema`,
//! `WizardMessageSchema` and `WizardDraftSchema`).
//!
//! The draft is read and checked but not sent to the model: the old service took it and
//! never used it, and the wizard's prompt is built from the messages alone.

use serde_json::{Map, Value};

use agents_core::validation::FieldError;

use crate::http::ApiError;

/// The most messages one request may carry.
const MAX_MESSAGES: usize = 40;

/// The most characters one message may carry.
const MAX_CONTENT: usize = 4000;

/// The most characters a message id may carry.
const MAX_ID: usize = 64;

/// One message of the conversation the caller sends.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct WizardMessage {
    /// `user`, `assistant` or `system`. The system ones are dropped: the wizard's prompt
    /// comes from `streamText({ system })`, the way the old code did it.
    pub role: String,
    pub content: String,
}

/// The request, once it is valid.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct WizardRequest {
    pub messages: Vec<WizardMessage>,
}

/// The body of a wizard stream request.
///
/// # Errors
/// The body is not an object, a message is not a message, or the draft has a field of the
/// wrong type: every bad field is listed.
pub(super) fn parse(body: &Value) -> Result<WizardRequest, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(crate::routes::assistants::not_an_object());
    };
    let mut errors: Vec<FieldError> = Vec::new();
    let messages = read_messages(object, &mut errors);
    read_draft(object, &mut errors);
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(WizardRequest {
        messages: messages.unwrap_or_default(),
    })
}

/// The conversation the caller sends.
fn read_messages(
    object: &Map<String, Value>,
    errors: &mut Vec<FieldError>,
) -> Option<Vec<WizardMessage>> {
    let Some(Value::Array(items)) = object.get("messages") else {
        errors.push(match object.get("messages") {
            Some(_) => FieldError::new(
                "/messages",
                "invalid_type",
                "This field must be an array of messages.",
            ),
            None => FieldError::new("/messages", "required", "This field is required."),
        });
        return None;
    };
    if items.len() > MAX_MESSAGES {
        errors.push(FieldError::new(
            "/messages",
            "out_of_range",
            "There must be at most 40 messages.",
        ));
        return None;
    }
    let mut messages = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        let pointer = format!("/messages/{index}");
        let Some(message) = item.as_object() else {
            errors.push(FieldError::new(
                pointer,
                "invalid_type",
                "This must be a message object.",
            ));
            continue;
        };
        let role = read_role(message, &pointer, errors);
        let content = read_string(message, "content", &pointer, errors, Some(MAX_CONTENT));
        let id = read_string(message, "id", &pointer, errors, Some(MAX_ID));
        if let (Some(role), Some(content)) = (role, content) {
            if id.is_none() {
                errors.push(FieldError::new(
                    format!("{pointer}/id"),
                    "required",
                    "This field is required.",
                ));
            }
            messages.push(WizardMessage { role, content });
        }
    }
    Some(messages)
}

/// The role of one message.
fn read_role(
    message: &Map<String, Value>,
    pointer: &str,
    errors: &mut Vec<FieldError>,
) -> Option<String> {
    let Some(role) = message.get("role") else {
        errors.push(FieldError::new(
            format!("{pointer}/role"),
            "required",
            "This field is required.",
        ));
        return None;
    };
    let Some(role) = role.as_str() else {
        errors.push(FieldError::new(
            format!("{pointer}/role"),
            "invalid_type",
            "This field must be a string.",
        ));
        return None;
    };
    if !matches!(role, "user" | "assistant" | "system") {
        errors.push(FieldError::new(
            format!("{pointer}/role"),
            "invalid_value",
            "This field must be user, assistant or system.",
        ));
        return None;
    }
    Some(role.to_owned())
}

/// One string field of an object.
fn read_string(
    object: &Map<String, Value>,
    key: &str,
    pointer: &str,
    errors: &mut Vec<FieldError>,
    max: Option<usize>,
) -> Option<String> {
    match object.get(key) {
        None => {
            errors.push(FieldError::new(
                format!("{pointer}/{key}"),
                "required",
                "This field is required.",
            ));
            None
        }
        Some(Value::String(text)) => {
            if let Some(max) = max
                && text.chars().count() > max
            {
                errors.push(FieldError::new(
                    format!("{pointer}/{key}"),
                    "out_of_range",
                    "This field is too long.",
                ));
                return None;
            }
            Some(text.clone())
        }
        Some(_) => {
            errors.push(FieldError::new(
                format!("{pointer}/{key}"),
                "invalid_type",
                "This field must be a string.",
            ));
            None
        }
    }
}

/// The draft: checked, then dropped.
fn read_draft(object: &Map<String, Value>, errors: &mut Vec<FieldError>) {
    let Some(draft) = object.get("draft") else {
        errors.push(FieldError::new(
            "/draft",
            "required",
            "This field is required.",
        ));
        return;
    };
    let Some(draft) = draft.as_object() else {
        errors.push(FieldError::new(
            "/draft",
            "invalid_type",
            "This field must be an object.",
        ));
        return;
    };
    for key in [
        "name",
        "description",
        "emoji",
        "systemPrompt",
        "model",
        "openingMessage",
    ] {
        check_optional_string(draft, key, errors);
    }
    for key in [
        "tags",
        "openingQuestions",
        "selectedToolIds",
        "selectedSkillIds",
        "selectedMcpServerIds",
        "selectedWorkflowIds",
        "knowledgeBaseGroupIds",
    ] {
        check_optional_string_array(draft, key, errors);
    }
    for key in ["liveChatEnabled", "useKnowledgeBase"] {
        check_optional_bool(draft, key, errors);
    }
    for key in ["memoryConfig", "modelConfig", "chatConfig", "guardRails"] {
        check_optional_object(draft, key, errors);
    }
}

/// An optional string field of the draft.
fn check_optional_string(draft: &Map<String, Value>, key: &str, errors: &mut Vec<FieldError>) {
    if let Some(value) = draft.get(key)
        && !value.is_string()
    {
        errors.push(FieldError::new(
            format!("/draft/{key}"),
            "invalid_type",
            "This field must be a string.",
        ));
    }
}

/// An optional list of strings field of the draft.
fn check_optional_string_array(
    draft: &Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) {
    let Some(value) = draft.get(key) else {
        return;
    };
    let Some(items) = value.as_array() else {
        errors.push(FieldError::new(
            format!("/draft/{key}"),
            "invalid_type",
            "This field must be an array of strings.",
        ));
        return;
    };
    for (index, item) in items.iter().enumerate() {
        if !item.is_string() {
            errors.push(FieldError::new(
                format!("/draft/{key}/{index}"),
                "invalid_type",
                "This must be a string.",
            ));
        }
    }
}

/// An optional boolean field of the draft.
fn check_optional_bool(draft: &Map<String, Value>, key: &str, errors: &mut Vec<FieldError>) {
    if let Some(value) = draft.get(key)
        && !value.is_boolean()
    {
        errors.push(FieldError::new(
            format!("/draft/{key}"),
            "invalid_type",
            "This field must be a boolean.",
        ));
    }
}

/// An optional object field of the draft.
fn check_optional_object(draft: &Map<String, Value>, key: &str, errors: &mut Vec<FieldError>) {
    if let Some(value) = draft.get(key)
        && !value.is_object()
    {
        errors.push(FieldError::new(
            format!("/draft/{key}"),
            "invalid_type",
            "This field must be an object.",
        ));
    }
}
