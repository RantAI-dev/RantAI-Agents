//! The client and the tool loop against a scripted stub server.
//!
//! The stub is a raw TCP listener in this file: it answers with the OpenAI SSE frames the
//! providers send, so the tests never touch the network.

use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use agents_llm::agent_loop::{AgentEvent, ToolExecutor, ToolOutcome};
use agents_llm::client::{Cancel, stream_chat};
use agents_llm::provider::Provider;
use agents_llm::types::{ChatRequest, Event, FinishReason, LlmError, Message, ToolCall, Usage};
use futures::StreamExt;
use serde_json::{Value, json};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

type R = Result<(), Box<dyn std::error::Error>>;

/// What the stub answers with.
enum Reply {
    /// A `text/event-stream` body.
    Sse(String),
    /// A `200` with a body that is not an event stream.
    Json(String),
    /// A status code and a body.
    Status(u16, String),
}

/// A scripted server on 127.0.0.1.
struct Stub {
    address: SocketAddr,
    bodies: Arc<Mutex<Vec<String>>>,
}

impl Stub {
    async fn start(replies: Vec<Reply>) -> Result<Self, Box<dyn std::error::Error>> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let bodies = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&bodies);
        tokio::spawn(async move {
            let mut replies = replies.into_iter();
            while let Ok((mut socket, _)) = listener.accept().await {
                let reply = replies
                    .next()
                    .unwrap_or_else(|| Reply::Sse("data: [DONE]\n\n".to_owned()));
                let recorded = Arc::clone(&recorded);
                tokio::spawn(async move {
                    let body = read_request(&mut socket, recorded).await;
                    let _ = write_reply(&mut socket, reply, body).await;
                });
            }
        });
        Ok(Self { address, bodies })
    }

    fn base_url(&self) -> String {
        format!("http://{}", self.address)
    }

    /// The bodies of the requests the stub received.
    fn requests(&self) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let guard = self.bodies.lock().map_err(|error| error.to_string())?;
        Ok(guard.clone())
    }
}

/// Read the request, keeping its body for the test to look at.
async fn read_request(socket: &mut TcpStream, bodies: Arc<Mutex<Vec<String>>>) -> String {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 2048];
    loop {
        let read = match socket.read(&mut chunk).await {
            Ok(read) => read,
            Err(_) => return String::new(),
        };
        if read == 0 {
            return String::new();
        }
        buffer.extend_from_slice(chunk.get(..read).unwrap_or(&[]));
        let Some(head_end) = buffer.windows(4).position(|window| window == b"\r\n\r\n") else {
            continue;
        };
        let head = String::from_utf8_lossy(buffer.get(..head_end).unwrap_or(&[])).to_string();
        let length = content_length(&head);
        let body_start = head_end + 4;
        if buffer.len() >= body_start + length {
            let body =
                String::from_utf8_lossy(buffer.get(body_start..body_start + length).unwrap_or(&[]))
                    .to_string();
            if let Ok(mut guard) = bodies.lock() {
                guard.push(body.clone());
            }
            return body;
        }
    }
}

/// The `Content-Length` of a request head.
fn content_length(head: &str) -> usize {
    head.lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.trim().eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .unwrap_or(0)
}

async fn write_reply(
    socket: &mut TcpStream,
    reply: Reply,
    request_body: String,
) -> std::io::Result<()> {
    let (status, content_type, body) = match reply {
        Reply::Sse(body) => ("200 OK", "text/event-stream", body),
        Reply::Json(body) => ("200 OK", "application/json", body),
        Reply::Status(code, body) => (
            match code {
                429 => "429 Too Many Requests",
                500 => "500 Internal Server Error",
                _ => "400 Bad Request",
            },
            "application/json",
            body,
        ),
    };
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nX-Request-Body: {}\r\nConnection: close\r\n\r\n",
        body.len(),
        request_body.len()
    );
    socket.write_all(head.as_bytes()).await?;
    socket.write_all(body.as_bytes()).await?;
    socket.flush().await?;
    let _ = socket.shutdown().await;
    Ok(())
}

/// The SSE body of a list of chunks.
fn sse(chunks: &[String]) -> String {
    let mut body = String::new();
    for chunk in chunks {
        body.push_str("data: ");
        body.push_str(chunk);
        body.push_str("\n\n");
    }
    body.push_str("data: [DONE]\n\n");
    body
}

/// One chunk with a delta.
fn chunk(delta: Value) -> String {
    json!({
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "model": "stub",
        "choices": [{"index": 0, "delta": delta}],
    })
    .to_string()
}

/// One chunk that ends the answer.
fn finish_chunk(reason: &str) -> String {
    json!({
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "model": "stub",
        "choices": [{"index": 0, "delta": {}, "finish_reason": reason}],
    })
    .to_string()
}

/// One chunk with the token usage.
fn usage_chunk(prompt: u64, completion: u64) -> String {
    json!({
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "model": "stub",
        "choices": [],
        "usage": {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion,
        },
    })
    .to_string()
}

/// One chunk with a piece of a tool call.
fn tool_chunk(index: u64, id: Option<&str>, name: Option<&str>, arguments: Option<&str>) -> String {
    let mut function = serde_json::Map::new();
    if let Some(name) = name {
        function.insert("name".to_owned(), Value::String(name.to_owned()));
    }
    if let Some(arguments) = arguments {
        function.insert("arguments".to_owned(), Value::String(arguments.to_owned()));
    }
    let mut call = serde_json::Map::new();
    call.insert("index".to_owned(), Value::from(index));
    if let Some(id) = id {
        call.insert("id".to_owned(), Value::String(id.to_owned()));
    }
    call.insert("function".to_owned(), Value::Object(function));
    json!({
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "model": "stub",
        "choices": [{"index": 0, "delta": {"tool_calls": [Value::Object(call)]}}],
    })
    .to_string()
}

fn request() -> ChatRequest {
    ChatRequest {
        model: "stub".to_owned(),
        messages: vec![Message::user("hello")],
        ..ChatRequest::default()
    }
}

/// The text of every text delta, joined.
fn text_of(events: &[Result<Event, LlmError>]) -> String {
    events
        .iter()
        .filter_map(|event| match event {
            Ok(Event::TextDelta { text }) => Some(text.clone()),
            _ => None,
        })
        .collect()
}

/// A tool executor that answers with the name of the tool it was given.
struct Echo;

impl ToolExecutor for Echo {
    fn execute<'a>(
        &'a self,
        call: &'a ToolCall,
    ) -> Pin<Box<dyn Future<Output = ToolOutcome> + Send + 'a>> {
        Box::pin(async move {
            ToolOutcome::Completed {
                content: format!("the result of {}", call.name),
            }
        })
    }
}

/// A tool executor that always asks for approval.
struct NeedsApproval;

impl ToolExecutor for NeedsApproval {
    fn execute<'a>(
        &'a self,
        call: &'a ToolCall,
    ) -> Pin<Box<dyn Future<Output = ToolOutcome> + Send + 'a>> {
        Box::pin(async move {
            ToolOutcome::NeedsApproval {
                reason: format!("{} needs a human", call.name),
            }
        })
    }
}

#[tokio::test]
async fn a_text_answer_streams_out() -> R {
    let stub = Stub::start(vec![Reply::Sse(sse(&[
        chunk(json!({"content": "Hello"})),
        chunk(json!({"content": " world"})),
        finish_chunk("stop"),
        usage_chunk(11, 2),
    ]))])
    .await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;

    assert_eq!(text_of(&events), "Hello world");
    let usage = events.iter().find_map(|event| match event {
        Ok(Event::Usage(usage)) => Some(*usage),
        _ => None,
    });
    assert_eq!(
        usage,
        Some(Usage {
            prompt: 11,
            completion: 2,
            total: 13,
        })
    );
    let finish = events.iter().find_map(|event| match event {
        Ok(Event::Finish { reason }) => Some(*reason),
        _ => None,
    });
    assert_eq!(finish, Some(FinishReason::Stop));

    // The request itself says what the old code said.
    let bodies = stub.requests()?;
    let body: Value = serde_json::from_str(bodies.first().map(String::as_str).unwrap_or("{}"))?;
    assert_eq!(body.get("model").and_then(Value::as_str), Some("stub"));
    assert_eq!(body.get("stream").and_then(Value::as_bool), Some(true));
    let messages = body.get("messages").and_then(Value::as_array);
    assert_eq!(
        messages
            .and_then(|m| m.first())
            .and_then(|m| m.get("content"))
            .and_then(Value::as_str),
        Some("hello")
    );
    Ok(())
}

#[tokio::test]
async fn a_tool_call_split_over_several_deltas_becomes_one_call() -> R {
    let stub = Stub::start(vec![Reply::Sse(sse(&[
        tool_chunk(0, Some("call_1"), Some("web_search"), None),
        tool_chunk(0, None, None, Some("{\"q\":\"")),
        tool_chunk(0, None, None, Some("rust\"}")),
        finish_chunk("tool_calls"),
        usage_chunk(20, 5),
    ]))])
    .await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;

    let starts: Vec<_> = events
        .iter()
        .filter_map(|event| match event {
            Ok(Event::ToolCallStart { index, id, name }) => {
                Some((*index, id.clone(), name.clone()))
            }
            _ => None,
        })
        .collect();
    assert_eq!(
        starts,
        vec![(0, "call_1".to_owned(), "web_search".to_owned())]
    );

    let deltas: Vec<String> = events
        .iter()
        .filter_map(|event| match event {
            Ok(Event::ToolCallArgsDelta { delta, .. }) => Some(delta.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(deltas, vec!["{\"q\":\"".to_owned(), "rust\"}".to_owned()]);

    let ready = events.iter().find_map(|event| match event {
        Ok(Event::ToolCallReady { id, name, args }) => {
            Some((id.clone(), name.clone(), args.clone()))
        }
        _ => None,
    });
    assert_eq!(
        ready,
        Some((
            "call_1".to_owned(),
            "web_search".to_owned(),
            json!({"q": "rust"})
        ))
    );
    let finish = events.iter().find_map(|event| match event {
        Ok(Event::Finish { reason }) => Some(*reason),
        _ => None,
    });
    assert_eq!(finish, Some(FinishReason::ToolCalls));
    Ok(())
}

#[tokio::test]
async fn a_rate_limited_provider_is_a_typed_error() -> R {
    let stub = Stub::start(vec![Reply::Status(
        429,
        r#"{"error":{"message":"rate limited, buy more"}}"#.to_owned(),
    )])
    .await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;

    assert_eq!(events.len(), 1);
    let error = events
        .first()
        .and_then(|event| event.as_ref().err())
        .ok_or("expected an error")?;
    assert!(matches!(error, LlmError::RateLimited { .. }));
    // The provider's own words never reach the user.
    assert!(!error.user_message().contains("buy more"));
    assert!(error.user_message().contains("rate-limited"));
    Ok(())
}

#[tokio::test]
async fn a_provider_that_fails_is_a_typed_error() -> R {
    let stub = Stub::start(vec![Reply::Status(500, "boom".to_owned())]).await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;
    let error = events
        .first()
        .and_then(|event| event.as_ref().err())
        .ok_or("expected an error")?;
    assert!(matches!(
        error,
        LlmError::UpstreamFailed { status: Some(500) }
    ));
    assert!(!error.user_message().contains("boom"));
    Ok(())
}

#[tokio::test]
async fn the_think_tags_become_reasoning() -> R {
    let stub = Stub::start(vec![Reply::Sse(sse(&[
        chunk(json!({"content": "<think>let me think"})),
        chunk(json!({"content": "</think>here is the answer"})),
        finish_chunk("stop"),
    ]))])
    .await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;

    let reasoning: String = events
        .iter()
        .filter_map(|event| match event {
            Ok(Event::ReasoningDelta { text }) => Some(text.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(reasoning, "let me think");
    assert_eq!(text_of(&events), "here is the answer");
    Ok(())
}

#[tokio::test]
async fn the_tool_loop_runs_the_tool_and_asks_again() -> R {
    let stub = Stub::start(vec![
        Reply::Sse(sse(&[
            tool_chunk(
                0,
                Some("call_1"),
                Some("web_search"),
                Some("{\"q\":\"rust\"}"),
            ),
            finish_chunk("tool_calls"),
            usage_chunk(20, 5),
        ])),
        Reply::Sse(sse(&[
            chunk(json!({"content": "the answer"})),
            finish_chunk("stop"),
            usage_chunk(30, 4),
        ])),
    ])
    .await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let executor = Echo;
    let events = agents_llm::agent_loop::run_agent_loop(
        &client,
        &provider,
        request(),
        &executor,
        5,
        Cancel::never(),
    )
    .collect::<Vec<_>>()
    .await;

    let steps: Vec<usize> = events
        .iter()
        .filter_map(|event| match event {
            Ok(AgentEvent::StepStart { step }) => Some(*step),
            _ => None,
        })
        .collect();
    assert_eq!(steps, vec![1, 2]);

    let results: Vec<(String, String)> = events
        .iter()
        .filter_map(|event| match event {
            Ok(AgentEvent::ToolResult { id, content, .. }) => Some((id.clone(), content.clone())),
            _ => None,
        })
        .collect();
    assert_eq!(
        results,
        vec![("call_1".to_owned(), "the result of web_search".to_owned())]
    );

    let text: String = events
        .iter()
        .filter_map(|event| match event {
            Ok(AgentEvent::Model(Event::TextDelta { text })) => Some(text.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(text, "the answer");

    let total = events.iter().find_map(|event| match event {
        Ok(AgentEvent::TotalUsage { usage }) => Some(*usage),
        _ => None,
    });
    assert_eq!(
        total,
        Some(Usage {
            prompt: 50,
            completion: 9,
            total: 59,
        })
    );

    // The second request carries the tool result back to the model.
    let bodies = stub.requests()?;
    assert_eq!(bodies.len(), 2);
    let second: Value = serde_json::from_str(bodies.get(1).map(String::as_str).unwrap_or("{}"))?;
    let messages = second.get("messages").and_then(Value::as_array);
    let roles: Vec<String> = messages
        .map(|messages| {
            messages
                .iter()
                .filter_map(|message| message.get("role").and_then(Value::as_str))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(roles, vec!["user", "assistant", "tool"]);
    Ok(())
}

#[tokio::test]
async fn a_tool_that_needs_approval_stops_the_turn() -> R {
    let stub = Stub::start(vec![Reply::Sse(sse(&[
        tool_chunk(0, Some("call_1"), Some("delete_thing"), Some("{}")),
        finish_chunk("tool_calls"),
    ]))])
    .await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let executor = NeedsApproval;
    let events = agents_llm::agent_loop::run_agent_loop(
        &client,
        &provider,
        request(),
        &executor,
        5,
        Cancel::never(),
    )
    .collect::<Vec<_>>()
    .await;

    let approval = events.iter().find_map(|event| match event {
        Ok(AgentEvent::ApprovalRequired { id, name, reason }) => {
            Some((id.clone(), name.clone(), reason.clone()))
        }
        _ => None,
    });
    assert_eq!(
        approval,
        Some((
            "call_1".to_owned(),
            "delete_thing".to_owned(),
            "delete_thing needs a human".to_owned()
        ))
    );
    // The loop stopped: there is no second step.
    let steps: Vec<usize> = events
        .iter()
        .filter_map(|event| match event {
            Ok(AgentEvent::StepStart { step }) => Some(*step),
            _ => None,
        })
        .collect();
    assert_eq!(steps, vec![1]);
    Ok(())
}

#[tokio::test]
async fn a_cancelled_turn_stops_before_the_first_step() -> R {
    let stub = Stub::start(vec![Reply::Sse(sse(&[chunk(json!({"content": "hi"}))]))]).await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let executor = Echo;
    let (handle, cancel) = Cancel::channel();
    handle.cancel();
    let events =
        agents_llm::agent_loop::run_agent_loop(&client, &provider, request(), &executor, 5, cancel)
            .collect::<Vec<_>>()
            .await;

    assert_eq!(events.len(), 1);
    assert!(matches!(
        events.first().and_then(|event| event.as_ref().err()),
        Some(LlmError::Cancelled)
    ));
    Ok(())
}

#[tokio::test]
async fn the_provider_needs_no_key_in_the_body() -> R {
    let stub = Stub::start(vec![Reply::Sse(sse(&[finish_chunk("stop")]))]).await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;
    assert!(events.iter().all(|event| event.is_ok()));
    let bodies = stub.requests()?;
    let body = bodies.first().map(String::as_str).unwrap_or("");
    assert!(!body.contains("test-key"));
    Ok(())
}

#[tokio::test]
async fn the_stream_stops_when_the_caller_cancels() -> R {
    let stub = Stub::start(vec![Reply::Sse(sse(&[
        chunk(json!({"content": "one"})),
        chunk(json!({"content": "two"})),
        finish_chunk("stop"),
    ]))])
    .await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let (handle, cancel) = Cancel::channel();
    handle.cancel();
    let events = stream_chat(&client, &provider, &request(), cancel)
        .collect::<Vec<_>>()
        .await;
    assert!(matches!(
        events.first().and_then(|event| event.as_ref().err()),
        Some(LlmError::Cancelled)
    ));
    Ok(())
}

#[tokio::test]
async fn a_provider_that_is_not_an_event_stream_is_an_error() -> R {
    let stub = Stub::start(vec![Reply::Json(r#"{"error":"nope"}"#.to_owned())]).await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;
    let error = events
        .first()
        .and_then(|event| event.as_ref().err())
        .ok_or("expected an error")?;
    assert!(matches!(error, LlmError::InvalidResponse { .. }));
    Ok(())
}

#[tokio::test]
async fn an_error_inside_the_stream_is_a_safe_message() -> R {
    let body =
        "data: {\"error\":{\"message\":\"the model exploded\",\"type\":\"server_error\"}}\n\n";
    let stub = Stub::start(vec![Reply::Sse(body.to_owned())]).await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;
    let message = events.iter().find_map(|event| match event {
        Ok(Event::Error { message }) => Some(message.clone()),
        _ => None,
    });
    let message = message.ok_or("expected an error event")?;
    assert!(!message.contains("exploded"));
    assert!(message.contains("didn't return a response"));
    Ok(())
}

#[tokio::test]
async fn the_answer_survives_a_chunk_boundary_in_the_middle_of_a_line() -> R {
    let body = "data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"split\"}}]}\n\ndata: [DONE]\n\n";
    let stub = Stub::start(vec![Reply::Sse(body.to_owned())]).await?;
    let client = reqwest::Client::new();
    let provider = Provider::new(stub.base_url(), "test-key");
    let events = stream_chat(&client, &provider, &request(), Cancel::never())
        .collect::<Vec<_>>()
        .await;
    assert_eq!(text_of(&events), "split");
    Ok(())
}
