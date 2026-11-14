//! `POST /v1/chat/completions`: the agent, reached from another platform.
//!
//! Old: `src/app/api/v1/chat/route.ts` over `src/features/agent-api/service.ts`. The wire
//! format is the OpenAI one, framed by `agents_contracts::openai`; the pipeline behind it is
//! the plain chat's (`routes/chat`, through [`super::turn`]): the same system prompt, the same
//! tools, the same 409 gate, so an agent reached over the API answers the way it answers in
//! the dashboard.
//!
//! What is deliberately not the same (docs/port/differences.md, rows 140–146):
//! - there is no conversation and no memory: the old route kept neither, and the memory tools
//!   belong to the chat service, so the caller replays the conversation every time;
//! - the knowledge base is refused (409), because retrieval is not part of this phase;
//! - a chatflow or a tool the port cannot run is a 409 through the same gate, where the old
//!   route answered 422 for a chatflow alone;
//! - every error is the standard body plus the OpenAI `type` the old route sent
//!   (`authentication_error`, `permission_error`, …), so an OpenAI SDK still branches on it.

use std::io;

use axum::Router;
use axum::body::{Body as AxumBody, Bytes};
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, Response, StatusCode};
use axum::routing::post;
use futures::StreamExt;
use serde_json::Value;
use tokio::sync::mpsc;

use agents_contracts::error_codes::ErrorCode;
use agents_contracts::openai::{
    CompletionHead, Grounding, JSON_HEADERS, STREAM_DONE_FRAME, STREAM_ERROR_FRAME, STREAM_HEADERS,
    Usage as WireUsage, completion_body, content_chunk_frame, final_chunk_frame,
    to_openai_finish_reason, usage_chunk_frame,
};
use agents_llm::agent_loop::{AgentEvent, run_agent_loop};
use agents_llm::client::Cancel;
use agents_llm::types::{Event, FinishReason, Usage};
use agents_store::api_keys;

use crate::AppState;
use crate::http::ApiError;
use crate::http::client_ip::ClientIp;
use crate::http::json::Body;
use crate::routes::chat::{llm_error, request};

use super::bodies::{self, Completion};

use super::key_auth::{self, Scope};
use super::turn::{self, Prepared};

/// The largest error body the route rewrites; the standard body is far smaller.
const ERROR_BODY_LIMIT: usize = 64 * 1024;

/// How many frames the response waits for before the writer catches up.
const FRAME_BUFFER: usize = 32;

/// The output room the old route always reserved when the request named none, so a long answer
/// could not run into the deployment's context ceiling.
const RESERVED_OUTPUT_TOKENS: u32 = 1024;

/// Every answer is reachable from another origin: an OpenAI client on a web page is one.
const CORS: (&str, &str) = ("Access-Control-Allow-Origin", "*");
const OPTIONS_HEADERS: [(&str, &str); 3] = [
    CORS,
    ("Access-Control-Allow-Methods", "POST, OPTIONS"),
    (
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
    ),
];

pub fn router() -> Router<AppState> {
    Router::new().route("/v1/chat/completions", post(completions).options(options))
}

/// `OPTIONS /v1/chat/completions`: the pre-flight a browser sends before a Bearer request.
async fn options() -> Response<AxumBody> {
    let mut response = Response::new(AxumBody::empty());
    *response.status_mut() = StatusCode::NO_CONTENT;
    add_headers(&mut response, &OPTIONS_HEADERS);
    response
}

/// `POST /v1/chat/completions`.
async fn completions(
    State(state): State<AppState>,
    headers: HeaderMap,
    ip: ClientIp,
    body: Option<Body<Value>>,
) -> Response<AxumBody> {
    match run(state, headers, ip, body).await {
        Ok(response) => response,
        // A refusal keeps the CORS header: a browser's client has to be able to read it.
        Err(error) => {
            let mut response = openai_error(error).await;
            add_headers(&mut response, &[CORS]);
            response
        }
    }
}

/// The standard error body with the OpenAI `type` beside `code`: the old route answered
/// `{"error": {"message", "type"}}` and an OpenAI SDK branches on `type`.
async fn openai_error(error: ApiError) -> Response<AxumBody> {
    let kind = openai_error_type(error.code);
    let response = ApiError::into_response(error, &crate::http::request_id::current());
    let (mut parts, body) = response.into_parts();
    let Ok(bytes) = axum::body::to_bytes(body, ERROR_BODY_LIMIT).await else {
        return Response::from_parts(parts, AxumBody::empty());
    };
    let mut value: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    if let Some(inner) = value.get_mut("error").and_then(Value::as_object_mut) {
        inner.insert("type".to_owned(), Value::from(kind));
    }
    parts.headers.remove(axum::http::header::CONTENT_LENGTH);
    Response::from_parts(parts, AxumBody::from(value.to_string()))
}

/// The OpenAI error type the old route sent for each kind of refusal.
const fn openai_error_type(code: ErrorCode) -> &'static str {
    match code.status() {
        401 => "authentication_error",
        403 => "permission_error",
        404 => "not_found_error",
        429 => "rate_limit_error",
        status if status >= 500 => "server_error",
        _ => "invalid_request_error",
    }
}

/// The whole request, from the key to the last frame.
async fn run(
    state: AppState,
    headers: HeaderMap,
    ip: ClientIp,
    body: Option<Body<Value>>,
) -> Result<Response<AxumBody>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(crate::routes::organizations::missing_body());
    };

    // The scope a key needs depends on `stream`, and the key is checked before the body is
    // validated, so the raw field is read first (a wrong type is refused a moment later).
    let scope = if bodies::wants_stream(&body) {
        Scope::ChatStream
    } else {
        Scope::Chat
    };
    let Some(presented) = key_auth::presented(&headers) else {
        return Err(ApiError::new(ErrorCode::Unauthenticated)
            .message("Missing or invalid Authorization header. Expected: Bearer rantai_sk_..."));
    };
    let caller = key_auth::authenticate(&state, presented, scope, ip).await?;
    let input = bodies::parse_completion(&body)?;

    // One statement, so two calls at the same moment never lose a count.
    api_keys::record_use(&state.db, &caller.key.id, agents_store::now())
        .await
        .map_err(|error| {
            tracing::warn!(error = %error, "the key's use count could not be written");
            ApiError::new(ErrorCode::Internal)
        })?;

    // The client cannot say "stop" on this transport beyond dropping the connection, and the
    // response is written by the same task, so the handle only closes the loop early.
    let (handle, cancel) = Cancel::channel();
    let prepared = turn::prepare(&state, &caller, &chat_input(&input), cancel).await?;
    let prepared = with_request_options(prepared, &input);
    let head = CompletionHead {
        // The old id was `chatcmpl-<base36 millis>-<base36 random>`. It is opaque to clients,
        // so this one is hexadecimal.
        request_id: format!(
            "chatcmpl-{:x}-{}",
            chrono::Utc::now().timestamp_millis(),
            &agents_store::new_id()[..6]
        ),
        created: u64::try_from(chrono::Utc::now().timestamp()).unwrap_or_default(),
        model: prepared.model_id.clone(),
    };

    if input.stream {
        Ok(streamed(state.http.clone(), prepared, handle, head))
    } else {
        answered(state.http.clone(), prepared, handle, head).await
    }
}

/// The request, as the chat pipeline reads it.
///
/// The OpenAI body has no message ids and no assistant id (the key names the agent), so the ids
/// are made up here and the agent is passed separately.
fn chat_input(input: &Completion) -> request::ChatInput {
    let messages = input
        .messages
        .iter()
        .enumerate()
        .map(|(index, message)| request::ChatMessage {
            id: format!("msg_{index}"),
            role: message.role.clone(),
            content: message.content.clone(),
            reply_to: None,
            edit_history: None,
        })
        .collect();
    request::ChatInput {
        body: request::ChatRequest {
            messages,
            // The gate refuses a request that names a knowledge base rather than answering it
            // from material this phase does not retrieve.
            knowledge_base_group_ids: input.knowledge_base_ids.clone(),
            ..request::ChatRequest::default()
        },
        headers: request::ChatHeaders::default(),
        unported_parts: false,
    }
}

/// The sampling the request asked for, over the agent's own, and the output room the old route
/// always reserved. The request wins, then the agent's config, then the default.
fn with_request_options(mut prepared: Prepared, input: &Completion) -> Prepared {
    prepared.request.temperature = input.temperature.or(prepared.request.temperature);
    prepared.request.top_p = input.top_p.or(prepared.request.top_p);
    prepared.request.max_tokens = input
        .max_tokens
        .or(prepared.request.max_tokens)
        .or(Some(RESERVED_OUTPUT_TOKENS));
    prepared
}

/// What the model answered.
#[derive(Default)]
struct Answer {
    text: String,
    usage: Usage,
    /// The OpenAI finish reason, once the model said why it stopped.
    finish: Option<&'static str>,
}

/// Where the deltas go while the loop runs.
#[derive(Clone, Copy)]
enum Sink<'a> {
    /// The non-streaming answer collects the text and sends nothing.
    Collect,
    /// The streaming answer writes a chunk per delta.
    Frames(
        &'a mpsc::Sender<Result<Bytes, io::Error>>,
        &'a CompletionHead,
    ),
}

/// The non-streaming answer: the whole text, then one body.
async fn answered(
    client: reqwest::Client,
    prepared: Prepared,
    handle: agents_llm::client::CancelHandle,
    head: CompletionHead,
) -> Result<Response<AxumBody>, ApiError> {
    let mut answer = Answer::default();
    let failure = drive(&client, &prepared, Sink::Collect, &mut answer).await?;
    // The answer is on the wire: the turn is over.
    handle.cancel();
    prepared
        .meter
        .record(&prepared.context.as_context(), answer.usage);
    if let Some(message) = failure {
        return Err(ApiError::new(ErrorCode::UpstreamFailed).message(message));
    }

    let finish = answer.finish.unwrap_or("error");
    let body = completion_body(
        &head,
        &answer.text,
        finish,
        &[],
        None::<&Grounding>,
        &wire_usage(answer.usage),
        None,
    );
    let mut response = Response::new(AxumBody::from(body));
    add_headers(&mut response, &JSON_HEADERS);
    Ok(response)
}

/// The streaming answer: a chunk per delta, then the final chunk, the usage and `[DONE]`.
fn streamed(
    client: reqwest::Client,
    prepared: Prepared,
    handle: agents_llm::client::CancelHandle,
    head: CompletionHead,
) -> Response<AxumBody> {
    let (tx, rx) = mpsc::channel::<Result<Bytes, io::Error>>(FRAME_BUFFER);
    tokio::spawn(async move {
        let mut answer = Answer::default();
        // A client that hangs up stops the model call: the loop may be waiting on the model,
        // not writing, so it would never see the closed channel by itself.
        let driven = tokio::select! {
            driven = drive(&client, &prepared, Sink::Frames(&tx, &head), &mut answer) => driven,
            () = tx.closed() => {
                handle.cancel();
                return;
            }
        };
        match driven {
            // A stream that broke writes the error frame and no `[DONE]`, the way the old
            // builder's catch did: the client sees the stream close early.
            Err(_) | Ok(Some(_)) => {
                handle.cancel();
                send(&tx, STREAM_ERROR_FRAME).await;
                return;
            }
            Ok(None) => {}
        }

        let finish = answer.finish.unwrap_or("error");
        send(&tx, &final_chunk_frame(&head, finish, &[], None)).await;
        send(&tx, &usage_chunk_frame(&head, &wire_usage(answer.usage))).await;
        send(&tx, STREAM_DONE_FRAME).await;
        drop(handle);
        prepared
            .meter
            .record(&prepared.context.as_context(), answer.usage);
    });

    let body = AxumBody::from_stream(futures::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    }));
    let mut response = Response::new(body);
    add_headers(&mut response, &STREAM_HEADERS);
    response
}

/// Runs the loop, collecting the answer and — when the sink asks for them — writing deltas.
///
/// `Ok(Some(message))` is a failure the model reported or the loop stopped on (a gated tool
/// call with nobody to ask, differences.md row 145); `Err` is a call that failed outright.
async fn drive(
    client: &reqwest::Client,
    prepared: &Prepared,
    sink: Sink<'_>,
    answer: &mut Answer,
) -> Result<Option<String>, ApiError> {
    let mut events = Box::pin(run_agent_loop(
        client,
        &prepared.provider,
        prepared.request.clone(),
        prepared.executor.as_ref(),
        prepared.max_steps,
        prepared.cancel.clone(),
    ));
    while let Some(event) = events.next().await {
        let event = event.map_err(|error| llm_error(&error))?;
        match event {
            AgentEvent::Model(Event::TextDelta { text }) => {
                answer.text.push_str(&text);
                if let Sink::Frames(tx, head) = sink {
                    send(tx, &content_chunk_frame(head, &text)).await;
                }
            }
            AgentEvent::Model(Event::Finish { reason }) => {
                answer.finish = Some(to_openai_finish_reason(Some(finish_name(reason))));
            }
            AgentEvent::StepFinish { usage, .. } | AgentEvent::TotalUsage { usage } => {
                answer.usage = usage;
            }
            AgentEvent::Model(Event::Error { message }) => return Ok(Some(message)),
            AgentEvent::ApprovalRequired { name, reason, .. } => {
                return Ok(Some(format!(
                    "The tool {name} needs a decision before it can run: {reason}"
                )));
            }
            // Everything else — the text part opening, a tool call, a tool result — has no
            // place in the OpenAI wire format, which carries the text and the reason it ended.
            _ => {}
        }
    }
    Ok(None)
}

/// The model's reason, in the names the OpenAI mapping reads.
const fn finish_name(reason: FinishReason) -> &'static str {
    match reason {
        FinishReason::Stop => "stop",
        FinishReason::Length => "length",
        FinishReason::ToolCalls => "tool-calls",
        FinishReason::ContentFilter => "content-filter",
        FinishReason::Other => "other",
    }
}

/// The usage, in the wire shape. A provider that reports nothing reads as zero, which is what
/// the old `?? 0` did.
const fn wire_usage(usage: Usage) -> WireUsage {
    WireUsage {
        prompt_tokens: usage.prompt as u64,
        completion_tokens: usage.completion as u64,
        total_tokens: usage.total as u64,
    }
}

/// Inserts the headers an answer carries.
///
/// `from_bytes`, not `from_static`: the contract module spells the names the way the old code
/// did (`Content-Type`), and `from_static` panics on anything but lowercase.
fn add_headers<B>(response: &mut Response<B>, headers: &[(&'static str, &'static str)]) {
    for (name, value) in headers {
        if let (Ok(name), Ok(value)) = (
            axum::http::HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            response.headers_mut().insert(name, value);
        }
    }
}

/// Sends one frame, ignoring a client that went away.
async fn send(tx: &mpsc::Sender<Result<Bytes, io::Error>>, frame: &str) {
    let _ = tx.send(Ok(Bytes::from(frame.to_owned()))).await;
}
