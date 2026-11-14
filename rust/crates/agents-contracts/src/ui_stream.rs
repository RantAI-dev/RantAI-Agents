//! The AI SDK v6 UI message stream (what `@ai-sdk/react` 6.0.x parses) and its SSE framing.
//!
//! The chunk shapes, field orders and header names mirror the installed `ai` package
//! (6.0.39): `src/ui-message-stream/ui-message-chunks.ts` (the zod schema), the chunk
//! construction in `src/generate-text/stream-text.ts`, `JsonToSseTransformStream` and
//! `UI_MESSAGE_STREAM_HEADERS`. Every field name is the wire name (`camelCase`); the
//! `type` tag is written first, the way `JSON.stringify` on a plain chunk object does.
//!
//! This app adds three response headers (`X-Tool-Approval`, `X-RAG-Trace`,
//! `X-Model-Fallback`) and, today, a non-standard `sources` frame after `[DONE]`. The
//! Rust chat service instead sends standard `source-document` chunks before `finish`
//! (differences.md row 32); [`legacy_sources_frame`] still produces the old frame so the
//! UI can be migrated in the same slice.

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Map, Value};

use crate::openai::RagSource;

/// The terminator `JsonToSseTransformStream` flushes after the last chunk.
pub const UI_MESSAGE_STREAM_DONE: &str = "data: [DONE]\n\n";

/// The headers `createUIMessageStreamResponse` sets (`UI_MESSAGE_STREAM_HEADERS` in the
/// `ai` package), in the order the SDK's object literal lists them.
pub const UI_MESSAGE_STREAM_HEADERS: [(&str, &str); 5] = [
    ("content-type", "text/event-stream"),
    ("cache-control", "no-cache"),
    ("connection", "keep-alive"),
    ("x-vercel-ai-ui-message-stream", "v1"),
    ("x-accel-buffering", "no"),
];

/// Header carrying the tool names the client renders Approve/Deny for, comma-joined
/// (`chat-public/service.ts`, passed to `toUIMessageStreamResponse`).
pub const TOOL_APPROVAL_HEADER: &str = "X-Tool-Approval";

/// Header carrying the RAG trace id (`appendSourcesEventToUiStreamResponse`).
pub const RAG_TRACE_HEADER: &str = "X-RAG-Trace";

/// Header the free plan sets when a paid model was swapped for the Free Models Router
/// (set by agents-cloud; the dashboard only checks that it is present).
pub const MODEL_FALLBACK_HEADER: &str = "X-Model-Fallback";

/// The value of [`TOOL_APPROVAL_HEADER`]: the approval-gated tool names, comma-joined.
pub fn tool_approval_header_value(tools: &[&str]) -> String {
    tools.join(",")
}

/// The `finishReason` values the SDK accepts on a `finish` chunk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FinishReason {
    Stop,
    Length,
    ContentFilter,
    ToolCalls,
    Error,
    Other,
}

/// One `data-*` chunk. The suffix after `data-` is the caller's part name, so the whole
/// object (tag included) is carried as a JSON value.
#[derive(Debug, Clone, PartialEq)]
pub struct DataChunk(pub Value);

// -- Chunk payloads. Field declaration order is the wire order: it matches how the SDK
// -- builds each chunk object in `stream-text.ts`, so the SSE bytes match JSON.stringify.

/// `start` — the response begins. `messageMetadata` is written before `messageId`, the
/// way `stream-text.ts` spreads them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartChunk {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_metadata: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
}

/// `error` — a readable message for the client's error bubble (`onError` in the old
/// service turned upstream failures into text before writing the chunk).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorChunk {
    pub error_text: String,
}

/// `start-step` — one agent loop step begins.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StartStepChunk {}

/// `finish-step` — one agent loop step is done.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FinishStepChunk {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextStartChunk {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDeltaChunk {
    pub id: String,
    pub delta: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextEndChunk {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningStartChunk {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningDeltaChunk {
    pub id: String,
    pub delta: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningEndChunk {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInputStartChunk {
    pub tool_call_id: String,
    pub tool_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_executed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInputDeltaChunk {
    pub tool_call_id: String,
    pub input_text_delta: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInputAvailableChunk {
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_executed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInputErrorChunk {
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_executed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic: Option<bool>,
    pub error_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolApprovalRequestChunk {
    pub approval_id: String,
    pub tool_call_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOutputAvailableChunk {
    pub tool_call_id: String,
    pub output: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_executed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preliminary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOutputErrorChunk {
    pub tool_call_id: String,
    pub error_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_executed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOutputDeniedChunk {
    pub tool_call_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceUrlChunk {
    pub source_id: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocumentChunk {
    pub source_id: String,
    pub media_type: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

/// `file` — the SDK writes `mediaType` before `url` (`stream-text.ts`, the `file` case).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChunk {
    pub media_type: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishChunk {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<FinishReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbortChunk {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// `message-metadata` — metadata for a part that is not `start` or `finish`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageMetadataChunk {
    pub message_metadata: Value,
}

/// One UI message stream chunk: the union the SDK's `uiMessageChunkSchema` accepts, plus
/// the `data-*` chunks. Serialised with the `type` tag first, exactly the bytes
/// `JSON.stringify` produces for the equivalent plain object.
#[derive(Debug, Clone, PartialEq)]
pub enum UiChunk {
    Start(StartChunk),
    Error(ErrorChunk),
    StartStep(StartStepChunk),
    FinishStep(FinishStepChunk),
    TextStart(TextStartChunk),
    TextDelta(TextDeltaChunk),
    TextEnd(TextEndChunk),
    ReasoningStart(ReasoningStartChunk),
    ReasoningDelta(ReasoningDeltaChunk),
    ReasoningEnd(ReasoningEndChunk),
    ToolInputStart(ToolInputStartChunk),
    ToolInputDelta(ToolInputDeltaChunk),
    ToolInputAvailable(ToolInputAvailableChunk),
    ToolInputError(ToolInputErrorChunk),
    ToolApprovalRequest(ToolApprovalRequestChunk),
    ToolOutputAvailable(ToolOutputAvailableChunk),
    ToolOutputError(ToolOutputErrorChunk),
    ToolOutputDenied(ToolOutputDeniedChunk),
    SourceUrl(SourceUrlChunk),
    SourceDocument(SourceDocumentChunk),
    File(FileChunk),
    Finish(FinishChunk),
    Abort(AbortChunk),
    MessageMetadata(MessageMetadataChunk),
    Data(DataChunk),
}

impl UiChunk {
    /// The chunk as a JSON object with the `type` tag first, the rest of the fields in
    /// payload order. `data-*` chunks carry their own tag inside the value.
    fn tagged_object(&self) -> Result<Value, serde_json::Error> {
        match self {
            UiChunk::Start(chunk) => tagged("start", chunk),
            UiChunk::Error(chunk) => tagged("error", chunk),
            UiChunk::StartStep(chunk) => tagged("start-step", chunk),
            UiChunk::FinishStep(chunk) => tagged("finish-step", chunk),
            UiChunk::TextStart(chunk) => tagged("text-start", chunk),
            UiChunk::TextDelta(chunk) => tagged("text-delta", chunk),
            UiChunk::TextEnd(chunk) => tagged("text-end", chunk),
            UiChunk::ReasoningStart(chunk) => tagged("reasoning-start", chunk),
            UiChunk::ReasoningDelta(chunk) => tagged("reasoning-delta", chunk),
            UiChunk::ReasoningEnd(chunk) => tagged("reasoning-end", chunk),
            UiChunk::ToolInputStart(chunk) => tagged("tool-input-start", chunk),
            UiChunk::ToolInputDelta(chunk) => tagged("tool-input-delta", chunk),
            UiChunk::ToolInputAvailable(chunk) => tagged("tool-input-available", chunk),
            UiChunk::ToolInputError(chunk) => tagged("tool-input-error", chunk),
            UiChunk::ToolApprovalRequest(chunk) => tagged("tool-approval-request", chunk),
            UiChunk::ToolOutputAvailable(chunk) => tagged("tool-output-available", chunk),
            UiChunk::ToolOutputError(chunk) => tagged("tool-output-error", chunk),
            UiChunk::ToolOutputDenied(chunk) => tagged("tool-output-denied", chunk),
            UiChunk::SourceUrl(chunk) => tagged("source-url", chunk),
            UiChunk::SourceDocument(chunk) => tagged("source-document", chunk),
            UiChunk::File(chunk) => tagged("file", chunk),
            UiChunk::Finish(chunk) => tagged("finish", chunk),
            UiChunk::Abort(chunk) => tagged("abort", chunk),
            UiChunk::MessageMetadata(chunk) => tagged("message-metadata", chunk),
            UiChunk::Data(data) => Ok(data.0.clone()),
        }
    }
}

fn tagged<T: Serialize>(tag: &'static str, payload: &T) -> Result<Value, serde_json::Error> {
    let payload = serde_json::to_value(payload)?;
    let mut object = Map::new();
    object.insert("type".to_owned(), Value::from(tag));
    if let Some(fields) = payload.as_object() {
        for (key, value) in fields {
            object.insert(key.clone(), value.clone());
        }
    }
    Ok(Value::Object(object))
}

impl Serialize for UiChunk {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self.tagged_object() {
            Ok(value) => value.serialize(serializer),
            Err(error) => Err(serde::ser::Error::custom(error)),
        }
    }
}

impl<'de> Deserialize<'de> for UiChunk {
    // The wire format is JSON, so reading into a `serde_json::Value` first is enough; a
    // non-self-describing deserializer would not be able to dispatch on `type` anyway.
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        parse_chunk(value).map_err(serde::de::Error::custom)
    }
}

fn parse_chunk(value: Value) -> Result<UiChunk, String> {
    let tag = value
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing chunk type".to_owned())?
        .to_owned();
    let parsed = match tag.as_str() {
        "start" => serde_json::from_value::<StartChunk>(value).map(UiChunk::Start),
        "error" => serde_json::from_value::<ErrorChunk>(value).map(UiChunk::Error),
        "start-step" => serde_json::from_value::<StartStepChunk>(value).map(UiChunk::StartStep),
        "finish-step" => serde_json::from_value::<FinishStepChunk>(value).map(UiChunk::FinishStep),
        "text-start" => serde_json::from_value::<TextStartChunk>(value).map(UiChunk::TextStart),
        "text-delta" => serde_json::from_value::<TextDeltaChunk>(value).map(UiChunk::TextDelta),
        "text-end" => serde_json::from_value::<TextEndChunk>(value).map(UiChunk::TextEnd),
        "reasoning-start" => {
            serde_json::from_value::<ReasoningStartChunk>(value).map(UiChunk::ReasoningStart)
        }
        "reasoning-delta" => {
            serde_json::from_value::<ReasoningDeltaChunk>(value).map(UiChunk::ReasoningDelta)
        }
        "reasoning-end" => {
            serde_json::from_value::<ReasoningEndChunk>(value).map(UiChunk::ReasoningEnd)
        }
        "tool-input-start" => {
            serde_json::from_value::<ToolInputStartChunk>(value).map(UiChunk::ToolInputStart)
        }
        "tool-input-delta" => {
            serde_json::from_value::<ToolInputDeltaChunk>(value).map(UiChunk::ToolInputDelta)
        }
        "tool-input-available" => serde_json::from_value::<ToolInputAvailableChunk>(value)
            .map(UiChunk::ToolInputAvailable),
        "tool-input-error" => {
            serde_json::from_value::<ToolInputErrorChunk>(value).map(UiChunk::ToolInputError)
        }
        "tool-approval-request" => serde_json::from_value::<ToolApprovalRequestChunk>(value)
            .map(UiChunk::ToolApprovalRequest),
        "tool-output-available" => serde_json::from_value::<ToolOutputAvailableChunk>(value)
            .map(UiChunk::ToolOutputAvailable),
        "tool-output-error" => {
            serde_json::from_value::<ToolOutputErrorChunk>(value).map(UiChunk::ToolOutputError)
        }
        "tool-output-denied" => {
            serde_json::from_value::<ToolOutputDeniedChunk>(value).map(UiChunk::ToolOutputDenied)
        }
        "source-url" => serde_json::from_value::<SourceUrlChunk>(value).map(UiChunk::SourceUrl),
        "source-document" => {
            serde_json::from_value::<SourceDocumentChunk>(value).map(UiChunk::SourceDocument)
        }
        "file" => serde_json::from_value::<FileChunk>(value).map(UiChunk::File),
        "finish" => serde_json::from_value::<FinishChunk>(value).map(UiChunk::Finish),
        "abort" => serde_json::from_value::<AbortChunk>(value).map(UiChunk::Abort),
        "message-metadata" => {
            serde_json::from_value::<MessageMetadataChunk>(value).map(UiChunk::MessageMetadata)
        }
        // The payload structs ignore the `type` key, so the tagged object parses into
        // them unchanged.
        tag if tag.starts_with("data-") => Ok(UiChunk::Data(DataChunk(value))),
        other => return Err(format!("unknown chunk type {other}")),
    };
    parsed.map_err(|error| format!("invalid {tag} chunk: {error}"))
}

/// One SSE frame exactly as `JsonToSseTransformStream` writes it: `data: {json}\n\n`.
pub fn sse_frame(chunk: &UiChunk) -> String {
    // Serialization cannot fail here: every payload field is a string, a bool or a
    // `serde_json::Value`, and a `Value` parsed from JSON cannot hold a NaN that would
    // break `to_string`. The fallback keeps the encoder total without a panic.
    format!(
        "data: {}\n\n",
        serde_json::to_string(chunk).unwrap_or_default()
    )
}

/// The RAG sources for one answer as standard `source-document` chunks, to send before
/// `finish` (differences.md row 32). One chunk per source:
///
/// - `sourceId`: the document id, else the asset key, else the title;
/// - `mediaType`: `image/webp` for figure chunks (the app encodes figures as webp),
///   `text/plain` otherwise;
/// - `title`: the document title, `filename`: the section (absent when null);
/// - `providerMetadata.rantai`: the fields the wire type has no slot for (`page`,
///   `assetKey`, `chunkIndex`, `anchorChunkIndex`, nulls omitted), dropped when all
///   four are null.
pub fn rag_source_chunks(sources: &[RagSource]) -> Vec<UiChunk> {
    sources
        .iter()
        .map(|source| {
            let rantai = rantai_metadata(source);
            UiChunk::SourceDocument(SourceDocumentChunk {
                source_id: source
                    .document_id
                    .clone()
                    .or_else(|| source.asset_key.clone())
                    .unwrap_or_else(|| source.title.clone()),
                media_type: source_media_type(source).to_owned(),
                title: source.title.clone(),
                filename: source.section.clone(),
                provider_metadata: rantai,
            })
        })
        .collect()
}

fn source_media_type(source: &RagSource) -> &'static str {
    if source.chunk_type.as_deref() == Some("figure") {
        "image/webp"
    } else {
        "text/plain"
    }
}

fn rantai_metadata(source: &RagSource) -> Option<Value> {
    let mut rantai = Map::new();
    if let Some(page) = source.page {
        rantai.insert("page".to_owned(), Value::from(page));
    }
    if let Some(asset_key) = source.asset_key.clone() {
        rantai.insert("assetKey".to_owned(), Value::from(asset_key));
    }
    if let Some(chunk_index) = source.chunk_index {
        rantai.insert("chunkIndex".to_owned(), Value::from(chunk_index));
    }
    if let Some(anchor_chunk_index) = source.anchor_chunk_index {
        rantai.insert(
            "anchorChunkIndex".to_owned(),
            Value::from(anchor_chunk_index),
        );
    }
    if rantai.is_empty() {
        return None;
    }
    let mut metadata = Map::new();
    metadata.insert("rantai".to_owned(), Value::Object(rantai));
    Some(Value::Object(metadata))
}

/// The legacy frame this app appends after `[DONE]`
/// (`chat-public/service.ts`, `appendSourcesEventToUiStreamResponse`, the UI parses it in
/// `conversations/components/chat/chat-workspace.tsx`, the `"sources"` case). The Rust
/// service does not send it any more — [`rag_source_chunks`] replaces it — but the frame
/// stays available so the UI can be migrated in the same slice.
pub fn legacy_sources_frame(sources: &[RagSource]) -> String {
    // Same fallback reasoning as `sse_frame`: parsed JSON cannot fail to serialise.
    format!(
        "data: {{\"type\":\"sources\",\"sources\":{}}}\n\n",
        serde_json::to_string(sources).unwrap_or_default()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn frames_match_json_stringify_key_order() -> Result<(), Box<dyn std::error::Error>> {
        let chunk = UiChunk::TextDelta(TextDeltaChunk {
            id: "text-1".to_owned(),
            delta: "Hai".to_owned(),
            provider_metadata: None,
        });
        assert_eq!(
            sse_frame(&chunk),
            "data: {\"type\":\"text-delta\",\"id\":\"text-1\",\"delta\":\"Hai\"}\n\n"
        );
        Ok(())
    }

    #[test]
    fn optional_fields_are_absent_when_none() -> Result<(), Box<dyn std::error::Error>> {
        let bare = UiChunk::ToolOutputAvailable(ToolOutputAvailableChunk {
            tool_call_id: "call1".to_owned(),
            output: json!("ok"),
            provider_executed: None,
            preliminary: None,
            dynamic: None,
        });
        assert_eq!(
            sse_frame(&bare),
            "data: {\"type\":\"tool-output-available\",\"toolCallId\":\"call1\",\"output\":\"ok\"}\n\n"
        );
        Ok(())
    }

    #[test]
    fn data_chunks_keep_their_own_type() -> Result<(), Box<dyn std::error::Error>> {
        let chunk = UiChunk::Data(DataChunk(json!({
            "type": "data-trace",
            "data": { "traceId": "t1" },
            "transient": true,
        })));
        assert_eq!(
            sse_frame(&chunk),
            "data: {\"type\":\"data-trace\",\"data\":{\"traceId\":\"t1\"},\"transient\":true}\n\n"
        );
        let payload = sse_frame(&chunk)
            .strip_prefix("data: ")
            .and_then(|frame| frame.strip_suffix("\n\n"))
            .map(|frame| frame.to_owned())
            .ok_or("frame is not an SSE data line")?;
        let parsed: UiChunk = serde_json::from_str(&payload)?;
        assert_eq!(parsed, chunk);
        Ok(())
    }
}
