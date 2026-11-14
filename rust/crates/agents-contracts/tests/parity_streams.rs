//! Byte parity with the TypeScript wire format.
//!
//! The cases come from `port/cases/streams.jsonl`, which `port/oracle/streams.ts`
//! generated: the UI message stream frames were written by the real installed `ai`
//! package (`JsonToSseTransformStream`, `UI_MESSAGE_STREAM_HEADERS`), the OpenAI
//! frames by the OLD `src/features/agent-api/response.ts`. No expected value was
//! written by hand.
//!
//! The frozen timestamp and model name match the oracle (`Date.now` frozen, model
//! `askv6`).

use std::error::Error;
use std::fs;

use agents_contracts::openai::{
    CompletionHead, Grounding, RagSource, STREAM_DONE_FRAME, STREAM_ERROR_FRAME, STREAM_HEADERS,
    Usage, completion_body, content_chunk_frame, figure_chunk_frame, final_chunk_frame, js_number,
    to_openai_finish_reason, usage_chunk_frame,
};
use agents_contracts::ui_stream::{
    UI_MESSAGE_STREAM_DONE, UI_MESSAGE_STREAM_HEADERS, UiChunk, legacy_sources_frame, sse_frame,
    tool_approval_header_value,
};
use serde::Deserialize;
use serde_json::{Map, Value};

const CASES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../port/cases/streams.jsonl"
);

/// The unix seconds the oracle's frozen `Date.now` produces.
const CREATED: u64 = 1_765_418_400;

/// The model id the oracle passes everywhere.
const MODEL: &str = "askv6";

#[derive(Deserialize)]
struct Case {
    kind: String,
    input: Value,
    expected: Value,
}

impl Case {
    /// Frame kinds carry the expected bytes as a string; the header kinds carry an
    /// object, which is compared as the compact JSON the oracle wrote it as.
    fn expected_text(&self) -> Result<String, Box<dyn Error>> {
        match self.expected.as_str() {
            Some(text) => Ok(text.to_owned()),
            None => Ok(serde_json::to_string(&self.expected)?),
        }
    }
}

#[derive(Deserialize)]
struct GroundingInput {
    grounded: bool,
    #[serde(rename = "retrieval_score")]
    retrieval_score: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageInput {
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
}

/// The raw SDK finish reason the case carries. When a stream/body case has none, the
/// oracle's fake result still resolved `"stop"`; only the direct mapping case tests an
/// absent reason against `toOpenAIFinishReason(undefined)`.
fn finish_reason_from(case: &Case) -> Result<Option<String>, Box<dyn Error>> {
    let object = input_object(case)?;
    let value = object
        .get("finishReason")
        .or_else(|| object.get("reason"))
        .cloned()
        .unwrap_or(Value::Null);
    Ok(value.as_str().map(str::to_owned))
}

fn head(request_id: &str) -> CompletionHead {
    CompletionHead {
        request_id: request_id.to_owned(),
        created: CREATED,
        model: MODEL.to_owned(),
    }
}

fn input_object(case: &Case) -> Result<&Map<String, Value>, Box<dyn Error>> {
    case.input
        .as_object()
        .ok_or_else(|| format!("input of {} is not an object", case.kind).into())
}

fn field<'a>(case: &'a Case, name: &str) -> Result<&'a Value, Box<dyn Error>> {
    input_object(case)?
        .get(name)
        .ok_or_else(|| format!("input of {} has no {name}", case.kind).into())
}

fn field_str<'a>(case: &'a Case, name: &str) -> Result<&'a str, Box<dyn Error>> {
    field(case, name)?
        .as_str()
        .ok_or_else(|| format!("{name} is not a string").into())
}

fn optional_sources(case: &Case) -> Result<Vec<RagSource>, Box<dyn Error>> {
    let value = input_object(case)?
        .get("sources")
        .cloned()
        .unwrap_or(Value::Array(Vec::new()));
    Ok(serde_json::from_value(value)?)
}

fn optional_grounding(case: &Case) -> Result<Option<Grounding>, Box<dyn Error>> {
    let value = input_object(case)?
        .get("grounding")
        .cloned()
        .unwrap_or(Value::Null);
    if value.is_null() {
        return Ok(None);
    }
    let grounding: GroundingInput = serde_json::from_value(value)?;
    Ok(Some(Grounding {
        grounded: grounding.grounded,
        retrieval_score: grounding.retrieval_score,
    }))
}

/// The oracle's fake result resolves `{ inputTokens: 11, outputTokens: 7, totalTokens: 18
/// }` unless the case says `usage: null` (unavailable, no frame).
fn optional_usage(case: &Case) -> Result<Option<Usage>, Box<dyn Error>> {
    let value = input_object(case)?
        .get("usage")
        .cloned()
        .unwrap_or(Value::Bool(true));
    if value.is_null() {
        return Ok(None);
    }
    if value.as_bool() == Some(true) {
        return Ok(Some(Usage {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18,
        }));
    }
    let usage: UsageInput = serde_json::from_value(value)?;
    Ok(Some(Usage {
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
    }))
}

fn optional_figures(case: &Case) -> Result<Option<Vec<Value>>, Box<dyn Error>> {
    let value = input_object(case)?
        .get("figures")
        .cloned()
        .unwrap_or(Value::Null);
    if value.is_null() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_value(value)?))
}

fn headers_case(headers: &[(&str, &str)], expected: &Value) -> Result<String, Box<dyn Error>> {
    let mut object = Map::new();
    for (name, value) in headers {
        object.insert((*name).to_owned(), Value::from(*value));
    }
    let built = serde_json::to_string(&Value::Object(object))?;
    // The oracle wrote the object with `JSON.stringify`; key order counts, so the
    // comparison is on the compact text, not the parsed value.
    let expected = serde_json::to_string(expected)?;
    if built != expected {
        return Err(format!("headers differ: {built} != {expected}").into());
    }
    Ok(built)
}

/// The whole SSE text the Rust encoders produce for the chunks in the case input.
fn ui_stream_from_input(case: &Case) -> Result<String, Box<dyn Error>> {
    let chunks = field(case, "chunks")?
        .as_array()
        .ok_or("chunks is not an array")?;
    let mut text = String::new();
    for chunk in chunks {
        let chunk: UiChunk = serde_json::from_value(chunk.clone())?;
        text.push_str(&sse_frame(&chunk));
    }
    text.push_str(UI_MESSAGE_STREAM_DONE);
    Ok(text)
}

fn openai_stream_from_input(case: &Case) -> Result<String, Box<dyn Error>> {
    let head = head(field_str(case, "requestId")?);
    let deltas = field(case, "deltas")?
        .as_array()
        .ok_or("deltas is not an array")?;
    let mut text = String::new();
    for delta in deltas {
        let delta = delta.as_str().ok_or("a delta is not a string")?;
        text.push_str(&content_chunk_frame(&head, delta));
    }
    let finish_reason = finish_reason_from(case)?;
    text.push_str(&final_chunk_frame(
        &head,
        to_openai_finish_reason(finish_reason.as_deref().or(Some("stop"))),
        &optional_sources(case)?,
        optional_grounding(case)?.as_ref(),
    ));
    if let Some(usage) = optional_usage(case)? {
        text.push_str(&usage_chunk_frame(&head, &usage));
    }
    text.push_str(STREAM_DONE_FRAME);
    Ok(text)
}

fn openai_body_from_input(case: &Case) -> Result<String, Box<dyn Error>> {
    let head = head(field_str(case, "requestId")?);
    let finish_reason = finish_reason_from(case)?;
    Ok(completion_body(
        &head,
        field_str(case, "text")?,
        to_openai_finish_reason(finish_reason.as_deref().or(Some("stop"))),
        &optional_sources(case)?,
        optional_grounding(case)?.as_ref(),
        // The old body always carries usage; the oracle freezes the same counts.
        &Usage {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18,
        },
        optional_figures(case)?.as_deref(),
    ))
}

fn run(case: &Case) -> Result<String, Box<dyn Error>> {
    match case.kind.as_str() {
        "ui-stream" => ui_stream_from_input(case),
        "ui-terminator" => Ok(UI_MESSAGE_STREAM_DONE.to_owned()),
        "ui-headers" => Ok(headers_case(&UI_MESSAGE_STREAM_HEADERS, &case.expected)?),
        "legacy-sources-frame" => {
            let sources: Vec<RagSource> = serde_json::from_value(field(case, "sources")?.clone())?;
            Ok(legacy_sources_frame(&sources))
        }
        "openai-stream" => openai_stream_from_input(case),
        "openai-stream-error" => Ok(STREAM_ERROR_FRAME.to_owned()),
        "openai-figure-frame" => {
            let head = head(field_str(case, "requestId")?);
            Ok(figure_chunk_frame(&head, field(case, "figure")?))
        }
        "openai-completion-body" => openai_body_from_input(case),
        "openai-finish-reason" => {
            Ok(to_openai_finish_reason(finish_reason_from(case)?.as_deref()).to_owned())
        }
        "openai-headers" => Ok(headers_case(&STREAM_HEADERS, &case.expected)?),
        other => Err(format!("unknown kind {other}").into()),
    }
}

#[test]
fn sse_frames_match_the_installed_sdk_byte_for_byte() -> Result<(), Box<dyn Error>> {
    let text = fs::read_to_string(CASES)?;
    let mut total = 0;
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        total += 1;
        let case: Case = serde_json::from_str(line)?;
        let actual = run(&case)?;
        assert_eq!(
            actual,
            case.expected_text()?,
            "case {total} ({})",
            case.kind
        );
    }
    assert_eq!(total, 78, "the case file changed without the oracle");
    Ok(())
}

/// The new pre-`finish` way of sending sources has no old TypeScript to compare with, so
/// these expectations are written here on purpose; the wire behaviour they replace (the
/// legacy frame) is covered by the oracle cases above. See differences.md row 32.
#[test]
fn rag_sources_become_source_document_chunks() -> Result<(), Box<dyn Error>> {
    let sources: Vec<RagSource> = serde_json::from_str(
        r#"[
            {"title":"IPA Kelas VIII","section":"Bab 1","documentId":"doc1","assetKey":null,"page":39,"chunkType":"text","chunkIndex":3,"anchorChunkIndex":null},
            {"title":"IPA Kelas VIII","section":"Gambar 1.11","documentId":null,"assetKey":"documents/org1/doc1/fig.png","page":40,"chunkType":"figure","chunkIndex":null,"anchorChunkIndex":4},
            {"title":"Tanpa apa pun","section":null,"documentId":null,"assetKey":null,"page":null,"chunkType":null,"chunkIndex":null,"anchorChunkIndex":null}
        ]"#,
    )?;
    let chunks = agents_contracts::ui_stream::rag_source_chunks(&sources);
    let text: String = chunks.iter().map(sse_frame).collect();
    let expected = [
        "data: {\"type\":\"source-document\",\"sourceId\":\"doc1#3\",\"mediaType\":\"text/plain\",\"title\":\"IPA Kelas VIII\",\"filename\":\"Bab 1\",\"providerMetadata\":{\"rantai\":{\"page\":39,\"chunkType\":\"text\",\"chunkIndex\":3}}}\n\n",
        "data: {\"type\":\"source-document\",\"sourceId\":\"documents/org1/doc1/fig.png\",\"mediaType\":\"image/png\",\"title\":\"IPA Kelas VIII\",\"filename\":\"Gambar 1.11\",\"providerMetadata\":{\"rantai\":{\"page\":40,\"assetKey\":\"documents/org1/doc1/fig.png\",\"chunkType\":\"figure\",\"anchorChunkIndex\":4}}}\n\n",
        "data: {\"type\":\"source-document\",\"sourceId\":\"Tanpa apa pun\",\"mediaType\":\"text/plain\",\"title\":\"Tanpa apa pun\"}\n\n",
    ]
    .concat();
    assert_eq!(text, expected);
    Ok(())
}

#[test]
fn the_approval_header_joins_tool_names() {
    assert_eq!(
        tool_approval_header_value(&["knowledge_search", "artifact_create"]),
        "knowledge_search,artifact_create"
    );
    assert_eq!(tool_approval_header_value(&[]), "");
}

/// Used nowhere else in this file; kept so the formatting helper is exercised beside the
/// oracle cases that show it (e.g. `"retrieval_score":0` in the req-4 stream).
#[test]
fn integral_floats_print_like_javascript() {
    assert_eq!(js_number(0.0).to_string(), "0");
    assert_eq!(js_number(0.31).to_string(), "0.31");
    assert_eq!(js_number(2.0).to_string(), "2");
}
