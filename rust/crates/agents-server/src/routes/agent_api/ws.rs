//! `GET /v1/agents/{assistantId}/ws`: the agent, on a socket.
//!
//! New in this slice (design §3.6): the TypeScript had no WebSocket for an agent. The
//! conversation is the socket's — one at a time — and the frames are:
//!
//! client → `{"type":"auth","key":"rantai_sk_…"}` (only when the handshake carried no
//! `Authorization` header), `{"type":"message","content":"…","sessionId":"…"}`,
//! `{"type":"ping"}`
//!
//! server → `{"type":"chunk","chunk":{…}}` (an AI-SDK UI-stream chunk, the ones the dashboard
//! chat sends), `{"type":"done","sessionId":"…"}`, `{"type":"error","code":"…","message":"…"}`,
//! `{"type":"pong"}`
//!
//! The key is checked before the connection is upgraded when the handshake carries it, so a
//! caller with the wrong key gets a 401 and never reaches the socket; when it arrives in the
//! first message the connection has ten seconds to present one and is closed with 4401
//! (`unauthorised`) otherwise. A key that belongs to another agent closes the same way: the
//! credential does not open this agent, and saying so is the whole point of the check.
//!
//! The conversation lives in this process (differences.md row 144), keyed by a random session
//! id that only the key that created it may resume: there is no session table, and a resume
//! after a restart starts a new conversation.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::Duration;

use axum::Router;
use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use futures::StreamExt;
use serde_json::{Value, json};
use tokio::sync::mpsc;

use agents_contracts::error_codes::ErrorCode;
use agents_llm::client::{Cancel, CancelHandle};

use crate::AppState;
use crate::http::ApiError;
use crate::http::client_ip::ClientIp;
use crate::routes::chat::{request, stream};

use super::bodies::CompletionMessage;
use super::key_auth::{self, KeyCaller, Scope};
use super::secret;
use super::turn;

/// The close code a client reads as "this socket is not authenticated for this agent".
const CLOSE_UNAUTHORISED: u16 = 4401;
/// The close code for a socket that said nothing for too long.
const CLOSE_IDLE: u16 = 4408;

/// What a socket may do, and for how long.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    /// How long a connection that carried no key has to send one.
    pub auth_timeout: Duration,
    /// How long a socket may sit silent before it is closed.
    pub idle_timeout: Duration,
    /// The largest frame accepted, in bytes.
    pub max_frame: usize,
    /// How many messages one conversation keeps; the oldest are dropped.
    pub max_messages: usize,
    /// How many conversations the process remembers.
    pub max_conversations: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            auth_timeout: Duration::from_secs(10),
            idle_timeout: Duration::from_secs(300),
            max_frame: 256 * 1024,
            max_messages: 40,
            max_conversations: 500,
        }
    }
}

/// The conversations this process remembers, for a client that reconnects with a `sessionId`.
#[derive(Debug)]
pub struct Conversations {
    inner: Mutex<Inner>,
}

#[derive(Debug, Default)]
struct Inner {
    /// Oldest first: the front is evicted when the map is full.
    order: VecDeque<String>,
    by_id: HashMap<String, Conversation>,
}

#[derive(Debug, Clone)]
struct Conversation {
    /// The key that created it. Another key's session id is not a session.
    key_id: String,
    assistant_id: String,
    messages: Vec<CompletionMessage>,
}

impl Conversations {
    /// An empty registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Starts a conversation for this key and agent.
    fn create(&self, limits: &Limits, key_id: &str, assistant_id: &str) -> Option<String> {
        let id = secret::random_id().ok()?;
        let mut inner = self.inner.lock().ok()?;
        while inner.by_id.len() >= limits.max_conversations {
            let Some(oldest) = inner.order.pop_front() else {
                break;
            };
            inner.by_id.remove(&oldest);
        }
        inner.order.push_back(id.clone());
        inner.by_id.insert(
            id.clone(),
            Conversation {
                key_id: key_id.to_owned(),
                assistant_id: assistant_id.to_owned(),
                messages: Vec::new(),
            },
        );
        Some(id)
    }

    /// The conversation a client asked to resume, when it is this key's and this agent's.
    fn resume(&self, key_id: &str, assistant_id: &str, id: &str) -> Option<Vec<CompletionMessage>> {
        let inner = self.inner.lock().ok()?;
        let conversation = inner.by_id.get(id)?;
        (conversation.key_id == key_id && conversation.assistant_id == assistant_id)
            .then(|| conversation.messages.clone())
    }

    /// Adds one message, dropping the oldest when the conversation is full.
    fn append(&self, limits: &Limits, id: &str, message: CompletionMessage) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        let Some(conversation) = inner.by_id.get_mut(id) else {
            return;
        };
        conversation.messages.push(message);
        let excess = conversation
            .messages
            .len()
            .saturating_sub(limits.max_messages);
        if excess > 0 {
            conversation.messages.drain(..excess);
        }
    }

    /// The conversation as the model reads it.
    fn messages(&self, id: &str) -> Vec<CompletionMessage> {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.by_id.get(id).map(|c| c.messages.clone()))
            .unwrap_or_default()
    }
}

impl Default for Conversations {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/v1/agents/{assistant_id}/ws", get(upgrade))
}

/// `GET /v1/agents/{assistantId}/ws`.
///
/// A key in the handshake is checked here, so a wrong one never opens a socket; without one the
/// first message carries it.
async fn upgrade(
    State(state): State<AppState>,
    Path(assistant_id): Path<String>,
    headers: HeaderMap,
    ip: ClientIp,
    ws: WebSocketUpgrade,
) -> Response {
    let ip = ip.text();
    let presented = key_auth::presented(&headers).map(str::to_owned);
    let caller = match presented {
        Some(key) => {
            match key_auth::authenticate(&state, &key, Scope::ChatStream, ip.as_deref()).await {
                Ok(caller) if caller.key.assistant_id == assistant_id => Some(caller),
                // A valid key that belongs to another agent does not open this one.
                Ok(_) => {
                    return ApiError::into_response(
                        ApiError::new(ErrorCode::Unauthenticated)
                            .message("This API key belongs to another agent"),
                        &crate::http::request_id::current(),
                    );
                }
                Err(error) => {
                    return ApiError::into_response(error, &crate::http::request_id::current());
                }
            }
        }
        None => None,
    };
    ws.on_upgrade(move |socket| session(state, socket, assistant_id, caller, ip))
        .into_response()
}

/// One socket, and everything its frames change.
struct Connection {
    socket: WebSocket,
    /// The conversation this socket is in, once one exists.
    session_id: Option<String>,
    /// The turn that is running, when one is.
    running: Option<CancelHandle>,
    /// Where a running turn sends its frames.
    out: mpsc::Sender<Out>,
}

/// One socket, from the key to the close.
async fn session(
    state: AppState,
    socket: WebSocket,
    assistant_id: String,
    caller: Option<KeyCaller>,
    ip: Option<String>,
) {
    let limits = state.api.limits;
    let (out, mut incoming) = mpsc::channel::<Out>(32);
    let mut connection = Connection {
        socket,
        session_id: None,
        running: None,
        out,
    };

    let caller = match caller {
        Some(caller) => caller,
        None => {
            match first_message_key(&state, &mut connection.socket, &assistant_id, ip.as_deref())
                .await
            {
                Some(caller) => caller,
                None => {
                    close(&mut connection.socket, CLOSE_UNAUTHORISED, "unauthorised").await;
                    return;
                }
            }
        }
    };
    // One count per socket, as one HTTP call counts once.
    if let Err(error) =
        agents_store::api_keys::record_use(&state.db, &caller.key.id, agents_store::now()).await
    {
        tracing::warn!(error = %error, "the key's use count could not be written");
    }

    loop {
        let idle = tokio::time::sleep(limits.idle_timeout);
        tokio::pin!(idle);
        tokio::select! {
            () = &mut idle => {
                cancel(&mut connection.running);
                close(&mut connection.socket, CLOSE_IDLE, "idle timeout").await;
                return;
            }
            frame = connection.socket.recv() => {
                match frame {
                    Some(Ok(Message::Text(text))) => {
                        handle_text(&state, &limits, &caller, &assistant_id, &text, &mut connection)
                            .await;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        cancel(&mut connection.running);
                        return;
                    }
                    Some(Ok(Message::Binary(bytes))) => {
                        let _ = send(
                            &mut connection.socket,
                            &error_frame(
                                ErrorCode::UnsupportedMediaType,
                                "This socket carries JSON text frames only.",
                            ),
                        )
                        .await;
                        tracing::debug!(bytes = bytes.len(), "a binary frame was refused");
                    }
                    // The protocol answers a ping itself; nothing to do.
                    Some(Ok(_)) => {}
                    Some(Err(_)) => {
                        cancel(&mut connection.running);
                        return;
                    }
                }
            }
            output = incoming.recv(), if connection.session_id.is_some() => {
                let Some(output) = output else { return };
                match output {
                    Out::Chunk(chunk) => {
                        let frame = json!({"type": "chunk", "chunk": chunk}).to_string();
                        if send(&mut connection.socket, &frame).await.is_err() {
                            cancel(&mut connection.running);
                            return;
                        }
                    }
                    Out::Done { text } => {
                        let id = connection.session_id.clone().unwrap_or_default();
                        if !text.is_empty() {
                            state.api.conversations.append(
                                &limits,
                                &id,
                                CompletionMessage {
                                    role: "assistant".to_owned(),
                                    content: text,
                                },
                            );
                        }
                        connection.running = None;
                        let frame = json!({"type": "done", "sessionId": id}).to_string();
                        if send(&mut connection.socket, &frame).await.is_err() {
                            return;
                        }
                    }
                    Out::Failed { code, message } => {
                        connection.running = None;
                        if send(&mut connection.socket, &error_frame(code, &message))
                            .await
                            .is_err()
                        {
                            return;
                        }
                    }
                }
            }
        }
    }
}

/// What a running turn sends back to the socket's task.
enum Out {
    /// One UI-stream chunk.
    Chunk(Value),
    /// The turn ended; the text is what the conversation keeps.
    Done { text: String },
    /// The turn could not start, or stopped early.
    Failed { code: ErrorCode, message: String },
}

/// One incoming text frame.
async fn handle_text(
    state: &AppState,
    limits: &Limits,
    caller: &KeyCaller,
    assistant_id: &str,
    text: &str,
    connection: &mut Connection,
) {
    if text.len() > limits.max_frame {
        let _ = send(
            &mut connection.socket,
            &error_frame(ErrorCode::PayloadTooLarge, "This frame is too large."),
        )
        .await;
        return;
    }
    let frame: Value = match serde_json::from_str(text) {
        Ok(frame) => frame,
        Err(_) => {
            let _ = send(
                &mut connection.socket,
                &error_frame(ErrorCode::InvalidRequest, "A frame must be a JSON object."),
            )
            .await;
            return;
        }
    };
    match frame.get("type").and_then(Value::as_str) {
        Some("ping") => {
            let _ = send(&mut connection.socket, "{\"type\":\"pong\"}").await;
        }
        Some("auth") => {
            // The socket is authenticated already; a second key changes nothing.
            let _ = send(
                &mut connection.socket,
                &error_frame(ErrorCode::Conflict, "This socket is already authenticated."),
            )
            .await;
        }
        Some("message") => {
            if connection.running.is_some() {
                // One turn at a time: the answer to the first is still being written.
                let _ = send(
                    &mut connection.socket,
                    &error_frame(ErrorCode::Conflict, "A turn is already running."),
                )
                .await;
                return;
            }
            let Some(content) = frame.get("content").and_then(Value::as_str) else {
                let _ = send(
                    &mut connection.socket,
                    &error_frame(ErrorCode::InvalidRequest, "A message needs text content."),
                )
                .await;
                return;
            };
            if content.trim().is_empty() {
                let _ = send(
                    &mut connection.socket,
                    &error_frame(ErrorCode::InvalidRequest, "A message needs text content."),
                )
                .await;
                return;
            }
            // A `sessionId` resumes a conversation this key created; anything else starts one.
            if let Some(requested) = frame.get("sessionId").and_then(Value::as_str)
                && let Some(messages) =
                    state
                        .api
                        .conversations
                        .resume(&caller.key.id, assistant_id, requested)
            {
                connection.session_id = Some(requested.to_owned());
                tracing::debug!(messages = messages.len(), "a conversation was resumed");
            }
            let id = match connection.session_id.clone() {
                Some(id) => id,
                None => match state
                    .api
                    .conversations
                    .create(limits, &caller.key.id, assistant_id)
                {
                    Some(id) => {
                        connection.session_id = Some(id.clone());
                        id
                    }
                    None => {
                        let _ = send(
                            &mut connection.socket,
                            &error_frame(
                                ErrorCode::Internal,
                                "A conversation could not be started.",
                            ),
                        )
                        .await;
                        return;
                    }
                },
            };
            state.api.conversations.append(
                limits,
                &id,
                CompletionMessage {
                    role: "user".to_owned(),
                    content: content.to_owned(),
                },
            );
            let messages = state.api.conversations.messages(&id);
            let (handle, cancel) = Cancel::channel();
            connection.running = Some(handle);
            tokio::spawn(run_turn(
                state.clone(),
                caller.clone(),
                id,
                messages,
                connection.out.clone(),
                cancel,
            ));
        }
        _ => {
            let _ = send(
                &mut connection.socket,
                &error_frame(ErrorCode::InvalidRequest, "Unknown frame type."),
            )
            .await;
        }
    }
}

/// The first frame of a connection that carried no key: `{"type":"auth","key":"…"}`.
async fn first_message_key(
    state: &AppState,
    socket: &mut WebSocket,
    assistant_id: &str,
    ip: Option<&str>,
) -> Option<KeyCaller> {
    let waited = tokio::time::timeout(state.api.limits.auth_timeout, async {
        loop {
            match socket.recv().await {
                Some(Ok(Message::Text(text))) => return Some(text),
                Some(Ok(Message::Close(_))) | None => return None,
                Some(Err(_)) => return None,
                Some(Ok(_)) => {}
            }
        }
    })
    .await
    .ok()
    .flatten()?;
    let frame: Value = serde_json::from_str(&waited).ok()?;
    if frame.get("type").and_then(Value::as_str) != Some("auth") {
        return None;
    }
    let key = frame.get("key").and_then(Value::as_str)?;
    let caller = key_auth::authenticate(state, key, Scope::ChatStream, ip)
        .await
        .ok()?;
    // A key for another agent does not open this one.
    (caller.key.assistant_id == assistant_id).then_some(caller)
}

/// One turn: the pipeline, the UI-stream chunks, and the text the conversation keeps.
async fn run_turn(
    state: AppState,
    caller: KeyCaller,
    session_id: String,
    messages: Vec<CompletionMessage>,
    out: mpsc::Sender<Out>,
    cancel: Cancel,
) {
    let input = chat_input(&messages);
    let prepared = match turn::prepare(&state, &caller, &input, cancel).await {
        Ok(prepared) => prepared,
        Err(error) => {
            let _ = out
                .send(Out::Failed {
                    code: error.code,
                    message: error.code.message().to_owned(),
                })
                .await;
            return;
        }
    };

    let mut frames = stream::Frames::with_tools(prepared.tools.clone());
    if pipe(&out, &stream::Frames::start()).await.is_err() {
        return;
    }
    let mut events = Box::pin(agents_llm::agent_loop::run_agent_loop(
        &state.http,
        &prepared.provider,
        prepared.request.clone(),
        prepared.executor.as_ref(),
        prepared.max_steps,
        prepared.cancel.clone(),
    ));
    while let Some(event) = events.next().await {
        match event {
            Ok(event) => {
                let written = frames.on_event(event);
                if pipe(&out, &written).await.is_err() {
                    return;
                }
            }
            Err(error) => {
                let written = frames.on_error(&stream::error_message(&error));
                let _ = pipe(&out, &written).await;
                break;
            }
        }
    }
    // The frames that end the stream: `finish` says why the answer stopped. The `[DONE]` the
    // same builder appends is the SSE terminator, and this socket has a `done` frame instead.
    let closed = frames.close();
    if pipe(&out, &closed).await.is_err() {
        return;
    }
    prepared
        .meter
        .record(&prepared.context.as_context(), frames.usage);
    // The `[DONE]` frame closes the SSE stream; on a socket the `done` frame does that job.
    let _ = out.send(Out::Done { text: frames.text }).await;
    tracing::debug!(session = %session_id, "a turn ended");
}

/// Writes the frames of one event as chunks, and gives up when the socket's task is gone.
async fn pipe(out: &mpsc::Sender<Out>, frames: &[axum::body::Bytes]) -> Result<(), ()> {
    for frame in frames {
        let Some(chunk) = chunk_of(frame) else {
            continue;
        };
        out.send(Out::Chunk(chunk)).await.map_err(|_| ())?;
    }
    Ok(())
}

/// The JSON chunk an SSE frame carries, or `None` for the `[DONE]` terminator.
fn chunk_of(frame: &axum::body::Bytes) -> Option<Value> {
    let text = std::str::from_utf8(frame).ok()?;
    let payload = text.strip_prefix("data: ")?.trim_end();
    if payload == "[DONE]" {
        return None;
    }
    serde_json::from_str(payload).ok()
}

/// The conversation as the chat pipeline reads it: the messages so far, with made-up ids.
fn chat_input(messages: &[CompletionMessage]) -> request::ChatInput {
    let messages = messages
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
            ..request::ChatRequest::default()
        },
        headers: request::ChatHeaders::default(),
        unported_parts: false,
    }
}

/// One error frame.
fn error_frame(code: ErrorCode, message: &str) -> String {
    json!({
        "type": "error",
        "code": code.as_str(),
        "message": message,
    })
    .to_string()
}

/// Sends one text frame.
async fn send(socket: &mut WebSocket, text: &str) -> Result<(), axum::Error> {
    socket.send(Message::Text(text.to_owned().into())).await
}

/// Closes the socket with a code the client can branch on.
async fn close(socket: &mut WebSocket, code: u16, reason: &str) {
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code,
            reason: reason.to_owned().into(),
        })))
        .await;
}

/// Stops the turn that is running, when one is.
fn cancel(running: &mut Option<CancelHandle>) {
    if let Some(handle) = running.take() {
        handle.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_chunk_is_the_json_the_sse_frame_carries() {
        let frame = axum::body::Bytes::from_static(
            b"data: {\"type\":\"text-delta\",\"id\":\"txt-0\",\"delta\":\"Hai\"}\n\n",
        );
        let chunk = chunk_of(&frame).unwrap_or(Value::Null);
        assert_eq!(
            chunk.get("type").and_then(Value::as_str),
            Some("text-delta")
        );
        assert_eq!(chunk.get("delta").and_then(Value::as_str), Some("Hai"));

        let done = axum::body::Bytes::from_static(b"data: [DONE]\n\n");
        assert!(chunk_of(&done).is_none());
    }

    #[test]
    fn a_session_belongs_to_the_key_and_agent_that_made_it() {
        let conversations = Conversations::new();
        let limits = Limits::default();
        let Some(id) = conversations.create(&limits, "key-a", "agent-1") else {
            return;
        };
        assert!(conversations.resume("key-a", "agent-1", &id).is_some());
        assert!(conversations.resume("key-b", "agent-1", &id).is_none());
        assert!(conversations.resume("key-a", "agent-2", &id).is_none());
        assert!(conversations.resume("key-a", "agent-1", "nope").is_none());
    }

    #[test]
    fn a_conversation_drops_its_oldest_messages() {
        let conversations = Conversations::new();
        let limits = Limits {
            max_messages: 2,
            ..Limits::default()
        };
        let Some(id) = conversations.create(&limits, "key", "agent") else {
            return;
        };
        for content in ["one", "two", "three"] {
            conversations.append(
                &limits,
                &id,
                CompletionMessage {
                    role: "user".to_owned(),
                    content: content.to_owned(),
                },
            );
        }
        let messages: Vec<String> = conversations
            .messages(&id)
            .into_iter()
            .map(|message| message.content)
            .collect();
        assert_eq!(messages, vec!["two".to_owned(), "three".to_owned()]);
    }
}
