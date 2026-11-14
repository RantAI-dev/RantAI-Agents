//! The body and the headers of a chat request.
//!
//! Old: `src/features/chat-public/schema.ts` and the header reading in
//! `src/app/api/chat/route.ts`. The TypeScript body was `z.object({...}).passthrough()`: unknown
//! fields were accepted, because the dashboard sends fields the plain chat does not read yet.
//! The Rust port reads the fields it needs, checks their types, and ignores the rest.

use serde_json::Value;

use agents_core::validation::FieldError;

use crate::http::ApiError;

/// One message of the conversation.
#[derive(Debug, Clone, PartialEq)]
pub struct ChatMessage {
    /// The id the client already has.
    pub id: String,
    /// `user`, `assistant` or `system`.
    pub role: String,
    /// The text of the message.
    pub content: String,
    /// The message this one answers.
    pub reply_to: Option<String>,
    /// The earlier versions of the message, as the client sent them.
    pub edit_history: Option<Value>,
}

/// The body of a chat request.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub assistant_id: Option<String>,
    pub system_prompt: Option<String>,
    pub session_id: Option<String>,
    pub thread_id: Option<String>,
    /// The id the server upserts the assistant's answer under.
    pub assistant_message_id: Option<String>,
    pub time_zone: Option<String>,
    pub use_knowledge_base: Option<bool>,
    pub knowledge_base_group_ids: Vec<String>,
    pub enable_tools: Option<bool>,
    pub enabled_tool_names: Vec<String>,
    pub enable_web_search: Option<bool>,
    pub enable_code_interpreter: Option<bool>,
    pub enable_skills: Option<bool>,
    pub enabled_skill_ids: Vec<String>,
    pub canvas_mode: Option<String>,
    pub target_artifact_id: Option<String>,
    /// The text of an attached file.
    pub file_context: Option<String>,
    /// The documents attached to the message.
    pub file_document_ids: Vec<String>,
}

/// The headers the old route read.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ChatHeaders {
    pub assistant_id: Option<String>,
    /// The base64 system prompt of a client that has no assistant of its own.
    pub system_prompt: Option<String>,
    pub use_knowledge_base: Option<bool>,
}

/// The body and the headers together: the body wins, the headers are the fallback.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ChatInput {
    pub body: ChatRequest,
    pub headers: ChatHeaders,
}

impl ChatInput {
    /// The assistant the chat is with.
    pub fn assistant_id(&self) -> Option<&str> {
        self.body
            .assistant_id
            .as_deref()
            .or(self.headers.assistant_id.as_deref())
    }

    /// The system prompt the client sent, if any.
    pub fn system_prompt(&self) -> Option<&str> {
        self.body
            .system_prompt
            .as_deref()
            .or(self.headers.system_prompt.as_deref())
    }

    /// Whether the client asked for the knowledge base.
    pub fn use_knowledge_base(&self) -> Option<bool> {
        self.body
            .use_knowledge_base
            .or(self.headers.use_knowledge_base)
    }
}

/// Reads the body and the headers of a chat request.
pub fn parse(body: &Value, headers: &ChatHeaders) -> Result<ChatInput, ApiError> {
    let Some(object) = body.as_object() else {
        return Err(ApiError::from(vec![FieldError::new(
            "",
            "invalid_shape",
            "The body must be a JSON object.",
        )]));
    };

    let mut errors: Vec<FieldError> = Vec::new();
    let messages = parse_messages(object.get("messages"), &mut errors);
    let request = ChatRequest {
        messages,
        assistant_id: optional_string(object, "assistantId", &mut errors),
        system_prompt: optional_string(object, "systemPrompt", &mut errors),
        session_id: optional_string(object, "sessionId", &mut errors),
        thread_id: optional_string(object, "threadId", &mut errors),
        assistant_message_id: optional_string(object, "assistantMessageId", &mut errors),
        time_zone: optional_string(object, "timeZone", &mut errors),
        use_knowledge_base: optional_bool(object, "useKnowledgeBase", &mut errors),
        knowledge_base_group_ids: optional_strings(object, "knowledgeBaseGroupIds", &mut errors),
        enable_tools: optional_bool(object, "enableTools", &mut errors),
        enabled_tool_names: optional_strings(object, "enabledToolNames", &mut errors),
        enable_web_search: optional_bool(object, "enableWebSearch", &mut errors),
        enable_code_interpreter: optional_bool(object, "enableCodeInterpreter", &mut errors),
        enable_skills: optional_bool(object, "enableSkills", &mut errors),
        enabled_skill_ids: optional_strings(object, "enabledSkillIds", &mut errors),
        canvas_mode: optional_string(object, "canvasMode", &mut errors),
        target_artifact_id: optional_string(object, "targetArtifactId", &mut errors),
        file_context: optional_string(object, "fileContext", &mut errors),
        file_document_ids: optional_strings(object, "fileDocumentIds", &mut errors),
    };
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(ChatInput {
        body: request,
        headers: headers.clone(),
    })
}

/// The messages of the conversation.
fn parse_messages(value: Option<&Value>, errors: &mut Vec<FieldError>) -> Vec<ChatMessage> {
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
        let id = match optional_string(object, "id", errors) {
            Some(id) => id,
            None => {
                errors.push(FieldError::new(
                    format!("{pointer}/id"),
                    "required",
                    "A message needs an id.",
                ));
                continue;
            }
        };
        let role = match optional_string(object, "role", errors) {
            Some(role) => role,
            None => {
                errors.push(FieldError::new(
                    format!("{pointer}/role"),
                    "required",
                    "A message needs a role.",
                ));
                continue;
            }
        };
        if !matches!(role.as_str(), "user" | "assistant" | "system") {
            errors.push(FieldError::new(
                format!("{pointer}/role"),
                "not_allowed",
                "The role must be user, assistant or system.",
            ));
            continue;
        }
        let content = message_text(object, &pointer, errors);
        messages.push(ChatMessage {
            id,
            role,
            content,
            reply_to: optional_string(object, "replyTo", errors),
            edit_history: object.get("editHistory").cloned(),
        });
    }
    messages
}

/// The text of a message: the text parts when it has any, the content otherwise.
fn message_text(
    object: &serde_json::Map<String, Value>,
    pointer: &str,
    errors: &mut Vec<FieldError>,
) -> String {
    match object.get("parts") {
        Some(Value::Array(parts)) => {
            let mut text = String::new();
            for (index, part) in parts.iter().enumerate() {
                let Some(part) = part.as_object() else {
                    errors.push(FieldError::new(
                        format!("{pointer}/parts/{index}"),
                        "invalid_shape",
                        "A message part must be an object.",
                    ));
                    continue;
                };
                match part.get("type").and_then(Value::as_str) {
                    Some("text") => {
                        if let Some(value) = part.get("text") {
                            match value.as_str() {
                                Some(value) => text.push_str(value),
                                None => errors.push(FieldError::new(
                                    format!("{pointer}/parts/{index}/text"),
                                    "invalid_type",
                                    "The text of a part must be a string.",
                                )),
                            }
                        }
                    }
                    // Every other part kind (a file, a tool call) belongs to a capability the
                    // plain chat does not have.
                    Some(other) => errors.push(FieldError::new(
                        format!("{pointer}/parts/{index}/type"),
                        "not_allowed",
                        format!("A message part of the type {other} is not part of a plain chat."),
                    )),
                    None => errors.push(FieldError::new(
                        format!("{pointer}/parts/{index}/type"),
                        "required",
                        "A message part needs a type.",
                    )),
                }
            }
            text
        }
        Some(_) => {
            errors.push(FieldError::new(
                format!("{pointer}/parts"),
                "invalid_shape",
                "The parts of a message must be a list.",
            ));
            String::new()
        }
        None => object
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
    }
}

/// A string field, when it is there.
fn optional_string(
    object: &serde_json::Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) -> Option<String> {
    match object.get(key) {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) => Some(value.clone()),
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

/// A boolean field, when it is there.
fn optional_bool(
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

/// A list of strings, when it is there.
fn optional_strings(
    object: &serde_json::Map<String, Value>,
    key: &str,
    errors: &mut Vec<FieldError>,
) -> Vec<String> {
    match object.get(key) {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => {
            let mut values = Vec::with_capacity(items.len());
            for (index, item) in items.iter().enumerate() {
                match item.as_str() {
                    Some(value) => values.push(value.to_owned()),
                    None => errors.push(FieldError::new(
                        format!("/{key}/{index}"),
                        "invalid_type",
                        "This field must be a list of strings.",
                    )),
                }
            }
            values
        }
        Some(_) => {
            errors.push(FieldError::new(
                format!("/{key}"),
                "invalid_type",
                "This field must be a list of strings.",
            ));
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    type R = Result<(), Box<dyn std::error::Error>>;

    fn parse_ok(body: Value) -> Result<ChatInput, ApiError> {
        parse(&body, &ChatHeaders::default())
    }

    #[test]
    fn a_plain_body_is_read() -> R {
        let input = parse_ok(json!({
            "messages": [{"id": "m1", "role": "user", "content": "hello"}],
            "assistantId": "a1",
            "sessionId": "s1",
            "assistantMessageId": "m2",
        }))
        .map_err(|error| error.code.as_str().to_owned())?;
        assert_eq!(input.body.messages.len(), 1);
        assert_eq!(
            input.body.messages.first().map(|m| m.content.as_str()),
            Some("hello")
        );
        assert_eq!(input.assistant_id(), Some("a1"));
        assert_eq!(input.body.session_id.as_deref(), Some("s1"));
        Ok(())
    }

    #[test]
    fn the_parts_replace_the_content() -> R {
        let input = parse_ok(json!({
            "messages": [{
                "id": "m1",
                "role": "assistant",
                "content": "ignored",
                "parts": [{"type": "text", "text": "the answer"}],
            }],
        }))
        .map_err(|error| error.code.as_str().to_owned())?;
        assert_eq!(
            input.body.messages.first().map(|m| m.content.as_str()),
            Some("the answer")
        );
        Ok(())
    }

    #[test]
    fn a_body_that_is_not_an_object_is_refused() -> R {
        let error = parse(&json!([]), &ChatHeaders::default()).err();
        let error = error.ok_or("the body is not an object")?;
        assert_eq!(
            error.code,
            agents_contracts::error_codes::ErrorCode::InvalidRequest
        );
        Ok(())
    }

    #[test]
    fn every_bad_field_is_listed() -> R {
        let error = parse(
            &json!({
                "messages": [{"id": 1, "role": "user"}],
                "assistantId": 7,
                "useKnowledgeBase": "yes",
            }),
            &ChatHeaders::default(),
        )
        .err()
        .ok_or("the body is not valid")?;
        let fields: Vec<&str> = error.errors().iter().map(|e| e.field.as_str()).collect();
        assert!(fields.contains(&"/messages/0/id"));
        assert!(fields.contains(&"/assistantId"));
        assert!(fields.contains(&"/useKnowledgeBase"));
        Ok(())
    }

    #[test]
    fn the_headers_are_the_fallback() -> R {
        let headers = ChatHeaders {
            assistant_id: Some("a1".to_owned()),
            system_prompt: Some("be nice".to_owned()),
            use_knowledge_base: Some(true),
        };
        let input = parse(
            &json!({"messages": [{"id": "m1", "role": "user", "content": "hi"}]}),
            &headers,
        )
        .map_err(|error| error.code.as_str().to_owned())?;
        assert_eq!(input.assistant_id(), Some("a1"));
        assert_eq!(input.system_prompt(), Some("be nice"));
        assert_eq!(input.use_knowledge_base(), Some(true));

        // The body wins.
        let input = parse(
            &json!({
                "messages": [{"id": "m1", "role": "user", "content": "hi"}],
                "assistantId": "a2",
            }),
            &headers,
        )
        .map_err(|error| error.code.as_str().to_owned())?;
        assert_eq!(input.assistant_id(), Some("a2"));
        Ok(())
    }

    #[test]
    fn an_unknown_role_is_refused() -> R {
        let error = parse(
            &json!({"messages": [{"id": "m1", "role": "tool", "content": "hi"}]}),
            &ChatHeaders::default(),
        )
        .err()
        .ok_or("the role is not one of the three")?;
        assert_eq!(
            error.errors().first().map(|e| e.field.as_str()),
            Some("/messages/0/role")
        );
        Ok(())
    }
}
