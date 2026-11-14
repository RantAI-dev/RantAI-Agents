//! The agent WebSocket: `GET /v1/agents/{assistantId}/ws` (`docs/design/identity-and-access.md`
//! §3.6).
//!
//! Every case runs over a real connection, because the things being tested are the handshake,
//! the close code, the frames and whether a disconnect reaches the model call. The model is the
//! scripted stub the chat tests use.

#[path = "chat_plain/stub.rs"]
mod stub;

#[path = "chat_plain/helpers.rs"]
mod helpers;

#[path = "agent_rbac/support.rs"]
mod support;

#[path = "agent_api/http.rs"]
mod http;

#[path = "agent_api/ws_client.rs"]
mod ws;

#[allow(dead_code, reason = "shared test helpers, used piecemeal")]
mod common;

use std::time::Duration;

use axum::Router;
use common::R;
use http::{Answer, send};
use serde_json::{Value, json};
use stub::{Script, Stub};
use support::{assistant, member_of, org};
use ws::{Frame, Handshake, Socket};

/// How long a socket test waits for a frame before it calls the run hung.
const WAIT: Duration = Duration::from_secs(10);

/// Mints a key for the agent and returns it.
async fn key_for(
    app: &Router,
    member_token: &str,
    assistant_id: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let answer: Answer = send(
        app,
        "POST",
        "/api/dashboard/agent-api-keys",
        &[http::authorization(member_token)],
        Some(json!({
            "name": "socket",
            "assistantId": assistant_id,
            "scopes": ["chat", "chat:stream"],
        })),
        None,
    )
    .await?;
    assert_eq!(answer.status, 201, "{}", answer.text);
    Ok(answer
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned())
}

/// Opens the socket for the agent, with the key in the handshake.
async fn open(
    address: std::net::SocketAddr,
    assistant_id: &str,
    key: &str,
) -> Result<Socket, Box<dyn std::error::Error>> {
    let path = format!("/v1/agents/{assistant_id}/ws");
    let Handshake::Open(socket) = ws::connect(
        address,
        &path,
        &[("authorization", &format!("Bearer {key}"))],
    )
    .await?
    else {
        return Err("the handshake was refused".into());
    };
    Ok(socket)
}

/// One text frame from the socket, within [`WAIT`].
async fn next(socket: &mut Socket) -> Option<Frame> {
    tokio::time::timeout(WAIT, socket.recv())
        .await
        .ok()
        .flatten()
}

/// The text of a chunk frame of the UI stream, when it carries one.
fn delta(frame: &Frame) -> Option<String> {
    let Frame::Text(value) = frame else {
        return None;
    };
    if value.get("type").and_then(Value::as_str) != Some("chunk") {
        return None;
    }
    let chunk = value.get("chunk")?;
    (chunk.get("type").and_then(Value::as_str) == Some("text-delta")).then(|| {
        chunk
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned()
    })
}

/// The text of every chunk frame until the `done` frame; returns the text and the session id.
async fn read_turn(socket: &mut Socket) -> (String, Option<String>) {
    let mut text = String::new();
    loop {
        match next(socket).await {
            Some(Frame::Text(value)) => match value.get("type").and_then(Value::as_str) {
                Some("chunk") => {
                    if let Some(delta) = delta(&Frame::Text(value)) {
                        text.push_str(&delta);
                    }
                }
                Some("done") => {
                    return (
                        text,
                        value
                            .get("sessionId")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                    );
                }
                Some("error") => return (text, None),
                _ => {}
            },
            Some(Frame::Close(_)) | None => return (text, None),
            _ => {}
        }
    }
}

/// The `error` frame of a refusal, when one arrives.
async fn read_error(socket: &mut Socket) -> Option<Value> {
    loop {
        match next(socket).await {
            Some(Frame::Text(value)) => {
                if value.get("type").and_then(Value::as_str) == Some("error") {
                    return Some(value);
                }
            }
            _ => return None,
        }
    }
}

#[tokio::test]
async fn a_key_in_the_handshake_streams_the_ui_chunks() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned(), " world".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = key_for(&app, &common::bearer(&admin)?, &assistant_id).await?;

    let address = ws::serve(app).await?;
    let mut socket = open(address, &assistant_id, &key).await?;
    socket
        .send_json(&json!({"type": "message", "content": "hello"}))
        .await?;

    let (text, session) = read_turn(&mut socket).await;
    assert_eq!(text, "Hello world");
    let Some(session) = session else {
        return Err("the turn ended without a done frame naming the session".into());
    };
    assert!(!session.is_empty());

    // The chunks are the UI stream's, not the OpenAI ones: `start` first, `finish` last.
    let mut socket = open(address, &assistant_id, &key).await?;
    socket
        .send_json(&json!({"type": "message", "content": "hello again"}))
        .await?;
    let mut kinds = Vec::new();
    while let Some(frame) = next(&mut socket).await {
        match &frame {
            Frame::Text(value) if value.get("type").and_then(Value::as_str) == Some("chunk") => {
                let kind = value
                    .get("chunk")
                    .and_then(|chunk| chunk.get("type"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                kinds.push(kind);
            }
            Frame::Text(_) => break,
            _ => break,
        }
    }
    assert_eq!(
        kinds.first().map(String::as_str),
        Some("start"),
        "{kinds:?}"
    );
    assert!(kinds.iter().any(|kind| kind == "text-delta"), "{kinds:?}");
    assert_eq!(
        kinds.last().map(String::as_str),
        Some("finish"),
        "{kinds:?}"
    );
    Ok(())
}

#[tokio::test]
async fn a_key_in_the_first_message_authenticates_and_a_wrong_one_closes_4401() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = key_for(&app, &common::bearer(&admin)?, &assistant_id).await?;

    let address = ws::serve(app).await?;
    let path = format!("/v1/agents/{assistant_id}/ws");

    // The real key, in the first frame: the socket opens and answers.
    let Handshake::Open(mut socket) = ws::connect(address, &path, &[]).await? else {
        return Err("the handshake was refused".into());
    };
    socket
        .send_json(&json!({"type": "auth", "key": key}))
        .await?;
    socket
        .send_json(&json!({"type": "message", "content": "hello"}))
        .await?;
    let (text, session) = read_turn(&mut socket).await;
    assert_eq!(text, "Hello");
    assert!(session.is_some());

    // A key that is not one: 4401, and no chunks.
    let Handshake::Open(mut socket) = ws::connect(address, &path, &[]).await? else {
        return Err("the handshake was refused".into());
    };
    socket
        .send_json(&json!({"type": "auth", "key": "rantai_sk_notakey"}))
        .await?;
    let closed = next(&mut socket).await;
    assert_eq!(closed, Some(Frame::Close(4401)));
    Ok(())
}

#[tokio::test]
async fn a_socket_that_never_authenticates_is_closed_after_the_timeout() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |state| {
        state.api.limits.auth_timeout = Duration::from_millis(150);
    })
    .await?
    else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let _admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;

    let address = ws::serve(app).await?;
    let path = format!("/v1/agents/{assistant_id}/ws");
    let Handshake::Open(mut socket) = ws::connect(address, &path, &[]).await? else {
        return Err("the handshake was refused".into());
    };
    // Say nothing: the socket has a moment to present a key and then goes away.
    let closed = tokio::time::timeout(Duration::from_secs(5), socket.recv())
        .await
        .ok()
        .flatten();
    assert_eq!(closed, Some(Frame::Close(4401)));
    Ok(())
}

#[tokio::test]
async fn a_ping_is_answered_with_a_pong() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = key_for(&app, &common::bearer(&admin)?, &assistant_id).await?;

    let address = ws::serve(app).await?;
    let mut socket = open(address, &assistant_id, &key).await?;
    socket.send_json(&json!({"type": "ping"})).await?;
    let answer = next(&mut socket).await;
    assert_eq!(
        answer,
        Some(Frame::Text(json!({"type": "pong"}))),
        "the socket answers a ping"
    );
    Ok(())
}

#[tokio::test]
async fn a_second_message_while_one_is_running_is_an_error_frame() -> R {
    // The model answers half of a sentence and then waits, so the first turn is still running
    // when the second message arrives.
    let stub = Stub::start(Script::Hang(
        "Hello there, this is the start of an answer".to_owned(),
    ))
    .await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = key_for(&app, &common::bearer(&admin)?, &assistant_id).await?;

    let address = ws::serve(app).await?;
    let mut socket = open(address, &assistant_id, &key).await?;
    socket
        .send_json(&json!({"type": "message", "content": "hello"}))
        .await?;
    // The first chunk proves the turn is running.
    // The think extractor holds back the tail of a delta, so the released text is a prefix.
    let first = socket
        .recv_until(|frame| delta(frame).is_some_and(|text| text.contains("Hello")))
        .await;
    assert!(first.is_some(), "the first turn streams");

    socket
        .send_json(&json!({"type": "message", "content": "and again"}))
        .await?;
    let refusal = read_error(&mut socket).await;
    assert_eq!(
        refusal
            .as_ref()
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str),
        Some("conflict"),
        "{refusal:?}"
    );
    Ok(())
}

#[tokio::test]
async fn a_disconnect_stops_the_model_call() -> R {
    let stub = Stub::start(Script::Hang(
        "Hello there, this is the start of an answer".to_owned(),
    ))
    .await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = key_for(&app, &common::bearer(&admin)?, &assistant_id).await?;

    let address = ws::serve(app).await?;
    let mut socket = open(address, &assistant_id, &key).await?;
    socket
        .send_json(&json!({"type": "message", "content": "hello"}))
        .await?;
    let first = socket.recv_until(|frame| delta(frame).is_some()).await;
    assert!(first.is_some(), "the turn starts");
    assert!(!stub.client_hung_up(), "the model is still talking");

    // The client goes away mid-answer: the upstream call is cancelled, not left running.
    drop(socket);
    let mut waited = Duration::ZERO;
    while !stub.client_hung_up() && waited < WAIT {
        tokio::time::sleep(Duration::from_millis(25)).await;
        waited += Duration::from_millis(25);
    }
    assert!(stub.client_hung_up(), "the model call was cancelled");
    Ok(())
}

#[tokio::test]
async fn a_key_for_another_agent_cannot_open_this_one() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let token = common::bearer(&admin)?;
    let mine = assistant(&db, &org_id).await?;
    let other = assistant(&db, &org_id).await?;
    let other_key = key_for(&app, &token, &other).await?;
    let mine_key = key_for(&app, &token, &mine).await?;

    let address = ws::serve(app).await?;
    let path = format!("/v1/agents/{mine}/ws");

    // In the handshake: refused before the socket opens at all.
    let refused = ws::connect(
        address,
        &path,
        &[("authorization", &format!("Bearer {other_key}"))],
    )
    .await?;
    let Handshake::Refused(status) = refused else {
        return Err("the socket opened with another agent's key".into());
    };
    assert_eq!(status, 401);

    // In the first message: the socket opens and is closed 4401, with no chunk.
    let Handshake::Open(mut socket) = ws::connect(address, &path, &[]).await? else {
        return Err("the handshake was refused".into());
    };
    socket
        .send_json(&json!({"type": "auth", "key": other_key}))
        .await?;
    let closed = next(&mut socket).await;
    assert_eq!(closed, Some(Frame::Close(4401)));

    // Positive control: the key of the agent the socket names does open it.
    let _socket = open(address, &mine, &mine_key).await?;
    Ok(())
}

#[tokio::test]
async fn a_message_resumes_the_conversation_the_key_started() -> R {
    let stub = Stub::start(Script::Text(vec!["Noted.".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = key_for(&app, &common::bearer(&admin)?, &assistant_id).await?;

    let address = ws::serve(app).await?;
    let mut socket = open(address, &assistant_id, &key).await?;
    socket
        .send_json(&json!({"type": "message", "content": "my name is Budi"}))
        .await?;
    let (_, session) = read_turn(&mut socket).await;
    let Some(session) = session else {
        return Err("the first turn named no session".into());
    };

    socket
        .send_json(&json!({"type": "message", "content": "what is my name?", "sessionId": session}))
        .await?;
    let (text, again) = read_turn(&mut socket).await;
    assert_eq!(text, "Noted.");
    assert_eq!(again.as_deref(), Some(session.as_str()));

    // The model was asked the whole conversation the second time round, which is what makes
    // the socket one conversation rather than one message after another.
    let requests = stub.requests()?;
    let second = requests
        .iter()
        .filter_map(|request| request.get("messages").and_then(Value::as_array))
        .find(|messages| messages.len() >= 4);
    let messages = second.ok_or("the second turn carried the conversation")?;
    let asked: Vec<&str> = messages
        .iter()
        .filter_map(|message| message.get("content").and_then(Value::as_str))
        .collect();
    assert!(
        asked
            .iter()
            .any(|content| content.contains("my name is Budi")),
        "{asked:?}"
    );
    Ok(())
}

#[tokio::test]
async fn an_agent_that_needs_the_knowledge_base_is_refused_on_the_socket() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let token = common::bearer(&admin)?;
    let kb = assistant(&db, &org_id).await?;
    sqlx::query(r#"UPDATE "Assistant" SET "useKnowledgeBase" = true WHERE "id" = $1"#)
        .bind(&kb)
        .execute(&db)
        .await?;
    let key = key_for(&app, &token, &kb).await?;

    let address = ws::serve(app.clone()).await?;
    let mut socket = open(address, &kb, &key).await?;
    socket
        .send_json(&json!({"type": "message", "content": "hello"}))
        .await?;
    let refusal = read_error(&mut socket).await;
    assert_eq!(
        refusal
            .as_ref()
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str),
        Some("capability_not_ported"),
        "{refusal:?}"
    );

    // An MCP server bound to the agent is refused the same way, on this transport too.
    let with_mcp = assistant(&db, &org_id).await?;
    let server = agents_store::new_id();
    sqlx::query(
        r#"INSERT INTO "McpServerConfig" ("id","name","transport","enabled","configured","isBuiltIn","createdAt","updatedAt")
           VALUES ($1,'t','sse',true,true,false,now(),now())"#,
    )
    .bind(&server)
    .execute(&db)
    .await?;
    sqlx::query(
        r#"INSERT INTO "AssistantMcpServer" ("id","assistantId","mcpServerId","enabled","createdAt")
           VALUES ($1,$2,$3,true,now())"#,
    )
    .bind(agents_store::new_id())
    .bind(&with_mcp)
    .bind(&server)
    .execute(&db)
    .await?;
    let mcp_key = key_for(&app, &token, &with_mcp).await?;
    let address = ws::serve(app.clone()).await?;
    let mut socket = open(address, &with_mcp, &mcp_key).await?;
    socket
        .send_json(&json!({"type": "message", "content": "hello"}))
        .await?;
    let refusal = read_error(&mut socket).await;
    assert_eq!(
        refusal
            .as_ref()
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str),
        Some("capability_not_ported"),
        "{refusal:?}"
    );

    // Positive control: an agent without the knowledge base answers on the same socket path.
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let plain = assistant(&db, &org_id).await?;
    let plain_key = key_for(&app, &token, &plain).await?;
    let address = ws::serve(app).await?;
    let mut socket = open(address, &plain, &plain_key).await?;
    socket
        .send_json(&json!({"type": "message", "content": "hello"}))
        .await?;
    let (text, _) = read_turn(&mut socket).await;
    assert_eq!(text, "Hello");
    Ok(())
}
