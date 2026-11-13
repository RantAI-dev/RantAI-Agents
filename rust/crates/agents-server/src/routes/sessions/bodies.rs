//! The request bodies of the dashboard chat session routes, and what is wrong with them.
//!
//! The bodies are read by hand (`serde_json::Value` in, typed values out) because a
//! deserializer stops at the first field it cannot read, and the caller must get every bad
//! field at once, not only the first.
//!
//! The values that leave this module are the ones the store writes: a message, a change to a
//! message, a list of ids.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use agents_core::validation::FieldError;
use agents_store::sessions::{JsonWrite, MessageChanges, NewMessage};

use crate::http::ApiError;

/// The title a session gets when the caller sends none.
const DEFAULT_TITLE: &str = "New Chat";
/// The longest title the sidebar shows. The UI caps it at the same number.
const MAX_TITLE_LEN: usize = 200;
/// The longest id (a message id, a reply target) the API accepts.
const MAX_ID_LEN: usize = 200;
/// The longest message body the API accepts.
const MAX_CONTENT_LEN: usize = 100_000;
/// The most messages one request may write.
const MAX_MESSAGES: usize = 100;
/// The most message ids one delete may name.
const MAX_MESSAGE_IDS: usize = 200;
/// The longest timestamp the API accepts.
const MAX_TIMESTAMP_LEN: usize = 64;
/// The source fields that hold a string or null.
const SOURCE_TEXT_KEYS: [&str; 5] = ["section", "url", "documentId", "assetKey", "chunkType"];
/// The source fields that hold a string.
const SOURCE_PLAIN_TEXT_KEYS: [&str; 1] = ["content"];
/// The source fields that hold a number or null.
const SOURCE_NUMBER_KEYS: [&str; 3] = ["page", "chunkIndex", "anchorChunkIndex"];
/// The source fields that hold a number.
const SOURCE_PLAIN_NUMBER_KEYS: [&str; 1] = ["similarity"];

/// One earlier version of a message, with the answer it got.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EditHistoryEntry {
    /// What the user wrote in that version.
    pub(super) content: String,
    /// What the assistant answered in that version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) assistant_response: Option<String>,
    /// When the user made that version.
    pub(super) edited_at: String,
}

fn field(pointer: &str, code: &'static str, message: &str) -> FieldError {
    FieldError::new(pointer, code, message)
}

/// A body that is not a JSON object.
fn not_an_object() -> ApiError {
    ApiError::from(vec![field(
        "",
        "invalid_shape",
        "The body must be a JSON object.",
    )])
}

/// Every field the body may carry. Anything else is an error: the conventions reject an
/// unknown field instead of ignoring it.
fn reject_unknown(
    object: &Map<String, Value>,
    allowed: &[&str],
    prefix: &str,
    errors: &mut Vec<FieldError>,
) {
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            errors.push(field(
                &format!("{prefix}/{key}"),
                "unknown_field",
                "This field is not part of the request.",
            ));
        }
    }
}

/// A string field. Absent is `None` when the field is optional and an error when it is
/// required. A value that is too long is an error too.
fn read_string(
    object: &Map<String, Value>,
    key: &str,
    pointer: &str,
    required: bool,
    max_len: usize,
    errors: &mut Vec<FieldError>,
) -> Option<String> {
    match object.get(key) {
        None => {
            if required {
                errors.push(field(pointer, "required", "This field is required."));
            }
            None
        }
        Some(Value::String(text)) => {
            if text.chars().count() > max_len {
                errors.push(field(
                    pointer,
                    "too_long",
                    &format!("This field must be at most {max_len} characters."),
                ));
                None
            } else {
                Some(text.clone())
            }
        }
        Some(_) => {
            errors.push(field(
                pointer,
                "invalid_type",
                "This field must be a string.",
            ));
            None
        }
    }
}

/// A string field that must not be empty. The old schema asked for at least one character, so
/// a blank-but-not-empty title is still a title.
fn read_non_empty_string(
    object: &Map<String, Value>,
    key: &str,
    pointer: &str,
    required: bool,
    max_len: usize,
    errors: &mut Vec<FieldError>,
) -> Option<String> {
    let text = read_string(object, key, pointer, required, max_len, errors)?;
    if text.is_empty() {
        errors.push(field(pointer, "required", "This field must not be empty."));
        return None;
    }
    Some(text)
}

/// The body of a create request: the assistant to chat with and the title.
pub(super) fn parse_create(body: &Value) -> Result<(String, String), ApiError> {
    let Some(object) = body.as_object() else {
        return Err(not_an_object());
    };
    let mut errors = Vec::new();
    reject_unknown(object, &["assistantId", "title"], "", &mut errors);
    let assistant_id = read_non_empty_string(
        object,
        "assistantId",
        "/assistantId",
        true,
        MAX_ID_LEN,
        &mut errors,
    );
    // An empty title is not an error here: the session gets the default title, the way the old
    // route did.
    let title = read_string(object, "title", "/title", false, MAX_TITLE_LEN, &mut errors)
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| DEFAULT_TITLE.to_owned());
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok((assistant_id.unwrap_or_default(), title))
}

/// The body of a rename request.
pub(super) fn parse_rename(body: &Value) -> Result<Option<String>, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(not_an_object());
    };
    let mut errors = Vec::new();
    reject_unknown(object, &["title"], "", &mut errors);
    let title = read_non_empty_string(object, "title", "/title", false, MAX_TITLE_LEN, &mut errors);
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(title)
}

/// The body of a "write messages" request.
pub(super) fn parse_messages(body: &Value) -> Result<Vec<NewMessage>, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(not_an_object());
    };
    let mut errors = Vec::new();
    reject_unknown(object, &["messages"], "", &mut errors);
    let mut messages = Vec::new();
    match object.get("messages") {
        None => errors.push(field("/messages", "required", "This field is required.")),
        Some(Value::Array(items)) => {
            if items.len() > MAX_MESSAGES {
                errors.push(field(
                    "/messages",
                    "too_long",
                    &format!("At most {MAX_MESSAGES} messages per request."),
                ));
            }
            for (index, item) in items.iter().take(MAX_MESSAGES).enumerate() {
                let pointer = format!("/messages/{index}");
                if let Some(message) = parse_message(item, &pointer, &mut errors) {
                    messages.push(message);
                }
            }
        }
        Some(_) => errors.push(field(
            "/messages",
            "invalid_type",
            "This field must be an array of messages.",
        )),
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(messages)
}

fn parse_message(item: &Value, pointer: &str, errors: &mut Vec<FieldError>) -> Option<NewMessage> {
    let Some(object) = item.as_object() else {
        errors.push(field(
            pointer,
            "invalid_shape",
            "A message must be a JSON object.",
        ));
        return None;
    };
    reject_unknown(
        object,
        &[
            "id",
            "role",
            "content",
            "replyTo",
            "editHistory",
            "sources",
            "metadata",
        ],
        pointer,
        errors,
    );
    let role = read_role(object, pointer, errors);
    let content = read_string(
        object,
        "content",
        &format!("{pointer}/content"),
        true,
        MAX_CONTENT_LEN,
        errors,
    )
    .unwrap_or_default();
    let id = read_string(
        object,
        "id",
        &format!("{pointer}/id"),
        false,
        MAX_ID_LEN,
        errors,
    )
    // An empty id means "make a new message", the way the old repository read it.
    .filter(|id| !id.is_empty());
    let reply_to = read_string(
        object,
        "replyTo",
        &format!("{pointer}/replyTo"),
        false,
        MAX_ID_LEN,
        errors,
    );
    let edit_history = object
        .get("editHistory")
        .and_then(|v| parse_edit_history(v, &format!("{pointer}/editHistory"), errors));
    let sources = object
        .get("sources")
        .and_then(|v| parse_sources(v, &format!("{pointer}/sources"), errors));
    let metadata = object
        .get("metadata")
        .and_then(|v| parse_metadata(v, &format!("{pointer}/metadata"), errors));
    Some(NewMessage {
        id,
        role,
        content,
        reply_to,
        edit_history,
        sources,
        metadata,
    })
}

/// The body of a "write one message" request: the message to write and what to write in it.
pub(super) fn parse_message_update(body: &Value) -> Result<(String, MessageChanges), ApiError> {
    let Some(object) = body.as_object() else {
        return Err(not_an_object());
    };
    let mut errors = Vec::new();
    reject_unknown(
        object,
        &["messageId", "content", "editHistory", "sources", "metadata"],
        "",
        &mut errors,
    );
    let message_id = read_non_empty_string(
        object,
        "messageId",
        "/messageId",
        true,
        MAX_ID_LEN,
        &mut errors,
    )
    .unwrap_or_default();
    let content = read_string(
        object,
        "content",
        "/content",
        false,
        MAX_CONTENT_LEN,
        &mut errors,
    );
    let edit_history = json_write(
        object,
        "editHistory",
        "/editHistory",
        false,
        parse_edit_history,
        &mut errors,
    );
    let sources = json_write(
        object,
        "sources",
        "/sources",
        true,
        parse_sources,
        &mut errors,
    );
    let metadata = json_write(
        object,
        "metadata",
        "/metadata",
        false,
        parse_metadata,
        &mut errors,
    );
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok((
        message_id,
        MessageChanges {
            content,
            edit_history,
            sources,
            metadata,
        },
    ))
}

/// What a JSON field of a message update asks for: nothing (keep the column), null (clear it)
/// or a value (write it).
fn json_write(
    object: &Map<String, Value>,
    key: &str,
    pointer: &str,
    nullable: bool,
    parse: fn(&Value, &str, &mut Vec<FieldError>) -> Option<Value>,
    errors: &mut Vec<FieldError>,
) -> JsonWrite {
    match object.get(key) {
        None => JsonWrite::Keep,
        Some(Value::Null) if nullable => JsonWrite::Clear,
        Some(value) => match parse(value, pointer, errors) {
            Some(parsed) => JsonWrite::Set(parsed),
            None => JsonWrite::Keep,
        },
    }
}

/// The body of a "delete messages" request.
pub(super) fn parse_message_ids(body: &Value) -> Result<Vec<String>, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(not_an_object());
    };
    let mut errors = Vec::new();
    reject_unknown(object, &["messageIds"], "", &mut errors);
    let mut ids = Vec::new();
    match object.get("messageIds") {
        None => errors.push(field("/messageIds", "required", "This field is required.")),
        Some(Value::Array(items)) => {
            if items.len() > MAX_MESSAGE_IDS {
                errors.push(field(
                    "/messageIds",
                    "too_long",
                    &format!("At most {MAX_MESSAGE_IDS} message ids per request."),
                ));
            }
            for (index, item) in items.iter().take(MAX_MESSAGE_IDS).enumerate() {
                let pointer = format!("/messageIds/{index}");
                match item {
                    Value::String(text) if !text.is_empty() => ids.push(text.clone()),
                    Value::String(_) => {
                        errors.push(field(&pointer, "required", "This field must not be empty."))
                    }
                    _ => errors.push(field(
                        &pointer,
                        "invalid_type",
                        "This field must be a string.",
                    )),
                }
            }
        }
        Some(_) => errors.push(field(
            "/messageIds",
            "invalid_type",
            "This field must be an array of message ids.",
        )),
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(ids)
}

fn read_role(object: &Map<String, Value>, pointer: &str, errors: &mut Vec<FieldError>) -> String {
    match object.get("role") {
        Some(Value::String(role)) if role == "user" || role == "assistant" => role.clone(),
        Some(Value::String(_)) => {
            errors.push(field(
                &format!("{pointer}/role"),
                "invalid_enum",
                "The role must be \"user\" or \"assistant\".",
            ));
            String::new()
        }
        Some(_) => {
            errors.push(field(
                &format!("{pointer}/role"),
                "invalid_type",
                "This field must be a string.",
            ));
            String::new()
        }
        None => {
            errors.push(field(
                &format!("{pointer}/role"),
                "required",
                "This field is required.",
            ));
            String::new()
        }
    }
}

/// The edit history: every earlier version of the message with the answer it got. The user text
/// and the assistant reply both survive the round trip (QA TC-944).
fn parse_edit_history(value: &Value, pointer: &str, errors: &mut Vec<FieldError>) -> Option<Value> {
    let before = errors.len();
    let Value::Array(items) = value else {
        errors.push(field(
            pointer,
            "invalid_type",
            "This field must be an array of edit-history entries.",
        ));
        return None;
    };
    let mut entries: Vec<EditHistoryEntry> = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        let entry = format!("{pointer}/{index}");
        let Some(object) = item.as_object() else {
            errors.push(field(
                &entry,
                "invalid_shape",
                "An edit-history entry must be a JSON object.",
            ));
            continue;
        };
        let Some(content) = read_string(
            object,
            "content",
            &format!("{entry}/content"),
            true,
            MAX_CONTENT_LEN,
            errors,
        ) else {
            continue;
        };
        let Some(edited_at) = read_string(
            object,
            "editedAt",
            &format!("{entry}/editedAt"),
            true,
            MAX_TIMESTAMP_LEN,
            errors,
        ) else {
            continue;
        };
        if chrono::DateTime::parse_from_rfc3339(&edited_at).is_err() {
            errors.push(field(
                &format!("{entry}/editedAt"),
                "invalid_format",
                "This field must be an RFC 3339 timestamp.",
            ));
            continue;
        }
        let assistant_response = read_string(
            object,
            "assistantResponse",
            &format!("{entry}/assistantResponse"),
            false,
            MAX_CONTENT_LEN,
            errors,
        );
        entries.push(EditHistoryEntry {
            content,
            assistant_response,
            edited_at,
        });
    }
    if errors.len() > before {
        return None;
    }
    Some(serde_json::to_value(entries).unwrap_or_else(|_| Value::Array(Vec::new())))
}

/// The retrieval sources of an assistant message. Only the fields the app knows are kept, the
/// way the old schema dropped the rest.
fn parse_sources(value: &Value, pointer: &str, errors: &mut Vec<FieldError>) -> Option<Value> {
    let before = errors.len();
    let Value::Array(items) = value else {
        errors.push(field(
            pointer,
            "invalid_type",
            "This field must be an array of sources.",
        ));
        return None;
    };
    let mut sources = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        let entry = format!("{pointer}/{index}");
        let Some(object) = item.as_object() else {
            errors.push(field(
                &entry,
                "invalid_shape",
                "A source must be a JSON object.",
            ));
            continue;
        };
        let Some(Value::String(title)) = object.get("title") else {
            errors.push(field(
                &format!("{entry}/title"),
                if object.get("title").is_some() {
                    "invalid_type"
                } else {
                    "required"
                },
                "A source must have a title.",
            ));
            continue;
        };
        let mut source = Map::new();
        source.insert("title".to_owned(), Value::String(title.clone()));
        for key in SOURCE_TEXT_KEYS {
            copy_source_field(
                object,
                key,
                &entry,
                SourceKind::Text,
                true,
                &mut source,
                errors,
            );
        }
        for key in SOURCE_PLAIN_TEXT_KEYS {
            copy_source_field(
                object,
                key,
                &entry,
                SourceKind::Text,
                false,
                &mut source,
                errors,
            );
        }
        for key in SOURCE_NUMBER_KEYS {
            copy_source_field(
                object,
                key,
                &entry,
                SourceKind::Number,
                true,
                &mut source,
                errors,
            );
        }
        for key in SOURCE_PLAIN_NUMBER_KEYS {
            copy_source_field(
                object,
                key,
                &entry,
                SourceKind::Number,
                false,
                &mut source,
                errors,
            );
        }
        sources.push(Value::Object(source));
    }
    if errors.len() > before {
        return None;
    }
    Some(Value::Array(sources))
}

/// The kind of value a source field holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SourceKind {
    Text,
    Number,
}

/// Copies a source field into the stored source. A null stays a null where the old schema
/// allowed one; a field the client did not send is left out.
fn copy_source_field(
    object: &Map<String, Value>,
    key: &str,
    pointer: &str,
    kind: SourceKind,
    nullable: bool,
    target: &mut Map<String, Value>,
    errors: &mut Vec<FieldError>,
) {
    match object.get(key) {
        None => {}
        Some(Value::Null) if nullable => {
            target.insert(key.to_owned(), Value::Null);
        }
        Some(Value::String(text)) if kind == SourceKind::Text => {
            target.insert(key.to_owned(), Value::String(text.clone()));
        }
        Some(Value::Number(number)) if kind == SourceKind::Number => {
            target.insert(key.to_owned(), Value::Number(number.clone()));
        }
        Some(_) => errors.push(field(
            &format!("{pointer}/{key}"),
            "invalid_type",
            match kind {
                SourceKind::Text => "This field must be a string or null.",
                SourceKind::Number => "This field must be a number or null.",
            },
        )),
    }
}

/// Free-form metadata: an object, as the old schema wanted.
fn parse_metadata(value: &Value, pointer: &str, errors: &mut Vec<FieldError>) -> Option<Value> {
    if value.is_object() {
        Some(value.clone())
    } else {
        errors.push(field(
            pointer,
            "invalid_type",
            "This field must be an object.",
        ));
        None
    }
}
