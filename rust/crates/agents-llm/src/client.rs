//! The HTTP client: one chat completion, streamed.
//!
//! Ported from the `streamText` call in `src/features/chat-public/service.ts`. The AI SDK did
//! the message conversion, the step loop and the `<think>` extraction for the old code; here they
//! are explicit: this module turns the provider's bytes into [`Event`]s, and [`crate::agent_loop`]
//! runs the steps.

use std::collections::{BTreeMap, VecDeque};

use futures::Stream;
use serde_json::Value;
use tokio::sync::watch;

use crate::provider::Provider;
use crate::sse::{SseEvent, SseParser};
use crate::types::{ChatRequest, Event, FinishReason, LlmError, Usage};

/// A signal the caller trips to stop an in-flight stream.
///
/// The old code passed an `AbortSignal`; the Rust port uses a `tokio::sync::watch` channel, so
/// there is no extra dependency and the same signal can stop several streams at once.
#[derive(Debug, Clone)]
pub struct Cancel {
    rx: watch::Receiver<bool>,
    /// Holds the channel open when the caller has no handle, so [`Cancel::cancelled`] waits
    /// forever instead of seeing the sender go away.
    _keepalive: watch::Sender<bool>,
}

/// The caller's side of a [`Cancel`].
#[derive(Debug, Clone)]
pub struct CancelHandle {
    tx: watch::Sender<bool>,
}

impl CancelHandle {
    /// Stop every stream watching this signal.
    pub fn cancel(&self) {
        let _ = self.tx.send(true);
    }
}

impl Cancel {
    /// A signal that is never tripped.
    #[must_use]
    pub fn never() -> Self {
        let (tx, rx) = watch::channel(false);
        Self { rx, _keepalive: tx }
    }

    /// A signal, and the handle that trips it.
    #[must_use]
    pub fn channel() -> (CancelHandle, Self) {
        let (tx, rx) = watch::channel(false);
        let handle = CancelHandle { tx: tx.clone() };
        (handle, Self { rx, _keepalive: tx })
    }

    /// Whether the signal has been tripped.
    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        *self.rx.borrow()
    }

    /// Resolves once the signal is tripped.
    pub async fn cancelled(&self) {
        let mut rx = self.rx.clone();
        if *rx.borrow_and_update() {
            return;
        }
        while rx.changed().await.is_ok() {
            if *rx.borrow_and_update() {
                return;
            }
        }
    }
}

/// The `<think>` tag and the `</think>` tag.
const OPEN_TAG: &str = "<think>";
const CLOSE_TAG: &str = "</think>";
/// The longest prefix of a tag that can still turn into one.
const OPEN_PEEK: usize = OPEN_TAG.len() - 1;
const CLOSE_PEEK: usize = CLOSE_TAG.len() - 1;

/// Splits `<think>…</think>` reasoning out of the text stream.
///
/// Ported from `createExtractThinkTransform` in `src/lib/llm/strip-think.ts`. The tags can be
/// split across deltas, so the characters that could still become a tag are held back: six
/// outside a block and seven inside one. A block that is never closed is dropped at the end,
/// because losing a planning blob beats leaking one.
#[derive(Debug, Default)]
struct ThinkExtractor {
    in_think: bool,
    buffer: String,
    emitted_text: bool,
    reasoning_started: bool,
}

impl ThinkExtractor {
    fn push(&mut self, text: &str, events: &mut VecDeque<Result<Event, LlmError>>) {
        self.buffer.push_str(text);
        let mut out_text = String::new();
        let mut out_reason = String::new();
        loop {
            if self.in_think {
                match self.buffer.find(CLOSE_TAG) {
                    Some(index) => {
                        out_reason.push_str(self.buffer.get(..index).unwrap_or(""));
                        self.buffer = self
                            .buffer
                            .get(index + CLOSE_TAG.len()..)
                            .unwrap_or("")
                            .to_owned();
                        self.in_think = false;
                        // The model usually sends "\n\n" right after the close tag; one blank
                        // line keeps the answer readable.
                        let trimmed = self.buffer.trim_start();
                        let whitespace = self.buffer.len() - trimmed.len();
                        if whitespace > 0 {
                            self.buffer = trimmed.to_owned();
                            if self.emitted_text {
                                out_text.push_str("\n\n");
                            }
                        }
                    }
                    None => {
                        out_reason.push_str(before_last_chars(&self.buffer, CLOSE_PEEK));
                        self.buffer = last_chars(&self.buffer, CLOSE_PEEK).to_owned();
                        break;
                    }
                }
            } else {
                match self.buffer.find(OPEN_TAG) {
                    Some(index) => {
                        out_text.push_str(self.buffer.get(..index).unwrap_or(""));
                        self.buffer = self
                            .buffer
                            .get(index + OPEN_TAG.len()..)
                            .unwrap_or("")
                            .to_owned();
                        self.in_think = true;
                        // Two think blocks in one answer are two segments of one reasoning
                        // part; the blank line keeps them apart.
                        if self.reasoning_started {
                            out_reason.push_str("\n\n");
                        } else {
                            self.reasoning_started = true;
                        }
                    }
                    None => {
                        out_text.push_str(before_last_chars(&self.buffer, OPEN_PEEK));
                        self.buffer = last_chars(&self.buffer, OPEN_PEEK).to_owned();
                        break;
                    }
                }
            }
        }
        if !out_reason.is_empty() {
            events.push_back(Ok(Event::ReasoningDelta { text: out_reason }));
        }
        if !out_text.is_empty() {
            self.emitted_text = true;
            events.push_back(Ok(Event::TextDelta { text: out_text }));
        }
    }

    /// The stream ended.
    fn finish(&mut self, events: &mut VecDeque<Result<Event, LlmError>>) {
        if !self.in_think && !self.buffer.is_empty() {
            let tail = std::mem::take(&mut self.buffer);
            events.push_back(Ok(Event::TextDelta { text: tail }));
        }
        self.buffer.clear();
    }
}

/// The part of `text` before its last `count` characters. Empty when `text` is not longer.
fn before_last_chars(text: &str, count: usize) -> &str {
    let total = text.chars().count();
    if total <= count {
        return "";
    }
    let offset = text
        .char_indices()
        .nth(total - count)
        .map_or(0, |(index, _)| index);
    text.get(..offset).unwrap_or("")
}

/// The part of `text` from its last `count` characters on.
fn last_chars(text: &str, count: usize) -> &str {
    let total = text.chars().count();
    if total <= count {
        return text;
    }
    let offset = text
        .char_indices()
        .nth(total - count)
        .map_or(0, |(index, _)| index);
    text.get(offset..).unwrap_or("")
}

/// A tool call being assembled from the deltas of one step.
#[derive(Debug, Default)]
struct ToolCallBuilder {
    id: String,
    name: String,
    args: String,
    started: bool,
}

/// What one read of the response body gave us.
enum Chunk {
    Data(Vec<u8>),
    End,
    Failed(LlmError),
    Cancelled,
}

/// The state of one streaming chat completion.
struct ChatState<'a> {
    client: &'a reqwest::Client,
    provider: &'a Provider,
    body: Value,
    cancel: Cancel,
    response: Option<reqwest::Response>,
    parser: SseParser,
    events: VecDeque<Result<Event, LlmError>>,
    tools: BTreeMap<usize, ToolCallBuilder>,
    think: ThinkExtractor,
    finish_reason: Option<FinishReason>,
    usage: Option<Usage>,
    done: bool,
}

impl<'a> ChatState<'a> {
    fn new(
        client: &'a reqwest::Client,
        provider: &'a Provider,
        body: Value,
        cancel: Cancel,
    ) -> Self {
        Self {
            client,
            provider,
            body,
            cancel,
            response: None,
            parser: SseParser::new(),
            events: VecDeque::new(),
            tools: BTreeMap::new(),
            think: ThinkExtractor::default(),
            finish_reason: None,
            usage: None,
            done: false,
        }
    }
}

impl ChatState<'_> {
    /// The next event, or `None` when the stream is over.
    async fn next_event(&mut self) -> Option<Result<Event, LlmError>> {
        loop {
            if let Some(event) = self.events.pop_front() {
                return Some(event);
            }
            if self.done {
                return None;
            }
            if self.response.is_none() {
                match self.open().await {
                    Ok(()) => {}
                    Err(error) => {
                        self.done = true;
                        return Some(Err(error));
                    }
                }
                continue;
            }
            match self.next_chunk().await {
                Chunk::Data(bytes) => {
                    let parsed = self.parser.push(&bytes);
                    let mut ended = false;
                    for event in parsed {
                        match event {
                            SseEvent::Done => {
                                ended = true;
                                break;
                            }
                            SseEvent::Data(payload) => self.handle_payload(&payload),
                        }
                    }
                    if ended {
                        self.end_of_stream();
                    }
                }
                Chunk::End => self.end_of_stream(),
                Chunk::Failed(error) => {
                    self.done = true;
                    return Some(Err(error));
                }
                Chunk::Cancelled => {
                    self.done = true;
                    return Some(Err(LlmError::Cancelled));
                }
            }
        }
    }

    /// Send the request and check the status.
    async fn open(&mut self) -> Result<(), LlmError> {
        let cancel = self.cancel.clone();
        let mut builder = self
            .client
            .post(self.provider.chat_completions_url())
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header(reqwest::header::ACCEPT, "text/event-stream")
            .header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", self.provider.api_key),
            );
        for (name, value) in &self.provider.extra_headers {
            builder = builder.header(name.as_str(), value.as_str());
        }
        let response = tokio::select! {
            result = builder.json(&self.body).send() => result.map_err(map_reqwest_error)?,
            () = cancel.cancelled() => return Err(LlmError::Cancelled),
        };
        if !response.status().is_success() {
            return Err(upstream_error(response).await);
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_owned();
        if !content_type.is_empty() && !content_type.contains("text/event-stream") {
            // A proxy that answers with an error page and a 200 would otherwise look like an
            // empty answer.
            let body = read_error_body(response).await;
            tracing::warn!(
                content_type = %content_type,
                detail = %truncate(&body, 512),
                "[agents-llm] the provider did not send an event stream"
            );
            return Err(LlmError::InvalidResponse {
                detail: format!("the provider answered with {content_type}"),
            });
        }
        self.response = Some(response);
        Ok(())
    }

    /// Read the next piece of the response body.
    async fn next_chunk(&mut self) -> Chunk {
        let cancel = self.cancel.clone();
        let Some(response) = self.response.as_mut() else {
            return Chunk::End;
        };
        tokio::select! {
            result = response.chunk() => match result {
                Ok(Some(bytes)) => Chunk::Data(bytes.to_vec()),
                Ok(None) => Chunk::End,
                Err(error) => Chunk::Failed(map_reqwest_error(error)),
            },
            () = cancel.cancelled() => Chunk::Cancelled,
        }
    }

    /// One `data:` payload of the stream.
    fn handle_payload(&mut self, payload: &str) {
        let value: Value = match serde_json::from_str(payload) {
            Ok(value) => value,
            Err(error) => {
                self.events.push_back(Err(LlmError::InvalidResponse {
                    detail: format!("the chunk is not JSON: {error}"),
                }));
                self.done = true;
                return;
            }
        };
        if let Some(error) = value.get("error") {
            let detail = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("the provider reported an error");
            // The provider's own words stay in the log; the user gets a fixed message.
            tracing::warn!(detail = %detail, "[agents-llm] the provider reported an error");
            self.events.push_back(Ok(Event::Error {
                message: LlmError::UpstreamFailed { status: None }
                    .user_message()
                    .to_owned(),
            }));
            self.done = true;
            return;
        }
        if let Some(usage) = value.get("usage").and_then(Value::as_object) {
            let prompt = usage
                .get("prompt_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let completion = usage
                .get("completion_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let total = usage
                .get("total_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(prompt + completion);
            self.usage = Some(Usage {
                prompt: u32::try_from(prompt).unwrap_or(u32::MAX),
                completion: u32::try_from(completion).unwrap_or(u32::MAX),
                total: u32::try_from(total).unwrap_or(u32::MAX),
            });
        }
        let Some(choices) = value.get("choices").and_then(Value::as_array) else {
            return;
        };
        let Some(choice) = choices.first() else {
            return;
        };
        if let Some(reason) = choice.get("finish_reason").and_then(Value::as_str) {
            self.finish_reason = Some(FinishReason::from_raw(reason));
        }
        let Some(delta) = choice.get("delta") else {
            return;
        };
        // Most providers call the reasoning `reasoning_content`; some call it `reasoning`.
        for key in ["reasoning_content", "reasoning"] {
            if let Some(text) = delta.get(key).and_then(Value::as_str) {
                if !text.is_empty() {
                    self.events.push_back(Ok(Event::ReasoningDelta {
                        text: text.to_owned(),
                    }));
                }
            }
        }
        if let Some(text) = delta.get("content").and_then(Value::as_str) {
            if !text.is_empty() {
                self.think.push(text, &mut self.events);
            }
        }
        if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
            for call in calls {
                self.handle_tool_delta(call);
            }
        }
    }

    /// One tool call delta. The arguments arrive in pieces, so they are collected by index.
    fn handle_tool_delta(&mut self, call: &Value) {
        let index = call.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
        let id = call.get("id").and_then(Value::as_str).unwrap_or_default();
        let function = call.get("function");
        let name = function
            .and_then(|f| f.get("name"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        let arguments = function
            .and_then(|f| f.get("arguments"))
            .and_then(Value::as_str)
            .unwrap_or_default();

        let (is_new, id, name) = {
            let builder = self.tools.entry(index).or_default();
            let is_new = !builder.started;
            if !id.is_empty() {
                builder.id = id.to_owned();
            }
            if !name.is_empty() {
                builder.name = name.to_owned();
            }
            if is_new {
                builder.started = true;
            }
            (is_new, builder.id.clone(), builder.name.clone())
        };
        if is_new {
            self.events
                .push_back(Ok(Event::ToolCallStart { index, id, name }));
        }
        if !arguments.is_empty() {
            if let Some(builder) = self.tools.get_mut(&index) {
                builder.args.push_str(arguments);
            }
            self.events.push_back(Ok(Event::ToolCallArgsDelta {
                index,
                delta: arguments.to_owned(),
            }));
        }
    }

    /// The stream ended: flush what is left and say how the step finished.
    fn end_of_stream(&mut self) {
        for event in self.parser.finish() {
            if let SseEvent::Data(payload) = event {
                self.handle_payload(&payload);
            }
        }
        self.think.finish(&mut self.events);
        self.flush_tool_calls();
        if let Some(usage) = self.usage.take() {
            self.events.push_back(Ok(Event::Usage(usage)));
        }
        let reason = self.finish_reason.take().unwrap_or_default();
        self.events.push_back(Ok(Event::Finish { reason }));
        self.done = true;
    }

    /// The tool calls of this step are complete: their arguments are JSON now.
    fn flush_tool_calls(&mut self) {
        let builders = std::mem::take(&mut self.tools);
        for (index, builder) in builders {
            let args = if builder.args.trim().is_empty() {
                Value::Object(serde_json::Map::new())
            } else {
                match serde_json::from_str(&builder.args) {
                    Ok(args) => args,
                    Err(error) => {
                        self.events.push_back(Err(LlmError::InvalidResponse {
                            detail: format!(
                                "the arguments of tool call {index} are not JSON: {error}"
                            ),
                        }));
                        continue;
                    }
                }
            };
            let id = if builder.id.is_empty() {
                format!("call_{index}")
            } else {
                builder.id
            };
            self.events.push_back(Ok(Event::ToolCallReady {
                id,
                name: builder.name,
                args,
            }));
        }
    }
}

/// Turn a `reqwest` failure into one of our errors.
fn map_reqwest_error(error: reqwest::Error) -> LlmError {
    if error.is_timeout() {
        return LlmError::Timeout;
    }
    LlmError::Transport {
        detail: error.to_string(),
    }
}

/// The provider refused the request. Its own words go to the log, never to the user.
async fn upstream_error(response: reqwest::Response) -> LlmError {
    let status = response.status();
    let code = status.as_u16();
    let retry_after_seconds = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok());
    let body = read_error_body(response).await;
    tracing::warn!(
        status = code,
        detail = %truncate(&body, 512),
        "[agents-llm] the provider refused the request"
    );
    match code {
        401 | 403 => LlmError::Unauthorized,
        429 => LlmError::RateLimited {
            retry_after_seconds,
        },
        _ => LlmError::UpstreamFailed { status: Some(code) },
    }
}

/// Read a bounded part of an error body, for the log.
async fn read_error_body(mut response: reqwest::Response) -> String {
    const LIMIT: usize = 1024;
    let mut body: Vec<u8> = Vec::new();
    while body.len() < LIMIT {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                let room = LIMIT.saturating_sub(body.len());
                body.extend_from_slice(chunk.get(..room).unwrap_or(&[]));
                if chunk.len() > room {
                    break;
                }
            }
            Ok(None) | Err(_) => break,
        }
    }
    String::from_utf8_lossy(&body).to_string()
}

/// The first `limit` characters of `text`, for a log line.
fn truncate(text: &str, limit: usize) -> String {
    let count = text.chars().count();
    if count <= limit {
        return text.to_owned();
    }
    let cut = text
        .char_indices()
        .nth(limit)
        .map_or(text.len(), |(index, _)| index);
    text.get(..cut).unwrap_or("").to_owned()
}

/// A client with the timeout the port uses for a chat completion.
///
/// The old code let the AI SDK pick the client; the wizard route had 60 seconds for the
/// whole request, so the client gets the same budget.
#[must_use]
pub fn default_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Stream one chat completion.
///
/// The client is the caller's: build it with the timeout you want (the old code let the AI SDK
/// pick). A timeout that fires becomes [`LlmError::Timeout`], never a silent end of stream.
/// The provider is the one [`crate::provider::route`] chose.
///
/// The returned stream does not borrow the request: the body is built before the stream starts,
/// so the caller may change the request while the stream runs (the tool loop does exactly that).
pub fn stream_chat<'a>(
    client: &'a reqwest::Client,
    provider: &'a Provider,
    request: &ChatRequest,
    cancel: Cancel,
) -> impl Stream<Item = Result<Event, LlmError>> + Send + use<'a> {
    let state = ChatState::new(client, provider, request.to_body(), cancel);
    futures::stream::unfold(state, |mut state| async move {
        state.next_event().await.map(|event| (event, state))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn drain(extractor: &mut ThinkExtractor, text: &str) -> Vec<Event> {
        let mut events = VecDeque::new();
        extractor.push(text, &mut events);
        events.into_iter().flatten().collect()
    }

    fn texts(events: &[Event]) -> Vec<String> {
        events
            .iter()
            .filter_map(|event| match event {
                Event::TextDelta { text } => Some(text.clone()),
                _ => None,
            })
            .collect()
    }

    fn reasoning(events: &[Event]) -> Vec<String> {
        events
            .iter()
            .filter_map(|event| match event {
                Event::ReasoningDelta { text } => Some(text.clone()),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn plain_text_is_held_back_until_it_cannot_be_a_tag() {
        let mut extractor = ThinkExtractor::default();
        let events = drain(&mut extractor, "hello ");
        // Six characters are held back: they could still be the start of a tag.
        assert!(texts(&events).is_empty());
        let events = drain(&mut extractor, "world");
        assert_eq!(texts(&events), vec!["hello".to_owned()]);
    }

    #[test]
    fn a_think_block_becomes_reasoning() {
        let mut extractor = ThinkExtractor::default();
        let events = drain(&mut extractor, "<think>hmm</think>answer");
        assert_eq!(reasoning(&events), vec!["hmm".to_owned()]);
        let mut events = VecDeque::new();
        extractor.finish(&mut events);
        let events: Vec<Event> = events.into_iter().flatten().collect();
        assert_eq!(texts(&events), vec!["answer".to_owned()]);
    }

    #[test]
    fn the_open_tag_may_be_split_across_deltas() {
        let mut extractor = ThinkExtractor::default();
        let events = drain(&mut extractor, "x<thi");
        assert!(reasoning(&events).is_empty());
        // Six characters are held back, so nothing is emitted yet.
        assert!(texts(&events).is_empty());
        let events = drain(&mut extractor, "nk>deep</think>after");
        assert_eq!(reasoning(&events), vec!["deep".to_owned()]);
        assert_eq!(texts(&events), vec!["x".to_owned()]);
        let mut events = VecDeque::new();
        extractor.finish(&mut events);
        let events: Vec<Event> = events.into_iter().flatten().collect();
        assert_eq!(texts(&events), vec!["after".to_owned()]);
    }

    #[test]
    fn the_close_tag_may_be_split_across_deltas() {
        let mut extractor = ThinkExtractor::default();
        let events = drain(&mut extractor, "<think>deep</thi");
        // Everything but the seven characters that could still become the close tag is out.
        assert_eq!(reasoning(&events), vec!["de".to_owned()]);
        let events = drain(&mut extractor, "nk>after");
        assert_eq!(reasoning(&events), vec!["ep".to_owned()]);
        let mut events = VecDeque::new();
        extractor.finish(&mut events);
        let events: Vec<Event> = events.into_iter().flatten().collect();
        assert_eq!(texts(&events), vec!["after".to_owned()]);
    }

    #[test]
    fn the_whitespace_after_the_close_tag_is_collapsed() {
        let mut extractor = ThinkExtractor::default();
        let events = drain(&mut extractor, "before\n\n<think>deep</think>\n\n\nafter");
        assert_eq!(reasoning(&events), vec!["deep".to_owned()]);
        assert_eq!(texts(&events), vec!["before\n\n".to_owned()]);
        let mut events = VecDeque::new();
        extractor.finish(&mut events);
        let events: Vec<Event> = events.into_iter().flatten().collect();
        assert_eq!(texts(&events), vec!["after".to_owned()]);
    }

    #[test]
    fn two_think_blocks_make_one_reasoning_part() {
        let mut extractor = ThinkExtractor::default();
        let events = drain(&mut extractor, "<think>one</think><think>two</think>end");
        assert_eq!(reasoning(&events), vec!["one\n\ntwo".to_owned()]);
        let mut events = VecDeque::new();
        extractor.finish(&mut events);
        let events: Vec<Event> = events.into_iter().flatten().collect();
        assert_eq!(texts(&events), vec!["end".to_owned()]);
    }

    #[test]
    fn an_unclosed_think_block_is_dropped() {
        let mut extractor = ThinkExtractor::default();
        let events = drain(&mut extractor, "visible<think>secret plan");
        assert_eq!(texts(&events), vec!["visible".to_owned()]);
        let mut events = VecDeque::new();
        extractor.finish(&mut events);
        let events: Vec<Event> = events.into_iter().flatten().collect();
        assert!(texts(&events).is_empty());
    }

    #[test]
    fn the_held_back_characters_come_out_at_the_end() {
        let mut extractor = ThinkExtractor::default();
        let events = drain(&mut extractor, "abc");
        // Six characters are held back, so "abc" stays in the buffer.
        assert!(texts(&events).is_empty());
        let mut events = VecDeque::new();
        extractor.finish(&mut events);
        let events: Vec<Event> = events.into_iter().flatten().collect();
        assert_eq!(texts(&events), vec!["abc".to_owned()]);
    }

    #[test]
    fn the_cancel_signal_is_seen() {
        let (handle, cancel) = Cancel::channel();
        assert!(!cancel.is_cancelled());
        handle.cancel();
        assert!(cancel.is_cancelled());
    }

    #[test]
    fn a_never_signal_never_fires() {
        let cancel = Cancel::never();
        assert!(!cancel.is_cancelled());
    }

    #[test]
    fn the_arguments_of_a_tool_call_are_collected_by_index() {
        let client = reqwest::Client::new();
        let provider = Provider::new("http://127.0.0.1:1/v1", "key");
        let mut state = ChatState::new(&client, &provider, Value::Null, Cancel::never());
        // Two calls at once, each with its arguments in pieces.
        state.handle_tool_delta(&serde_json::json!({
            "index": 0, "id": "call_1", "function": {"name": "first", "arguments": "{\"a\":"}
        }));
        state.handle_tool_delta(&serde_json::json!({
            "index": 1, "id": "call_2", "function": {"name": "second", "arguments": "{\"b\":2}"}
        }));
        state.handle_tool_delta(&serde_json::json!({
            "index": 0, "function": {"arguments": "1}"}
        }));
        state.flush_tool_calls();

        let ready: Vec<(String, String, Value)> = state
            .events
            .iter()
            .filter_map(|event| match event {
                Ok(Event::ToolCallReady { id, name, args }) => {
                    Some((id.clone(), name.clone(), args.clone()))
                }
                _ => None,
            })
            .collect();
        assert_eq!(
            ready,
            vec![
                (
                    "call_1".to_owned(),
                    "first".to_owned(),
                    serde_json::json!({"a": 1})
                ),
                (
                    "call_2".to_owned(),
                    "second".to_owned(),
                    serde_json::json!({"b": 2})
                ),
            ]
        );
    }

    #[test]
    fn a_tool_call_without_arguments_is_an_empty_object() {
        let client = reqwest::Client::new();
        let provider = Provider::new("http://127.0.0.1:1/v1", "key");
        let mut state = ChatState::new(&client, &provider, Value::Null, Cancel::never());
        state.handle_tool_delta(&serde_json::json!({
            "index": 0, "id": "call_1", "function": {"name": "ping"}
        }));
        state.flush_tool_calls();
        let ready = state.events.iter().find_map(|event| match event {
            Ok(Event::ToolCallReady { id, args, .. }) => Some((id.clone(), args.clone())),
            _ => None,
        });
        assert_eq!(ready, Some(("call_1".to_owned(), serde_json::json!({}))));
    }
}
