//! The chat-completion request and the events streamed back.
//!
//! The shapes are the OpenAI-compatible ones (`POST /chat/completions`), because every provider
//! this crate talks to (OpenRouter, MiniMax) speaks that dialect.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use agents_contracts::error_codes::ErrorCode;

/// Who sent a message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

impl Role {
    /// The name the wire format uses.
    #[must_use]
    pub const fn as_wire(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::User => "user",
            Self::Assistant => "assistant",
            Self::Tool => "tool",
        }
    }
}

/// A tool the model asked for.
#[derive(Debug, Clone, PartialEq)]
pub struct ToolCall {
    /// The id the tool result has to quote.
    pub id: String,
    /// The tool's name.
    pub name: String,
    /// The arguments, parsed from the JSON the provider streamed.
    pub args: Value,
}

/// A tool the model may call.
#[derive(Debug, Clone, PartialEq)]
pub struct ToolDefinition {
    /// The tool's name, as the model calls it.
    pub name: String,
    /// What the tool does. The model reads this.
    pub description: Option<String>,
    /// The JSON Schema of the arguments.
    pub parameters: Value,
}

/// When the model must call a tool.
#[derive(Debug, Clone, PartialEq, Default)]
pub enum ToolChoice {
    /// The model decides. The default.
    #[default]
    Auto,
    /// The model must not call a tool.
    None,
    /// The model must call a tool.
    Required,
    /// The model must call this tool.
    Named(String),
}

impl ToolChoice {
    fn to_json(&self) -> Value {
        match self {
            Self::Auto => Value::String("auto".to_owned()),
            Self::None => Value::String("none".to_owned()),
            Self::Required => Value::String("required".to_owned()),
            Self::Named(name) => object([
                ("type", Value::String("function".to_owned())),
                ("function", object([("name", Value::String(name.clone()))])),
            ]),
        }
    }
}

/// How hard the model should think, for the providers that take it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
}

impl ReasoningEffort {
    fn as_wire(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

/// The `response_format` the request asks for.
#[derive(Debug, Clone, PartialEq)]
pub enum ResponseFormat {
    /// Free text. Nothing is sent to the provider.
    Text,
    /// Any JSON object.
    JsonObject,
    /// JSON matching a schema.
    JsonSchema {
        /// The schema's name, for the providers that show it to the user.
        name: String,
        /// The JSON Schema.
        schema: Value,
        /// Whether the provider must follow the schema exactly.
        strict: Option<bool>,
    },
}

impl ResponseFormat {
    fn to_json(&self) -> Value {
        match self {
            Self::Text => object([("type", Value::String("text".to_owned()))]),
            Self::JsonObject => object([("type", Value::String("json_object".to_owned()))]),
            Self::JsonSchema {
                name,
                schema,
                strict,
            } => {
                let mut inner = serde_json::Map::new();
                inner.insert("name".to_owned(), Value::String(name.clone()));
                inner.insert("schema".to_owned(), schema.clone());
                if let Some(strict) = strict {
                    inner.insert("strict".to_owned(), Value::Bool(*strict));
                }
                Value::Object(
                    [
                        ("type".to_owned(), Value::String("json_schema".to_owned())),
                        ("json_schema".to_owned(), Value::Object(inner)),
                    ]
                    .into_iter()
                    .collect(),
                )
            }
        }
    }
}

/// Token usage. One step's usage, or the sum of every step's.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Usage {
    /// Tokens the prompt took.
    pub prompt: u32,
    /// Tokens the answer took.
    pub completion: u32,
    /// What the provider billed in total.
    pub total: u32,
}

impl Usage {
    /// Add another step's usage to this one.
    pub fn add(&mut self, other: Usage) {
        self.prompt = self.prompt.saturating_add(other.prompt);
        self.completion = self.completion.saturating_add(other.completion);
        self.total = self.total.saturating_add(other.total);
    }
}

/// Why the model stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FinishReason {
    /// The model finished its answer.
    #[default]
    Stop,
    /// The answer hit the token limit.
    Length,
    /// The model asked for tools.
    ToolCalls,
    /// The provider filtered the answer.
    ContentFilter,
    /// Something we do not know.
    Other,
}

impl FinishReason {
    /// Map the provider's word to a reason.
    #[must_use]
    pub fn from_raw(raw: &str) -> Self {
        match raw {
            "stop" => Self::Stop,
            "length" => Self::Length,
            "tool_calls" | "function_call" => Self::ToolCalls,
            "content_filter" => Self::ContentFilter,
            _ => Self::Other,
        }
    }
}

/// One thing that happened while the answer streamed.
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// More of the answer. The `<think>` reasoning has already been taken out of it.
    TextDelta {
        /// The new text.
        text: String,
    },
    /// More of the model's reasoning.
    ReasoningDelta {
        /// The new text.
        text: String,
    },
    /// The model started asking for a tool.
    ToolCallStart {
        /// Which call this is, when the model asks for several at once.
        index: usize,
        /// The call's id.
        id: String,
        /// The tool's name.
        name: String,
    },
    /// More of a tool call's arguments.
    ToolCallArgsDelta {
        /// Which call this is.
        index: usize,
        /// The new fragment of JSON.
        delta: String,
    },
    /// A tool call is complete and its arguments parsed.
    ToolCallReady {
        /// The call's id.
        id: String,
        /// The tool's name.
        name: String,
        /// The arguments.
        args: Value,
    },
    /// What the step cost.
    Usage(Usage),
    /// The step is over.
    Finish {
        /// Why the model stopped.
        reason: FinishReason,
    },
    /// The provider reported an error inside the stream. The message is safe to show a user.
    Error {
        /// What to show.
        message: String,
    },
}

/// Why a request failed. The variants are what the caller branches on; the messages are what a
/// user sees. No variant ever carries the provider's raw body: that goes to the log.
#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    /// The key for the provider this model needs is not configured.
    #[error("no api key for {provider}")]
    MissingApiKey {
        /// Which provider needs the key.
        provider: &'static str,
    },
    /// The provider rejected our key.
    #[error("the provider rejected the request")]
    Unauthorized,
    /// The provider is rate limiting us.
    #[error("the provider is rate limiting")]
    RateLimited {
        /// What the provider asked us to wait, in seconds.
        retry_after_seconds: Option<u64>,
    },
    /// The provider failed.
    #[error("the provider failed")]
    UpstreamFailed {
        /// The HTTP status, when the failure was a response.
        status: Option<u16>,
    },
    /// The provider took too long.
    #[error("the provider timed out")]
    Timeout,
    /// The request never reached the provider, or the connection broke.
    #[error("the request failed")]
    Transport {
        /// What went wrong, for the log.
        detail: String,
    },
    /// The provider sent something we cannot read.
    #[error("the provider sent something we cannot read")]
    InvalidResponse {
        /// What went wrong, for the log.
        detail: String,
    },
    /// The caller stopped the request.
    #[error("cancelled")]
    Cancelled,
}

impl LlmError {
    /// The message to show a user. It never contains upstream text.
    #[must_use]
    pub fn user_message(&self) -> &'static str {
        match self {
            Self::MissingApiKey { .. } | Self::Unauthorized => {
                "The model provider rejected the request — its API key may be missing or \
                 invalid. Try a different model."
            }
            Self::RateLimited { .. } => {
                "This model is busy or rate-limited right now. Please wait a moment or switch \
                 models."
            }
            _ => "The model didn't return a response. Please try again or switch models.",
        }
    }

    /// The error code the HTTP layer sends.
    #[must_use]
    pub fn code(&self) -> ErrorCode {
        match self {
            Self::MissingApiKey { .. } => ErrorCode::Internal,
            Self::Unauthorized | Self::UpstreamFailed { .. } | Self::InvalidResponse { .. } => {
                ErrorCode::UpstreamFailed
            }
            Self::RateLimited { .. } => ErrorCode::RateLimited,
            Self::Timeout => ErrorCode::Timeout,
            Self::Transport { .. } | Self::Cancelled => ErrorCode::Unavailable,
        }
    }
}

/// One message in the conversation.
#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    /// Who sent it.
    pub role: Role,
    /// The text. `None` on an assistant message that only asked for tools.
    pub content: Option<String>,
    /// The tool's name, on a `tool` message.
    pub name: Option<String>,
    /// The call this message answers, on a `tool` message.
    pub tool_call_id: Option<String>,
    /// The calls the assistant asked for, on an `assistant` message.
    pub tool_calls: Vec<ToolCall>,
}

impl Message {
    /// A system message.
    #[must_use]
    pub fn system(content: impl Into<String>) -> Self {
        Self::text(Role::System, content)
    }

    /// A user message.
    #[must_use]
    pub fn user(content: impl Into<String>) -> Self {
        Self::text(Role::User, content)
    }

    /// An assistant message with no tool calls.
    #[must_use]
    pub fn assistant(content: impl Into<String>) -> Self {
        Self::text(Role::Assistant, content)
    }

    /// The result of a tool call, ready to go back to the model.
    #[must_use]
    pub fn tool_result(call: &ToolCall, content: impl Into<String>) -> Self {
        Self {
            role: Role::Tool,
            content: Some(content.into()),
            name: Some(call.name.clone()),
            tool_call_id: Some(call.id.clone()),
            tool_calls: Vec::new(),
        }
    }

    fn text(role: Role, content: impl Into<String>) -> Self {
        Self {
            role,
            content: Some(content.into()),
            name: None,
            tool_call_id: None,
            tool_calls: Vec::new(),
        }
    }
}

/// One chat-completion request: the model, the conversation, the tools and the sampling settings.
#[derive(Debug, Clone, PartialEq)]
pub struct ChatRequest {
    /// The model id sent to the provider, already rewritten by [`crate::provider::route`].
    pub model: String,
    /// The conversation so far.
    pub messages: Vec<Message>,
    /// The tools the model may call.
    pub tools: Vec<ToolDefinition>,
    /// When the model must call a tool.
    pub tool_choice: ToolChoice,
    /// Sampling temperature.
    pub temperature: Option<f64>,
    /// Nucleus sampling.
    pub top_p: Option<f64>,
    /// The most tokens the answer may take.
    pub max_tokens: Option<u32>,
    /// How strongly to punish repeating what is already in the conversation.
    pub presence_penalty: Option<f64>,
    /// How strongly to punish repeating itself.
    pub frequency_penalty: Option<f64>,
    /// How hard the model should think.
    pub reasoning_effort: Option<ReasoningEffort>,
    /// The shape the answer must have.
    pub response_format: Option<ResponseFormat>,
    /// Ask the provider for token usage. The old code only got it from OpenRouter; asking every
    /// provider is how the cloud edition charges real tokens instead of an estimate.
    pub include_usage: bool,
    /// Extra fields merged into the request body. The port of `LLM_EXTRA_BODY`.
    pub extra_body: Option<Value>,
}

impl Default for ChatRequest {
    fn default() -> Self {
        Self {
            model: String::new(),
            messages: Vec::new(),
            tools: Vec::new(),
            tool_choice: ToolChoice::default(),
            temperature: None,
            top_p: None,
            max_tokens: None,
            presence_penalty: None,
            frequency_penalty: None,
            reasoning_effort: None,
            response_format: None,
            include_usage: true,
            extra_body: None,
        }
    }
}

impl ChatRequest {
    /// The JSON body sent to `/chat/completions`.
    #[must_use]
    pub fn to_body(&self) -> Value {
        let mut body = serde_json::Map::new();
        body.insert("model".to_owned(), Value::String(self.model.clone()));
        body.insert(
            "messages".to_owned(),
            Value::Array(self.messages.iter().map(message_to_json).collect()),
        );
        if !self.tools.is_empty() {
            body.insert(
                "tools".to_owned(),
                Value::Array(self.tools.iter().map(tool_to_json).collect()),
            );
            body.insert("tool_choice".to_owned(), self.tool_choice.to_json());
        }
        body.insert("stream".to_owned(), Value::Bool(true));
        if self.include_usage {
            body.insert(
                "stream_options".to_owned(),
                object([("include_usage", Value::Bool(true))]),
            );
        }
        if let Some(temperature) = self.temperature {
            body.insert("temperature".to_owned(), number(temperature));
        }
        if let Some(top_p) = self.top_p {
            body.insert("top_p".to_owned(), number(top_p));
        }
        if let Some(max_tokens) = self.max_tokens {
            body.insert("max_tokens".to_owned(), Value::from(max_tokens));
        }
        if let Some(presence_penalty) = self.presence_penalty {
            body.insert("presence_penalty".to_owned(), number(presence_penalty));
        }
        if let Some(frequency_penalty) = self.frequency_penalty {
            body.insert("frequency_penalty".to_owned(), number(frequency_penalty));
        }
        if let Some(effort) = self.reasoning_effort {
            body.insert(
                "reasoning_effort".to_owned(),
                Value::String(effort.as_wire().to_owned()),
            );
        }
        if let Some(format) = &self.response_format {
            body.insert("response_format".to_owned(), format.to_json());
        }
        // The extra body wins over everything else, the way `mergeExtraBody` did.
        if let Some(extra) = &self.extra_body {
            if let Some(fields) = extra.as_object() {
                for (key, value) in fields {
                    body.insert(key.clone(), value.clone());
                }
            }
        }
        Value::Object(body)
    }
}

/// A JSON number, keeping the whole and the fractional part.
fn number(value: f64) -> Value {
    serde_json::Number::from_f64(value).map_or(Value::Null, Value::Number)
}

fn message_to_json(message: &Message) -> Value {
    let mut fields = serde_json::Map::new();
    fields.insert(
        "role".to_owned(),
        Value::String(message.role.as_wire().to_owned()),
    );
    fields.insert(
        "content".to_owned(),
        message.content.clone().map_or(Value::Null, Value::String),
    );
    if let Some(name) = &message.name {
        fields.insert("name".to_owned(), Value::String(name.clone()));
    }
    if let Some(id) = &message.tool_call_id {
        fields.insert("tool_call_id".to_owned(), Value::String(id.clone()));
    }
    if !message.tool_calls.is_empty() {
        let calls: Vec<Value> = message
            .tool_calls
            .iter()
            .map(|call| {
                let arguments = serde_json::to_string(&call.args).unwrap_or_default();
                object([
                    ("id", Value::String(call.id.clone())),
                    ("type", Value::String("function".to_owned())),
                    (
                        "function",
                        object([
                            ("name", Value::String(call.name.clone())),
                            ("arguments", Value::String(arguments)),
                        ]),
                    ),
                ])
            })
            .collect();
        fields.insert("tool_calls".to_owned(), Value::Array(calls));
    }
    Value::Object(fields)
}

fn tool_to_json(tool: &ToolDefinition) -> Value {
    let mut function = serde_json::Map::new();
    function.insert("name".to_owned(), Value::String(tool.name.clone()));
    if let Some(description) = &tool.description {
        function.insert("description".to_owned(), Value::String(description.clone()));
    }
    function.insert("parameters".to_owned(), tool.parameters.clone());
    object([
        ("type", Value::String("function".to_owned())),
        ("function", Value::Object(function)),
    ])
}

/// A JSON object from key/value pairs.
fn object(pairs: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        pairs
            .into_iter()
            .map(|(key, value)| (key.to_owned(), value))
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    type R = Result<(), serde_json::Error>;

    #[test]
    fn body_carries_the_sampling_settings() -> R {
        let request = ChatRequest {
            model: "gpt-4o-mini".to_owned(),
            messages: vec![Message::user("hi")],
            temperature: Some(0.4),
            top_p: Some(0.9),
            max_tokens: Some(256),
            presence_penalty: Some(0.1),
            frequency_penalty: Some(0.2),
            reasoning_effort: Some(ReasoningEffort::High),
            response_format: Some(ResponseFormat::JsonObject),
            ..ChatRequest::default()
        };
        let body = request.to_body();
        assert_eq!(
            body.get("model").and_then(Value::as_str),
            Some("gpt-4o-mini")
        );
        assert_eq!(body.get("stream").and_then(Value::as_bool), Some(true));
        assert_eq!(
            body.get("stream_options")
                .and_then(|o| o.get("include_usage"))
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(body.get("temperature").and_then(Value::as_f64), Some(0.4));
        assert_eq!(body.get("top_p").and_then(Value::as_f64), Some(0.9));
        assert_eq!(body.get("max_tokens").and_then(Value::as_u64), Some(256));
        assert_eq!(
            body.get("reasoning_effort").and_then(Value::as_str),
            Some("high")
        );
        assert_eq!(
            body.get("response_format")
                .and_then(|f| f.get("type"))
                .and_then(Value::as_str),
            Some("json_object")
        );
        let messages = body.get("messages").and_then(Value::as_array);
        assert_eq!(messages.map(Vec::len), Some(1));
        let first = messages.and_then(|m| m.first());
        assert_eq!(
            first.and_then(|m| m.get("role")).and_then(Value::as_str),
            Some("user")
        );
        assert_eq!(
            first.and_then(|m| m.get("content")).and_then(Value::as_str),
            Some("hi")
        );
        Ok(())
    }

    #[test]
    fn unset_settings_are_left_out() -> R {
        let body = ChatRequest::default().to_body();
        assert!(body.get("temperature").is_none());
        assert!(body.get("max_tokens").is_none());
        assert!(body.get("tools").is_none());
        Ok(())
    }

    #[test]
    fn tools_are_sent_in_the_openai_shape() -> R {
        let request = ChatRequest {
            model: "m".to_owned(),
            tools: vec![ToolDefinition {
                name: "web_search".to_owned(),
                description: Some("search the web".to_owned()),
                parameters: serde_json::json!({"type": "object", "properties": {}}),
            }],
            ..ChatRequest::default()
        };
        let body = request.to_body();
        let tools = body.get("tools").and_then(Value::as_array);
        let first = tools.and_then(|t| t.first());
        assert_eq!(
            first.and_then(|t| t.get("type")).and_then(Value::as_str),
            Some("function")
        );
        assert_eq!(
            first
                .and_then(|t| t.get("function"))
                .and_then(|f| f.get("name"))
                .and_then(Value::as_str),
            Some("web_search")
        );
        assert_eq!(
            body.get("tool_choice").and_then(Value::as_str),
            Some("auto")
        );
        Ok(())
    }

    #[test]
    fn the_extra_body_wins_over_the_defaults() -> R {
        let request = ChatRequest {
            model: "m".to_owned(),
            temperature: Some(0.4),
            extra_body: Some(serde_json::json!({"chat_template_kwargs": {"thinking_mode": "off"}})),
            ..ChatRequest::default()
        };
        let body = request.to_body();
        assert_eq!(
            body.get("chat_template_kwargs")
                .and_then(|k| k.get("thinking_mode"))
                .and_then(Value::as_str),
            Some("off")
        );
        assert_eq!(body.get("temperature").and_then(Value::as_f64), Some(0.4));
        Ok(())
    }

    #[test]
    fn an_assistant_message_quotes_its_tool_calls() -> R {
        let call = ToolCall {
            id: "call_1".to_owned(),
            name: "web_search".to_owned(),
            args: serde_json::json!({"q": "rust"}),
        };
        let message = Message {
            role: Role::Assistant,
            content: None,
            name: None,
            tool_call_id: None,
            tool_calls: vec![call.clone()],
        };
        let json = message_to_json(&message);
        assert_eq!(json.get("content"), Some(&Value::Null));
        let calls = json.get("tool_calls").and_then(Value::as_array);
        let first = calls.and_then(|c| c.first());
        assert_eq!(
            first.and_then(|c| c.get("id")).and_then(Value::as_str),
            Some("call_1")
        );
        assert_eq!(
            first
                .and_then(|c| c.get("function"))
                .and_then(|f| f.get("arguments"))
                .and_then(Value::as_str),
            Some(r#"{"q":"rust"}"#)
        );
        Ok(())
    }

    #[test]
    fn a_tool_result_quotes_the_call_it_answers() -> R {
        let call = ToolCall {
            id: "call_1".to_owned(),
            name: "web_search".to_owned(),
            args: Value::Null,
        };
        let json = message_to_json(&Message::tool_result(&call, "the answer"));
        assert_eq!(json.get("role").and_then(Value::as_str), Some("tool"));
        assert_eq!(
            json.get("tool_call_id").and_then(Value::as_str),
            Some("call_1")
        );
        assert_eq!(json.get("name").and_then(Value::as_str), Some("web_search"));
        assert_eq!(
            json.get("content").and_then(Value::as_str),
            Some("the answer")
        );
        Ok(())
    }

    #[test]
    fn the_user_message_never_leaks_upstream_text() {
        let error = LlmError::UpstreamFailed { status: Some(500) };
        let message = error.user_message();
        assert!(!message.contains("500"));
        assert!(message.contains("didn't return a response"));
        assert_eq!(error.code(), ErrorCode::UpstreamFailed);
    }

    #[test]
    fn the_user_messages_are_the_ones_the_old_code_showed() {
        assert_eq!(
            LlmError::Unauthorized.user_message(),
            "The model provider rejected the request — its API key may be missing or invalid. \
             Try a different model."
        );
        assert_eq!(
            LlmError::RateLimited {
                retry_after_seconds: None
            }
            .user_message(),
            "This model is busy or rate-limited right now. Please wait a moment or switch models."
        );
        assert_eq!(
            LlmError::Timeout.user_message(),
            "The model didn't return a response. Please try again or switch models."
        );
    }

    #[test]
    fn usage_adds_up() {
        let mut usage = Usage {
            prompt: 10,
            completion: 5,
            total: 15,
        };
        usage.add(Usage {
            prompt: 1,
            completion: 2,
            total: 3,
        });
        assert_eq!(usage.prompt, 11);
        assert_eq!(usage.completion, 7);
        assert_eq!(usage.total, 18);
    }
}
