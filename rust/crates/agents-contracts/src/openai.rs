//! The OpenAI-compatible `/v1/chat/completions` wire format, exactly as
//! `src/features/agent-api/response.ts` builds it: the streaming `chat.completion.chunk`
//! frames (text deltas, inline figures, the final frame with `sources`, the usage frame,
//! `[DONE]`) and the non-streaming `chat.completion` body.
//!
//! The encoders are frame-level on purpose: the old builders walk a text stream and an
//! inline-figure feed, which live in the LLM layer; here each frame is a pure function of
//! its inputs, and the field order matches the object literals in `response.ts` so the
//! bytes match `JSON.stringify`.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::ui_stream::UI_MESSAGE_STREAM_DONE;

/// The `[DONE]` terminator, the same line the AI SDK stream ends on.
pub const STREAM_DONE_FRAME: &str = UI_MESSAGE_STREAM_DONE;

/// The frame the old builder writes when the text stream itself throws: no `[DONE]`
/// follows, the client sees the stream close early.
pub const STREAM_ERROR_FRAME: &str =
    "data: {\"error\":{\"message\":\"Stream error\",\"type\":\"server_error\"}}\n\n";

/// The message of the error object carried on a frame whose `finish_reason` is `error`
/// (an upstream that ended the stream early; the text above may be truncated).
pub const TRUNCATED_STREAM_ERROR_MESSAGE: &str = "Generation did not complete — the model backend ended the stream early. The text above may be truncated.";

/// The response headers of the streaming endpoint (`createSSEStreamResponse`).
pub const STREAM_HEADERS: [(&str, &str); 4] = [
    ("Content-Type", "text/event-stream"),
    ("Cache-Control", "no-cache"),
    ("Connection", "keep-alive"),
    ("Access-Control-Allow-Origin", "*"),
];

/// The response headers of the non-streaming endpoint (`createJsonResponse`).
pub const JSON_HEADERS: [(&str, &str); 2] = [
    ("Content-Type", "application/json"),
    ("Access-Control-Allow-Origin", "*"),
];

/// Sources (KB documents) an answer drew on, for the client to render references.
///
/// The TypeScript type in `response.ts` declares six fields, but every caller
/// (`agent-api/service.ts`) passes objects that also carry `chunkIndex` and
/// `anchorChunkIndex`, and always sets each optional key — to `null` when there is no
/// value — so the wire shows all eight keys, nulls included. This struct does the same:
/// a field is `null` on the wire when it is `None`, never absent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagSource {
    pub title: String,
    pub section: Option<String>,
    pub document_id: Option<String>,
    pub asset_key: Option<String>,
    pub page: Option<i64>,
    pub chunk_type: Option<String>,
    pub chunk_index: Option<i64>,
    pub anchor_chunk_index: Option<i64>,
}

/// Real token counts, as the old usage frame and body carry them. The old code reads
/// `usage.inputTokens ?? 0` and friends; the caller applies the same default when a
/// provider reports nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Usage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

/// Whether an answer had book material to stand on (`agent-api/grounding.ts`). Present on
/// the wire only when retrieval ran.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Grounding {
    pub grounded: bool,
    /// Best cosine similarity among the retrieved chunks, 0–1, three decimals.
    pub retrieval_score: f64,
}

/// A JSON number the way JavaScript prints it: an integral value has no `.0` (`1`, not
/// `1.0`), because `JSON.stringify(1.0)` is `"1"` while `serde_json` would write `1.0`.
/// Non-finite floats become `null`, as `JSON.stringify(NaN)` does.
pub fn js_number(value: f64) -> Value {
    if !value.is_finite() {
        return Value::Null;
    }
    if value.fract() == 0.0 && value.abs() < 9.007_199_254_740_992e15 {
        return Value::from(value as i64);
    }
    Value::from(value)
}

/// Map the SDK's finish reason onto the OpenAI wire value, as `toOpenAIFinishReason`:
/// `stop`, `length`, `content_filter`, `tool_calls` pass through; everything else —
/// including no reason at all — becomes `error`, which no client mistakes for success.
pub fn to_openai_finish_reason(reason: Option<&str>) -> &'static str {
    match reason {
        Some("stop") => "stop",
        Some("length") => "length",
        Some("content-filter") => "content_filter",
        Some("tool-calls") => "tool_calls",
        _ => "error",
    }
}

/// The request identity every frame or body carries: the request id, the unix-seconds
/// timestamp the old builders take from `Math.floor(Date.now() / 1000)`, and the model
/// id. One value per response, shared by all its frames.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionHead {
    pub request_id: String,
    pub created: u64,
    pub model: String,
}

impl CompletionHead {
    /// The head every chunk shares: `id`, `object`, `created`, `model`, in that order.
    fn chunk_head(&self) -> Map<String, Value> {
        let mut object = Map::new();
        object.insert("id".to_owned(), Value::from(self.request_id.as_str()));
        object.insert("object".to_owned(), Value::from("chat.completion.chunk"));
        object.insert("created".to_owned(), Value::from(self.created));
        object.insert("model".to_owned(), Value::from(self.model.as_str()));
        object
    }
}

fn choice(index: u8, delta: Value, finish_reason: Option<&str>) -> Value {
    let mut choice = Map::new();
    choice.insert("index".to_owned(), Value::from(index));
    choice.insert("delta".to_owned(), delta);
    choice.insert(
        "finish_reason".to_owned(),
        finish_reason.map_or(Value::Null, Value::from),
    );
    Value::Object(choice)
}

fn frame(object: Map<String, Value>) -> String {
    // Same reasoning as `ui_stream::sse_frame`: a `Value` built from strings, integers
    // and this module's own numbers cannot fail to serialise.
    format!(
        "data: {}\n\n",
        serde_json::to_string(&Value::Object(object)).unwrap_or_default()
    )
}

fn truncated_error_object() -> Value {
    let mut error = Map::new();
    error.insert(
        "message".to_owned(),
        Value::from(TRUNCATED_STREAM_ERROR_MESSAGE),
    );
    error.insert("type".to_owned(), Value::from("server_error"));
    Value::Object(error)
}

/// One text delta: `choices[0].delta = { content }`, `finish_reason` still `null`.
pub fn content_chunk_frame(head: &CompletionHead, delta: &str) -> String {
    let mut content = Map::new();
    content.insert("content".to_owned(), Value::from(delta));
    let mut object = head.chunk_head();
    object.insert(
        "choices".to_owned(),
        Value::from(vec![choice(0, Value::Object(content), None)]),
    );
    frame(object)
}

/// One inline-figure frame: an ordinary chunk with an empty delta plus a custom
/// top-level `figure` — OpenAI clients skip it, ours read it. The figure object is the
/// caller's (built by the inline-figure feed); it passes through unchanged.
pub fn figure_chunk_frame(head: &CompletionHead, figure: &Value) -> String {
    let mut object = head.chunk_head();
    object.insert(
        "choices".to_owned(),
        Value::from(vec![choice(0, Value::Object(Map::new()), None)]),
    );
    object.insert("figure".to_owned(), figure.clone());
    frame(object)
}

/// The final chunk: `finish_reason` resolved from the SDK value, then `sources`, then
/// `grounded`/`retrieval_score` when retrieval ran, and the truncated-stream error
/// object when the mapped finish reason is `error`. The old code orders the keys
/// `choices`, `error`, `sources`, `grounded`, `retrieval_score`.
pub fn final_chunk_frame(
    head: &CompletionHead,
    finish_reason: &str,
    sources: &[RagSource],
    grounding: Option<&Grounding>,
) -> String {
    let mut object = head.chunk_head();
    object.insert(
        "choices".to_owned(),
        Value::from(vec![choice(
            0,
            Value::Object(Map::new()),
            Some(finish_reason),
        )]),
    );
    if finish_reason == "error" {
        object.insert("error".to_owned(), truncated_error_object());
    }
    object.insert(
        "sources".to_owned(),
        serde_json::to_value(sources).unwrap_or_default(),
    );
    if let Some(grounding) = grounding {
        object.insert("grounded".to_owned(), Value::from(grounding.grounded));
        object.insert(
            "retrieval_score".to_owned(),
            js_number(grounding.retrieval_score),
        );
    }
    frame(object)
}

/// The terminal usage frame: empty `choices` plus `usage`, so the credit tracker deducts
/// real token counts instead of estimating.
pub fn usage_chunk_frame(head: &CompletionHead, usage: &Usage) -> String {
    let mut tokens = Map::new();
    tokens.insert("prompt_tokens".to_owned(), Value::from(usage.prompt_tokens));
    tokens.insert(
        "completion_tokens".to_owned(),
        Value::from(usage.completion_tokens),
    );
    tokens.insert("total_tokens".to_owned(), Value::from(usage.total_tokens));
    let mut object = head.chunk_head();
    object.insert("choices".to_owned(), Value::from(Vec::<Value>::new()));
    object.insert("usage".to_owned(), Value::Object(tokens));
    frame(object)
}

/// The non-streaming `chat.completion` body, key for key as `createJsonResponse` builds
/// it: `choices` with the assistant message, then the error object when the finish
/// reason is `error`, `usage`, `sources`, the grounding signal when retrieval ran, and
/// `figures` only when the request asked for them (absent rather than empty otherwise).
pub fn completion_body(
    head: &CompletionHead,
    text: &str,
    finish_reason: &str,
    sources: &[RagSource],
    grounding: Option<&Grounding>,
    usage: &Usage,
    figures: Option<&[Value]>,
) -> String {
    let mut message = Map::new();
    message.insert("role".to_owned(), Value::from("assistant"));
    message.insert("content".to_owned(), Value::from(text));
    let mut entry = Map::new();
    entry.insert("index".to_owned(), Value::from(0));
    entry.insert("message".to_owned(), Value::Object(message));
    entry.insert("finish_reason".to_owned(), Value::from(finish_reason));
    let mut object = Map::new();
    object.insert("id".to_owned(), Value::from(head.request_id.as_str()));
    object.insert("object".to_owned(), Value::from("chat.completion"));
    object.insert("created".to_owned(), Value::from(head.created));
    object.insert("model".to_owned(), Value::from(head.model.as_str()));
    object.insert(
        "choices".to_owned(),
        Value::from(vec![Value::Object(entry)]),
    );
    if finish_reason == "error" {
        object.insert("error".to_owned(), truncated_error_object());
    }
    let mut tokens = Map::new();
    tokens.insert("prompt_tokens".to_owned(), Value::from(usage.prompt_tokens));
    tokens.insert(
        "completion_tokens".to_owned(),
        Value::from(usage.completion_tokens),
    );
    tokens.insert("total_tokens".to_owned(), Value::from(usage.total_tokens));
    object.insert("usage".to_owned(), Value::Object(tokens));
    object.insert(
        "sources".to_owned(),
        serde_json::to_value(sources).unwrap_or_default(),
    );
    if let Some(grounding) = grounding {
        object.insert("grounded".to_owned(), Value::from(grounding.grounded));
        object.insert(
            "retrieval_score".to_owned(),
            js_number(grounding.retrieval_score),
        );
    }
    if let Some(figures) = figures {
        object.insert("figures".to_owned(), Value::from(figures.to_vec()));
    }
    // Same reasoning as `frame`: this `Value` cannot fail to serialise.
    serde_json::to_string(&Value::Object(object)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn head() -> CompletionHead {
        CompletionHead {
            request_id: "id1".to_owned(),
            created: 1_700_000_000,
            model: "askv6".to_owned(),
        }
    }

    fn sources() -> Vec<RagSource> {
        vec![
            RagSource {
                title: "IPA Kelas VIII".to_owned(),
                section: Some("Bab 1".to_owned()),
                document_id: Some("doc1".to_owned()),
                asset_key: None,
                page: Some(39),
                chunk_type: Some("text".to_owned()),
                chunk_index: Some(3),
                anchor_chunk_index: None,
            },
            RagSource {
                title: "IPA Kelas VIII".to_owned(),
                section: None,
                document_id: None,
                asset_key: Some("documents/org1/doc1/assets/fig.png".to_owned()),
                page: None,
                chunk_type: Some("figure".to_owned()),
                chunk_index: None,
                anchor_chunk_index: Some(3),
            },
        ]
    }

    #[test]
    fn frames_keep_the_old_key_order() -> Result<(), Box<dyn std::error::Error>> {
        assert_eq!(
            content_chunk_frame(&head(), "Hai"),
            "data: {\"id\":\"id1\",\"object\":\"chat.completion.chunk\",\"created\":1700000000,\"model\":\"askv6\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hai\"},\"finish_reason\":null}]}\n\n"
        );
        assert_eq!(
            final_chunk_frame(&head(), "stop", &sources(), None),
            "data: {\"id\":\"id1\",\"object\":\"chat.completion.chunk\",\"created\":1700000000,\"model\":\"askv6\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"sources\":[{\"title\":\"IPA Kelas VIII\",\"section\":\"Bab 1\",\"documentId\":\"doc1\",\"assetKey\":null,\"page\":39,\"chunkType\":\"text\",\"chunkIndex\":3,\"anchorChunkIndex\":null},{\"title\":\"IPA Kelas VIII\",\"section\":null,\"documentId\":null,\"assetKey\":\"documents/org1/doc1/assets/fig.png\",\"page\":null,\"chunkType\":\"figure\",\"chunkIndex\":null,\"anchorChunkIndex\":3}]}\n\n"
        );
        Ok(())
    }

    #[test]
    fn grounding_scores_print_like_javascript() -> Result<(), Box<dyn std::error::Error>> {
        let grounding = Grounding {
            grounded: false,
            retrieval_score: 0.0,
        };
        let frame = final_chunk_frame(&head(), "stop", &[], Some(&grounding));
        assert!(
            frame.contains("\"grounded\":false,\"retrieval_score\":0}"),
            "{frame}"
        );
        let score = js_number(0.31);
        assert_eq!(score.to_string(), "0.31");
        Ok(())
    }

    #[test]
    fn an_error_finish_reason_carries_the_error_object() -> Result<(), Box<dyn std::error::Error>> {
        let frame = final_chunk_frame(&head(), "error", &[], None);
        assert!(
            frame.contains("\"error\":{\"message\":\"Generation did not complete"),
            "{frame}"
        );
        Ok(())
    }

    #[test]
    fn finish_reason_mapping_matches_the_old_function() {
        assert_eq!(to_openai_finish_reason(Some("stop")), "stop");
        assert_eq!(
            to_openai_finish_reason(Some("content-filter")),
            "content_filter"
        );
        assert_eq!(to_openai_finish_reason(Some("tool-calls")), "tool_calls");
        assert_eq!(to_openai_finish_reason(Some("other")), "error");
        assert_eq!(to_openai_finish_reason(None), "error");
    }

    #[test]
    fn usage_frame_has_empty_choices() -> Result<(), Box<dyn std::error::Error>> {
        assert_eq!(
            usage_chunk_frame(
                &head(),
                &Usage {
                    prompt_tokens: 11,
                    completion_tokens: 7,
                    total_tokens: 18,
                },
            ),
            "data: {\"id\":\"id1\",\"object\":\"chat.completion.chunk\",\"created\":1700000000,\"model\":\"askv6\",\"choices\":[],\"usage\":{\"prompt_tokens\":11,\"completion_tokens\":7,\"total_tokens\":18}}\n\n"
        );
        Ok(())
    }

    #[test]
    fn the_json_body_omits_figures_when_not_asked() -> Result<(), Box<dyn std::error::Error>> {
        let body = completion_body(
            &head(),
            "Halo",
            "stop",
            &[],
            None,
            &Usage {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
            None,
        );
        let body: Value = serde_json::from_str(&body)?;
        assert!(body.get("figures").is_none());
        assert!(body.get("grounded").is_none());
        Ok(())
    }

    #[test]
    fn figures_pass_through_unchanged() -> Result<(), Box<dyn std::error::Error>> {
        let figure = json!({ "n": 3, "cited": true, "mime": "image/webp" });
        let frame = figure_chunk_frame(&head(), &figure);
        assert!(
            frame.contains("\"delta\":{},\"finish_reason\":null}],\"figure\":{\"n\":3"),
            "{frame}"
        );
        Ok(())
    }
}
