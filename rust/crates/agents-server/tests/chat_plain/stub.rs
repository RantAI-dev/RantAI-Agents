//! A scripted model server: the chat tests never touch the network.
//!
//! The stub speaks the OpenAI-compatible SSE dialect the providers speak, so the chat service
//! talks to it exactly as it talks to OpenRouter. It reads every request and keeps it, so a
//! test can look at what the model was asked.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// What the stub answers with.
#[derive(Clone, Debug)]
pub enum Script {
    /// The answer, in pieces.
    Text(Vec<String>),
    /// A tool call that remembers what the user said, and the answer after it.
    SaveMessageThenText {
        /// The answer, in pieces.
        text: Vec<String>,
    },
    /// The provider refuses the request.
    Status(u16),
    /// The model answers one piece and then waits: the test hangs up in the middle.
    Hang(String),
}

/// A scripted server on 127.0.0.1.
pub struct Stub {
    address: SocketAddr,
    requests: Arc<Mutex<Vec<Value>>>,
    hung_up: Arc<AtomicBool>,
}

impl Stub {
    /// Starts the server. Every request gets the same script.
    pub async fn start(script: Script) -> Result<Self, Box<dyn std::error::Error>> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let requests = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&requests);
        let hung_up = Arc::new(AtomicBool::new(false));
        let seen = Arc::clone(&hung_up);
        tokio::spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                let script = script.clone();
                let recorded = Arc::clone(&recorded);
                let seen = Arc::clone(&seen);
                tokio::spawn(async move {
                    let body = read_request(&mut socket, recorded).await;
                    let _ = write_reply(&mut socket, &script, &body, seen).await;
                });
            }
        });
        Ok(Self {
            address,
            requests,
            hung_up,
        })
    }

    /// Whether the client hung up while the model was still answering.
    pub fn client_hung_up(&self) -> bool {
        self.hung_up.load(Ordering::SeqCst)
    }

    /// The base URL the chat service is pointed at.
    pub fn base_url(&self) -> String {
        format!("http://{}", self.address)
    }

    /// The settings that send every model to this stub.
    pub fn llm(&self) -> agents_server::config::LlmSettings {
        agents_server::config::LlmSettings {
            base_url: Some(self.base_url()),
            api_key: Some("test-key".to_owned()),
            ..agents_server::config::LlmSettings::default()
        }
    }

    /// The requests the stub received, in the order they came.
    pub fn requests(&self) -> Result<Vec<Value>, Box<dyn std::error::Error>> {
        let guard = self.requests.lock().map_err(|error| error.to_string())?;
        Ok(guard.clone())
    }

    /// The request that carries the user's message, and not the summary call.
    pub fn chat_request(&self) -> Result<Option<Value>, Box<dyn std::error::Error>> {
        Ok(self.requests()?.into_iter().find(|request| {
            request
                .get("messages")
                .and_then(Value::as_array)
                .is_some_and(|messages| {
                    messages.iter().any(|message| {
                        message.get("content").and_then(Value::as_str) == Some("hello")
                    })
                })
        }))
    }
}

/// Reads the request and keeps its body.
async fn read_request(socket: &mut TcpStream, requests: Arc<Mutex<Vec<Value>>>) -> String {
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
            if let Ok(parsed) = serde_json::from_str::<Value>(&body)
                && let Ok(mut guard) = requests.lock()
            {
                guard.push(parsed);
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

/// Writes the answer.
async fn write_reply(
    socket: &mut TcpStream,
    script: &Script,
    request_body: &str,
    hung_up: Arc<AtomicBool>,
) -> std::io::Result<()> {
    let request: Value = serde_json::from_str(request_body).unwrap_or(Value::Null);
    let (status, content_type, body) = match script {
        Script::Text(parts) => ("200 OK", "text/event-stream", text_body(parts)),
        Script::SaveMessageThenText { text } => {
            // The summary call has no tools, and the second call of the turn carries the
            // tool's result: both are answered with the text.
            let has_tools = request.get("tools").is_some();
            let has_tool_result = request
                .get("messages")
                .and_then(Value::as_array)
                .is_some_and(|messages| {
                    messages
                        .iter()
                        .any(|message| message.get("role").and_then(Value::as_str) == Some("tool"))
                });
            if !has_tools || has_tool_result {
                ("200 OK", "text/event-stream", text_body(text))
            } else {
                // The tool remembers what the user said, under a label of its own, so every
                // chat of the test stores a fact of its own.
                let message = last_user_message(&request);
                let arguments = json!({
                    "facts": [{"category": "bio", "label": message, "value": message}],
                })
                .to_string();
                (
                    "200 OK",
                    "text/event-stream",
                    tool_body("saveMemory", &arguments),
                )
            }
        }
        Script::Hang(part) => {
            // The answer starts and never ends: the test hangs up in the middle.
            let body = format!("data: {}\n\n", chunk(json!({ "content": part })));
            let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n\r\n";
            socket.write_all(head.as_bytes()).await?;
            socket.write_all(body.as_bytes()).await?;
            socket.flush().await?;
            // Wait for the client to go away.
            let mut buffer = [0_u8; 1024];
            loop {
                match socket.read(&mut buffer).await {
                    Ok(0) => break,
                    Ok(_) => continue,
                    Err(_) => break,
                }
            }
            hung_up.store(true, Ordering::SeqCst);
            return Ok(());
        }
        Script::Status(code) => (
            match code {
                401 => "401 Unauthorized",
                429 => "429 Too Many Requests",
                _ => "500 Internal Server Error",
            },
            "application/json",
            json!({"error": {"message": "the provider refused the request"}}).to_string(),
        ),
    };
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    socket.write_all(head.as_bytes()).await?;
    socket.write_all(body.as_bytes()).await?;
    socket.flush().await?;
    let _ = socket.shutdown().await;
    Ok(())
}

/// The SSE body of an answer.
fn text_body(parts: &[String]) -> String {
    let mut body = String::new();
    for part in parts {
        body.push_str(&format!("data: {}\n\n", chunk(json!({"content": part}))));
    }
    body.push_str(&format!(
        "data: {}\n\n",
        chunk(json!({"finish_reason": "stop"}))
    ));
    body.push_str(&format!("data: {}\n\n", usage_chunk()));
    body.push_str("data: [DONE]\n\n");
    body
}

/// The SSE body of a tool call.
fn tool_body(name: &str, arguments: &str) -> String {
    let mut body = String::new();
    body.push_str(&format!(
        "data: {}\n\n",
        chunk(json!({
            "tool_calls": [{
                "index": 0,
                "id": "call_1",
                "function": {"name": name, "arguments": arguments},
            }],
        }))
    ));
    body.push_str(&format!(
        "data: {}\n\n",
        chunk(json!({"finish_reason": "tool_calls"}))
    ));
    body.push_str("data: [DONE]\n\n");
    body
}

/// The last user message of a request.
fn last_user_message(request: &Value) -> String {
    request
        .get("messages")
        .and_then(Value::as_array)
        .and_then(|messages| {
            messages
                .iter()
                .rev()
                .find(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        })
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

/// One chunk of the stream.
fn chunk(delta: Value) -> String {
    json!({
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "model": "stub",
        "choices": [{"index": 0, "delta": delta}],
    })
    .to_string()
}

/// The chunk that carries the token usage.
fn usage_chunk() -> String {
    json!({
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "model": "stub",
        "choices": [],
        "usage": {"prompt_tokens": 11, "completion_tokens": 2, "total_tokens": 13},
    })
    .to_string()
}
