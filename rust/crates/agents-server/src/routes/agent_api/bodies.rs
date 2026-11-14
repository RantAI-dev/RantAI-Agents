//! The request bodies of the agent API, and what is wrong with them.
//!
//! Old: `CreateAgentApiKeySchema`/`UpdateAgentApiKeySchema` in
//! `src/features/agent-api-keys/schema.ts` and `V1ChatCompletionSchema` in
//! `src/features/agent-api/schema.ts`. Both are zod objects, which *strip* a field they do not
//! know rather than refusing it, so an OpenAI client's `n`, `stop` or `user` is ignored here
//! too, and every field that is read is validated by hand so the caller gets every bad field
//! at once instead of the first one.

use chrono::{DateTime, NaiveDateTime};
use serde_json::Value;

use agents_core::validation::FieldError;

use crate::http::ApiError;

/// The body of a create request.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateKey {
    pub name: String,
    pub assistant_id: String,
    pub scopes: Option<Vec<String>>,
    pub ip_whitelist: Option<Vec<String>>,
    /// An ISO-8601 instant. `None` is a key that never expires.
    pub expires_at: Option<NaiveDateTime>,
}

/// The body of an update request. Every field is optional; the ones that are present replace
/// what the row holds.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateKey {
    pub name: Option<String>,
    pub scopes: Option<Vec<String>>,
    pub ip_whitelist: Option<Vec<String>>,
    pub enabled: Option<bool>,
    /// `Some(None)` clears the expiry, `None` leaves it as it is.
    pub expires_at: Option<Option<NaiveDateTime>>,
}

/// One message of an OpenAI-compatible conversation.
#[derive(Debug, Clone, PartialEq)]
pub struct CompletionMessage {
    /// `system`, `user` or `assistant`.
    pub role: String,
    pub content: String,
}

/// The body of a completion request.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Completion {
    /// The model the client asked for. The old route never read it (the agent's own model
    /// answers), and neither does this one: see differences.md row 143.
    pub model: Option<String>,
    pub messages: Vec<CompletionMessage>,
    pub stream: bool,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
    pub top_p: Option<f64>,
    /// Accepted and ignored, as the old route did: the conversation is the socket's, or the
    /// messages the client replays.
    pub thread_id: Option<String>,
    /// The knowledge bases the request asks to read. The port has no retrieval (design §3.6),
    /// so a request that names any is refused with the capability gate's 409.
    pub knowledge_base_ids: Vec<String>,
    /// Ask for the cited images inline. Nothing is retrieved, so there is nothing to send.
    pub inline_figures: bool,
}

/// Reads the body of a create request.
pub fn parse_create(body: &Value) -> Result<CreateKey, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(not_an_object());
    };
    let mut errors = Vec::new();
    let name = required_text(object, "name", &mut errors);
    let assistant_id = required_text(object, "assistantId", &mut errors);
    let scopes = texts(object, "scopes", &mut errors);
    let ip_whitelist = texts(object, "ipWhitelist", &mut errors);
    let expires_at = instant(object, "expiresAt", &mut errors).flatten();
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(CreateKey {
        name: name.unwrap_or_default(),
        assistant_id: assistant_id.unwrap_or_default(),
        scopes,
        ip_whitelist,
        expires_at,
    })
}

/// Reads the body of an update request.
pub fn parse_update(body: &Value) -> Result<UpdateKey, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(not_an_object());
    };
    let mut errors = Vec::new();
    let name = text(object, "name", &mut errors);
    let scopes = texts(object, "scopes", &mut errors);
    let ip_whitelist = texts(object, "ipWhitelist", &mut errors);
    let enabled = boolean(object, "enabled", &mut errors);
    let expires_at = if object.contains_key("expiresAt") {
        Some(instant(object, "expiresAt", &mut errors).flatten())
    } else {
        None
    };
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(UpdateKey {
        name,
        scopes,
        ip_whitelist,
        enabled,
        expires_at,
    })
}

/// Whether the request asks for a stream, read before the body is validated.
///
/// The scope a key needs depends on this, and the key is checked before the body is parsed, so
/// the answer has to be available first. Anything that is not `true` is not a stream; a
/// `stream` of the wrong type is refused by [`parse_completion`] a moment later.
#[must_use]
pub fn wants_stream(body: &Value) -> bool {
    body.get("stream").and_then(Value::as_bool).unwrap_or(false)
}

/// Reads the body of a completion request.
pub fn parse_completion(body: &Value) -> Result<Completion, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(not_an_object());
    };
    let mut errors = Vec::new();
    let model = text(object, "model", &mut errors);
    let messages = messages(object.get("messages"), &mut errors);
    let stream = boolean(object, "stream", &mut errors);
    let temperature = number(object, "temperature", 0.0, 2.0, &mut errors);
    let top_p = number(object, "top_p", 0.0, 1.0, &mut errors);
    let max_tokens = positive_integer(object, "max_tokens", &mut errors);
    let thread_id = text(object, "thread_id", &mut errors);
    let knowledge_base_ids = texts(object, "knowledge_base_ids", &mut errors).unwrap_or_default();
    let inline_figures = boolean(object, "inline_figures", &mut errors).unwrap_or(false);
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(Completion {
        model,
        messages,
        stream: stream.unwrap_or(false),
        temperature,
        max_tokens,
        top_p,
        thread_id,
        knowledge_base_ids,
        inline_figures,
    })
}

/// The conversation. An empty list is a bad request, as the old schema's `min(1)` was.
fn messages(value: Option<&Value>, errors: &mut Vec<FieldError>) -> Vec<CompletionMessage> {
    let Some(value) = value else {
        errors.push(FieldError::new(
            "/messages",
            "required",
            "The conversation is required.",
        ));
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        errors.push(FieldError::new(
            "/messages",
            "invalid_shape",
            "The conversation must be a list of messages.",
        ));
        return Vec::new();
    };
    if items.is_empty() {
        errors.push(FieldError::new(
            "/messages",
            "required",
            "The conversation needs at least one message.",
        ));
        return Vec::new();
    }
    let mut messages = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        let pointer = format!("/messages/{index}");
        let Some(object) = item.as_object() else {
            errors.push(FieldError::new(
                &pointer,
                "invalid_shape",
                "A message must be an object.",
            ));
            continue;
        };
        let role = match object.get("role").and_then(Value::as_str) {
            Some(role @ ("system" | "user" | "assistant")) => role.to_owned(),
            Some(_) => {
                errors.push(FieldError::new(
                    format!("{pointer}/role"),
                    "invalid_value",
                    "The role must be system, user or assistant.",
                ));
                continue;
            }
            None => {
                errors.push(FieldError::new(
                    format!("{pointer}/role"),
                    "required",
                    "A message needs a role.",
                ));
                continue;
            }
        };
        let Some(content) = object.get("content").and_then(Value::as_str) else {
            errors.push(FieldError::new(
                format!("{pointer}/content"),
                "required",
                "A message needs text content.",
            ));
            continue;
        };
        messages.push(CompletionMessage {
            role,
            content: content.to_owned(),
        });
    }
    messages
}

/// A string field.
fn text(
    object: &serde_json::Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) -> Option<String> {
    match object.get(key) {
        None | Some(Value::Null) => None,
        Some(Value::String(text)) => Some(text.clone()),
        Some(_) => {
            errors.push(FieldError::new(
                format!("/{key}"),
                "invalid_type",
                "This field must be a string.",
            ));
            None
        }
    }
}

/// A string field that has to be there and has to say something.
fn required_text(
    object: &serde_json::Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) -> Option<String> {
    let value = text(object, key, errors);
    if value.as_deref().is_none_or(str::is_empty)
        && !errors.iter().any(|e| e.field == format!("/{key}"))
    {
        errors.push(FieldError::new(
            format!("/{key}"),
            "required",
            "This field is required.",
        ));
        return None;
    }
    value
}

/// A list of strings.
fn texts(
    object: &serde_json::Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) -> Option<Vec<String>> {
    let value = object.get(key)?;
    let Some(items) = value.as_array() else {
        errors.push(FieldError::new(
            format!("/{key}"),
            "invalid_type",
            "This field must be an array of strings.",
        ));
        return None;
    };
    let mut out = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        match item {
            Value::String(text) => out.push(text.clone()),
            _ => errors.push(FieldError::new(
                format!("/{key}/{index}"),
                "invalid_type",
                "This entry must be a string.",
            )),
        }
    }
    Some(out)
}

/// A boolean field.
fn boolean(
    object: &serde_json::Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) -> Option<bool> {
    match object.get(key) {
        None | Some(Value::Null) => None,
        Some(Value::Bool(value)) => Some(*value),
        Some(_) => {
            errors.push(FieldError::new(
                format!("/{key}"),
                "invalid_type",
                "This field must be true or false.",
            ));
            None
        }
    }
}

/// A number field inside a range.
fn number(
    object: &serde_json::Map<String, Value>,
    key: &str,
    low: f64,
    high: f64,
    errors: &mut Vec<FieldError>,
) -> Option<f64> {
    let value = object.get(key)?;
    let Some(value) = value.as_f64() else {
        errors.push(FieldError::new(
            format!("/{key}"),
            "invalid_type",
            "This field must be a number.",
        ));
        return None;
    };
    if !(low..=high).contains(&value) {
        errors.push(FieldError::new(
            format!("/{key}"),
            "out_of_range",
            format!("Must be between {low} and {high}."),
        ));
        return None;
    }
    Some(value)
}

/// A positive integer field.
fn positive_integer(
    object: &serde_json::Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) -> Option<u32> {
    let value = object.get(key)?;
    let Some(value) = value.as_i64().filter(|value| *value > 0) else {
        errors.push(FieldError::new(
            format!("/{key}"),
            "out_of_range",
            "This field must be a positive whole number.",
        ));
        return None;
    };
    u32::try_from(value).ok().or_else(|| {
        errors.push(FieldError::new(
            format!("/{key}"),
            "out_of_range",
            "This number is too large.",
        ));
        None
    })
}

/// An ISO-8601 instant, as `z.string().datetime()` read it.
///
/// `Ok(None)` for a field that is absent or null; `Err` pushed for one that is not an instant.
fn instant(
    object: &serde_json::Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) -> Option<Option<NaiveDateTime>> {
    match object.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::String(text)) => match DateTime::parse_from_rfc3339(text) {
            Ok(at) => Some(Some(at.naive_utc())),
            Err(_) => {
                errors.push(FieldError::new(
                    format!("/{key}"),
                    "invalid_value",
                    "This field must be an ISO-8601 instant, for example 2026-01-31T23:59:59Z.",
                ));
                None
            }
        },
        Some(_) => {
            errors.push(FieldError::new(
                format!("/{key}"),
                "invalid_type",
                "This field must be an ISO-8601 instant.",
            ));
            None
        }
    }
}

/// A body that is not a JSON object at all.
fn not_an_object() -> ApiError {
    ApiError::from(vec![FieldError::new(
        "",
        "invalid_shape",
        "The body must be a JSON object.",
    )])
}
