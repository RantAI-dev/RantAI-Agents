//! `POST /api/assistants/wizard/stream` against a scripted stub server: the frames the
//! client sees, the sanitised proposal and the callers that are refused.
//!
//! The stub is a raw TCP listener in this file: it answers with the OpenAI SSE frames the
//! providers send, so the tests never touch the network.

#[allow(dead_code, reason = "this file uses only part of the shared helpers")]
mod common;

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use agents_llm::provider::ProviderConfig;
use agents_server::config::LlmSettings;
use agents_server::policy::{AllowAll, WizardModel, WizardModelEntry};
use agents_store::{PgPool, new_id};
use axum::Router;
use axum::body::Body;
use axum::http::{Request, Response};
use common::{R, bearer, code, user};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tower::ServiceExt;

/// The model the test's catalogue knows.
const MODEL: &str = "stub-model";

/// A scripted model server on 127.0.0.1.
struct Stub {
    address: SocketAddr,
    bodies: Arc<Mutex<Vec<String>>>,
}

impl Stub {
    /// A server that answers with these SSE bodies, one per request.
    async fn start(replies: Vec<String>) -> Result<Self, Box<dyn std::error::Error>> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let bodies = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&bodies);
        tokio::spawn(async move {
            let mut replies = replies.into_iter();
            while let Ok((mut socket, _)) = listener.accept().await {
                let reply = replies
                    .next()
                    .unwrap_or_else(|| "data: [DONE]\n\n".to_owned());
                let recorded = Arc::clone(&recorded);
                tokio::spawn(async move {
                    let body = read_request(&mut socket, recorded).await;
                    let _ = write_reply(&mut socket, &reply).await;
                    let _ = body;
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
async fn read_request(
    socket: &mut tokio::net::TcpStream,
    bodies: Arc<Mutex<Vec<String>>>,
) -> String {
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

/// Answer with one SSE body.
async fn write_reply(socket: &mut tokio::net::TcpStream, body: &str) -> std::io::Result<()> {
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
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

/// One chunk with a whole tool call.
fn tool_chunk(id: &str, name: &str, arguments: Value) -> String {
    json!({
        "id": "chatcmpl-1",
        "object": "chat.completion.chunk",
        "model": "stub",
        "choices": [{"index": 0, "delta": {"tool_calls": [{
            "index": 0,
            "id": id,
            "function": {"name": name, "arguments": arguments.to_string()}
        }]}}],
    })
    .to_string()
}

/// The wizard's catalogue for the test: one model.
#[derive(Debug)]
struct StubWizard;

impl WizardModel for StubWizard {
    fn model_id(&self) -> &str {
        MODEL
    }

    fn is_free_plan(&self, _organization_id: &str) -> bool {
        false
    }

    fn models(&self, _organization_id: &str) -> Vec<WizardModelEntry> {
        vec![WizardModelEntry {
            id: MODEL.to_owned(),
            name: "Stub".to_owned(),
            function_calling: true,
            ctx: None,
        }]
    }
}

/// The router, with the wizard talking to the stub.
fn router_for(db: &PgPool, stub: &Stub) -> Router {
    common::router_over(
        db,
        Arc::new(AllowAll),
        Arc::new(StubWizard),
        LlmSettings {
            base_url: Some(stub.base_url()),
            api_key: Some("stub-key".to_owned()),
            provider: ProviderConfig {
                openrouter_api_key: Some("or-key".to_owned()),
                ..ProviderConfig::default()
            },
        },
    )
}

/// An organisation row; returns its id.
async fn org(db: &PgPool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt")
           VALUES ($1,'t',$1,now(),now())"#,
    )
    .bind(&id)
    .execute(db)
    .await?;
    Ok(id)
}

/// An accepted membership of a user in an organisation.
///
/// The role is `admin`: the wizard builds an agent, which is `agents.create` and so admin-only
/// (`docs/port/differences.md`, row 80). The wizard's own tests are about the stream, not the
/// role; `agent_rbac` covers a member's 403.
async fn member(db: &PgPool, user_id: &str, org_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,'admin',now())"#,
    )
    .bind(new_id())
    .bind(user_id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(())
}

/// A tool row of the organisation; returns its id.
async fn tool_row(db: &PgPool, org_id: &str) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Tool" ("id","name","displayName","description","category","parameters",
             "organizationId","userSelectable","createdAt","updatedAt")
           VALUES ($1,$1,'d','d','builtin','{}',$2,true,now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(id)
}

/// A skill row of the organisation; returns its id.
async fn skill_row(db: &PgPool, org_id: &str) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Skill" ("id","name","displayName","description","content","source","tags",
             "organizationId","createdAt","updatedAt")
           VALUES ($1,$1,'d','d','c','custom','{}',$2,now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(id)
}

/// The raw frames of the answer.
async fn raw_frames(
    app: &Router,
    auth: Option<&str>,
    body: Value,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut request = Request::builder()
        .method("POST")
        .uri("/api/assistants/wizard/stream")
        .header("content-type", "application/json");
    if let Some(auth) = auth {
        request = request.header("authorization", auth);
    }
    let request = request.body(Body::from(serde_json::to_vec(&body)?))?;
    let response: Response<Body> = app.clone().oneshot(request).await?;
    let status = response.status().as_u16();
    let bytes = response.into_body().collect().await?.to_bytes();
    let text = String::from_utf8_lossy(&bytes).to_string();
    if status != 200 {
        return Err(format!("the wizard answered {status}: {text}").into());
    }
    Ok(text
        .split("\n\n")
        .map(str::trim)
        .filter(|frame| !frame.is_empty())
        .map(|frame| frame.strip_prefix("data: ").unwrap_or(frame).to_owned())
        .collect())
}

/// The type of every chunk of the answer.
fn types(frames: &[String]) -> Vec<String> {
    frames
        .iter()
        .filter_map(|frame| serde_json::from_str::<Value>(frame).ok())
        .filter_map(|chunk| chunk.get("type").and_then(Value::as_str).map(str::to_owned))
        .collect()
}

/// The chunk with that type.
fn chunk_of_type(frames: &[String], kind: &str) -> Option<Value> {
    frames
        .iter()
        .filter_map(|frame| serde_json::from_str::<Value>(frame).ok())
        .find(|chunk| chunk.get("type").and_then(Value::as_str) == Some(kind))
}

/// The request the dashboard sends.
fn request() -> Value {
    json!({
        "messages": [
            {"id": "m1", "role": "user", "content": "I want an agent that answers invoices."}
        ],
        "draft": {
            "selectedToolIds": [],
            "selectedSkillIds": [],
            "selectedMcpServerIds": [],
            "selectedWorkflowIds": [],
            "knowledgeBaseGroupIds": []
        }
    })
}

#[tokio::test]
async fn the_wizard_streams_the_frames_and_the_sanitised_proposal() -> R {
    let Some(db) = common::pool().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id).await?;
    let tool = tool_row(&db, &org_id).await?;
    let auth = bearer(&member_user)?;

    let stub = Stub::start(vec![
        sse(&[
            tool_chunk(
                "call_1",
                "proposeAgent",
                json!({
                    "name": "Invoice agent",
                    "description": "Answers invoices",
                    "systemPrompt": "## Goal\nAnswer every invoice question.",
                    "model": MODEL,
                    "selectedToolIds": [tool, "tool_unknown"],
                    "selectedSkillIds": ["skill_unknown"],
                    "openingQuestions": ["Which invoices?"]
                }),
            ),
            finish_chunk("tool_calls"),
        ]),
        sse(&[
            chunk(json!({"content": "Here is the draft."})),
            finish_chunk("stop"),
        ]),
    ])
    .await?;
    let app = router_for(&db, &stub);

    let frames = raw_frames(&app, Some(&auth), request()).await?;

    // The frames are the ones the AI SDK's UI message stream carries. How many text
    // deltas there are depends on how the bytes arrive (the client holds back a possible
    // `<think>` tag), so a run of deltas counts as one.
    let mut kinds = types(&frames);
    kinds.dedup_by(|a, b| a == "text-delta" && b == "text-delta");
    assert_eq!(
        kinds,
        vec![
            "start",
            "start-step",
            "tool-input-start",
            "tool-input-delta",
            "tool-input-available",
            "tool-output-available",
            "finish-step",
            "start-step",
            "text-start",
            "text-delta",
            "text-end",
            "finish-step",
            "finish",
        ]
    );
    // The stream ends the way the SDK ends it, with the last step's reason.
    assert_eq!(frames.last().map(String::as_str), Some("[DONE]"));
    let finish = chunk_of_type(&frames, "finish").ok_or("no finish chunk")?;
    assert_eq!(finish.pointer("/finishReason"), Some(&json!("stop")));

    // The proposal is in the tool chunk, and the ids the organisation does not have are
    // gone.
    let proposal = chunk_of_type(&frames, "tool-input-available")
        .ok_or("no tool chunk")?
        .pointer("/input")
        .cloned()
        .ok_or("no input")?;
    assert_eq!(proposal.pointer("/name"), Some(&json!("Invoice agent")));
    assert_eq!(proposal.pointer("/model"), Some(&json!(MODEL)));
    assert_eq!(
        proposal.pointer("/selectedToolIds"),
        Some(&json!([tool.as_str()])),
        "the tool the organisation does not have is dropped"
    );
    assert_eq!(
        proposal.pointer("/selectedSkillIds"),
        Some(&json!([])),
        "the skill the organisation does not have is dropped"
    );
    assert_eq!(
        proposal.pointer("/openingQuestions"),
        Some(&json!(["Which invoices?"]))
    );

    // The tool's answer is the one the old tool returned.
    let output = chunk_of_type(&frames, "tool-output-available").ok_or("no output chunk")?;
    assert_eq!(output.pointer("/output"), Some(&json!({"ok": true})));

    // The text of the second step is the model's answer.
    let text: String = frames
        .iter()
        .filter_map(|frame| serde_json::from_str::<Value>(frame).ok())
        .filter(|chunk| chunk.get("type").and_then(Value::as_str) == Some("text-delta"))
        .filter_map(|chunk| {
            chunk
                .get("delta")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect();
    assert_eq!(text, "Here is the draft.");

    // The model was asked with the wizard's prompt and the organisation's catalogues.
    let bodies = stub.requests()?;
    let first: Value = serde_json::from_str(bodies.first().map(String::as_str).unwrap_or("{}"))?;
    let system = first
        .pointer("/messages/0/content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    assert!(system.contains("Agent Builder Wizard"), "{system}");
    assert!(
        system.contains(&org_id),
        "the prompt names the organisation"
    );
    let tools: Vec<&Value> = first
        .get("tools")
        .and_then(Value::as_array)
        .map(|tools| tools.iter().collect())
        .unwrap_or_default();
    let names: Vec<&str> = tools
        .iter()
        .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
        .collect();
    assert_eq!(
        names,
        vec![
            "listModels",
            "listTools",
            "listSkills",
            "listMcpServers",
            "listKnowledgeGroups",
            "proposeAgent",
            "refineAgent"
        ]
    );
    Ok(())
}

#[tokio::test]
async fn a_proposal_keeps_the_ids_the_organisation_has() -> R {
    let Some(db) = common::pool().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id).await?;
    let skill = skill_row(&db, &org_id).await?;
    let auth = bearer(&member_user)?;

    let stub = Stub::start(vec![
        sse(&[
            tool_chunk(
                "call_1",
                "proposeAgent",
                json!({
                    "name": "Keeper",
                    "systemPrompt": "## Goal\nKeep the ids that exist.",
                    "model": MODEL,
                    "selectedToolIds": ["tool_unknown"],
                    "selectedSkillIds": [skill]
                }),
            ),
            finish_chunk("tool_calls"),
        ]),
        sse(&[chunk(json!({"content": "ok"})), finish_chunk("stop")]),
    ])
    .await?;
    let app = router_for(&db, &stub);

    let frames = raw_frames(&app, Some(&auth), request()).await?;
    let proposal = chunk_of_type(&frames, "tool-input-available")
        .ok_or("no tool chunk")?
        .pointer("/input")
        .cloned()
        .ok_or("no input")?;

    // The skill the organisation has stays.
    assert_eq!(
        proposal.pointer("/selectedSkillIds"),
        Some(&json!([skill.as_str()])),
        "the skill the organisation has is kept"
    );
    // The tool it does not have is gone.
    assert_eq!(
        proposal.pointer("/selectedToolIds"),
        Some(&json!([])),
        "the tool the organisation does not have is dropped"
    );
    Ok(())
}

#[tokio::test]
async fn a_caller_without_a_token_and_a_suspended_one_are_refused() -> R {
    let Some(db) = common::pool().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id).await?;
    let suspended = user(&db, true).await?;

    let stub = Stub::start(vec![sse(&[finish_chunk("stop")])]).await?;
    let app = router_for(&db, &stub);

    // No token at all.
    let (status, body) = common::send(
        &app,
        "POST",
        "/api/assistants/wizard/stream",
        None,
        Some(request()),
    )
    .await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));

    // A suspended user (QA TC-1269).
    let (status, body) = common::send(
        &app,
        "POST",
        "/api/assistants/wizard/stream",
        Some(&bearer(&suspended)?),
        Some(request()),
    )
    .await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));

    // Positive control: the same request with a live token is answered.
    let frames = raw_frames(&app, Some(&bearer(&member_user)?), request()).await?;
    assert_eq!(types(&frames).first().map(String::as_str), Some("start"));
    Ok(())
}

/// A knowledge base group; returns its id.
async fn kb_row(db: &PgPool, org_id: Option<&str>) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "KnowledgeBaseGroup" ("id","name","organizationId","createdAt","updatedAt")
           VALUES ($1,$1,$2,now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(id)
}

/// The output of the tool call with that id.
fn output_of(frames: &[String], call_id: &str) -> Option<Value> {
    frames
        .iter()
        .filter_map(|frame| serde_json::from_str::<Value>(frame).ok())
        .find(|chunk| {
            chunk.get("type").and_then(Value::as_str) == Some("tool-output-available")
                && chunk.get("toolCallId").and_then(Value::as_str) == Some(call_id)
        })
        .and_then(|chunk| chunk.get("output").cloned())
}

/// The ids a list tool returned.
fn listed_ids(output: &Value) -> Vec<String> {
    output
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn the_catalogues_are_the_organisation_s_own() -> R {
    let Some(db) = common::pool().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    member(&db, &member_user, &org_a).await?;
    let (my_tool, their_tool) = (tool_row(&db, &org_a).await?, tool_row(&db, &org_b).await?);
    let (my_kb, their_kb, global_kb) = (
        kb_row(&db, Some(&org_a)).await?,
        kb_row(&db, Some(&org_b)).await?,
        kb_row(&db, None).await?,
    );
    let auth = bearer(&member_user)?;

    let stub = Stub::start(vec![
        sse(&[
            tool_chunk("call_tools", "listTools", json!({})),
            finish_chunk("tool_calls"),
        ]),
        sse(&[
            tool_chunk("call_kbs", "listKnowledgeGroups", json!({})),
            finish_chunk("tool_calls"),
        ]),
        sse(&[
            tool_chunk(
                "call_propose",
                "proposeAgent",
                json!({
                    "name": "Scoped",
                    "systemPrompt": "## Goal\nOnly what the organisation has.",
                    "model": MODEL,
                    "selectedToolIds": [my_tool, their_tool],
                    "knowledgeBaseGroupIds": [my_kb, their_kb, global_kb]
                }),
            ),
            finish_chunk("tool_calls"),
        ]),
        sse(&[chunk(json!({"content": "done"})), finish_chunk("stop")]),
    ])
    .await?;
    let app = router_for(&db, &stub);
    let frames = raw_frames(&app, Some(&auth), request()).await?;

    let tools = listed_ids(&output_of(&frames, "call_tools").ok_or("no listTools output")?);
    // Positive control: the organisation's own tool is listed.
    assert!(tools.contains(&my_tool), "own tool listed: {tools:?}");
    assert!(
        !tools.contains(&their_tool),
        "another organisation's tool is not listed"
    );

    let kbs = listed_ids(&output_of(&frames, "call_kbs").ok_or("no listKnowledgeGroups output")?);
    assert_eq!(
        kbs,
        vec![my_kb.clone()],
        "only the organisation's own groups: not another organisation's, not a global one"
    );

    let proposal = frames
        .iter()
        .filter_map(|frame| serde_json::from_str::<Value>(frame).ok())
        .find(|chunk| {
            chunk.get("type").and_then(Value::as_str) == Some("tool-input-available")
                && chunk.get("toolName").and_then(Value::as_str) == Some("proposeAgent")
        })
        .and_then(|chunk| chunk.get("input").cloned())
        .ok_or("no proposal")?;
    assert_eq!(
        proposal.pointer("/selectedToolIds"),
        Some(&json!([my_tool])),
        "another organisation's tool is dropped from the proposal"
    );
    assert_eq!(
        proposal.pointer("/knowledgeBaseGroupIds"),
        Some(&json!([my_kb])),
        "another organisation's group and a global one are dropped from the proposal"
    );
    Ok(())
}

#[tokio::test]
async fn a_refinement_and_an_invalid_proposal_are_handled_like_the_sdk() -> R {
    let Some(db) = common::pool().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id).await?;
    let tool = tool_row(&db, &org_id).await?;
    let auth = bearer(&member_user)?;

    let stub = Stub::start(vec![
        sse(&[
            tool_chunk(
                "call_refine",
                "refineAgent",
                json!({
                    "model": "unknown/model",
                    "selectedToolIds": [tool, "tool_unknown"],
                    "emoji": "📄"
                }),
            ),
            finish_chunk("tool_calls"),
        ]),
        sse(&[
            tool_chunk(
                "call_bad",
                "proposeAgent",
                json!({"name": "Short", "systemPrompt": "too short", "model": MODEL}),
            ),
            finish_chunk("tool_calls"),
        ]),
        sse(&[chunk(json!({"content": "ok"})), finish_chunk("stop")]),
    ])
    .await?;
    let app = router_for(&db, &stub);
    let frames = raw_frames(&app, Some(&auth), request()).await?;

    let refinement = chunk_of_type(&frames, "tool-input-available")
        .and_then(|chunk| chunk.get("input").cloned())
        .ok_or("no refinement")?;
    // Positive control: the fields the organisation has stay.
    assert_eq!(refinement.pointer("/selectedToolIds"), Some(&json!([tool])));
    assert_eq!(refinement.pointer("/emoji"), Some(&json!("📄")));
    // An unknown model is left out of the patch, so the draft keeps its own.
    assert_eq!(refinement.pointer("/model"), None);

    // A proposal that does not fit the schema: an input error and an output error, both
    // dynamic, and no proposal for the client to apply.
    let input_error = chunk_of_type(&frames, "tool-input-error").ok_or("no input error")?;
    assert_eq!(input_error.pointer("/toolCallId"), Some(&json!("call_bad")));
    assert_eq!(input_error.pointer("/dynamic"), Some(&json!(true)));
    let output_error = chunk_of_type(&frames, "tool-output-error").ok_or("no output error")?;
    assert_eq!(
        output_error.pointer("/toolCallId"),
        Some(&json!("call_bad"))
    );
    assert_eq!(output_error.pointer("/dynamic"), Some(&json!(true)));
    assert!(
        !frames
            .iter()
            .any(|frame| frame.contains("\"tool-input-available\"")
                && frame.contains("\"proposeAgent\"")),
        "an invalid proposal never reaches the client as one"
    );
    Ok(())
}

#[tokio::test]
async fn a_client_that_goes_away_closes_the_model_stream() -> R {
    let Some(db) = common::pool().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id).await?;
    let auth = bearer(&member_user)?;

    // A model that starts a tool call and then goes quiet, holding the connection open.
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let (asked_tx, asked) = tokio::sync::oneshot::channel::<()>();
    let (closed_tx, closed) = tokio::sync::oneshot::channel::<()>();
    tokio::spawn(async move {
        let Ok((mut socket, _)) = listener.accept().await else {
            return;
        };
        let _ = read_request(&mut socket, Arc::new(Mutex::new(Vec::new()))).await;
        let first = format!(
            "data: {}\n\n",
            json!({
                "id": "chatcmpl-1",
                "object": "chat.completion.chunk",
                "model": "stub",
                "choices": [{"index": 0, "delta": {"tool_calls": [{
                    "index": 0, "id": "call_1",
                    "function": {"name": "proposeAgent", "arguments": "{\"name\":"}
                }]}}],
            })
        );
        let head =
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n";
        let _ = socket.write_all(head.as_bytes()).await;
        let _ = socket.write_all(first.as_bytes()).await;
        let _ = socket.flush().await;
        let _ = asked_tx.send(());
        // Wait for the server to hang up.
        let mut buffer = [0_u8; 64];
        loop {
            match socket.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
        }
        let _ = closed_tx.send(());
    });
    let app = common::router_over(
        &db,
        Arc::new(AllowAll),
        Arc::new(StubWizard),
        LlmSettings {
            base_url: Some(format!("http://{address}")),
            api_key: Some("stub-key".to_owned()),
            provider: ProviderConfig {
                openrouter_api_key: Some("or-key".to_owned()),
                ..ProviderConfig::default()
            },
        },
    );

    let request = Request::builder()
        .method("POST")
        .uri("/api/assistants/wizard/stream")
        .header("content-type", "application/json")
        .header("authorization", &auth)
        .body(Body::from(serde_json::to_vec(&request())?))?;
    let response: Response<Body> = app.oneshot(request).await?;
    assert_eq!(
        response.status().as_u16(),
        200,
        "positive control: the turn started"
    );
    let mut body = response.into_body();
    // Read until the model has been asked and the tool call has started.
    tokio::time::timeout(Duration::from_secs(10), asked).await??;
    let mut seen = String::new();
    while !seen.contains("tool-input-start") {
        let frame = tokio::time::timeout(Duration::from_secs(10), body.frame())
            .await?
            .ok_or("the stream ended early")??;
        if let Ok(data) = frame.into_data() {
            seen.push_str(&String::from_utf8_lossy(&data));
        }
    }

    // The client goes away.
    drop(body);

    // Bounded: the upstream connection must close promptly; without the cancel it never does.
    tokio::time::timeout(Duration::from_secs(5), closed)
        .await
        .map_err(|_| "the model stream was still open 5 s after the client went away")??;
    Ok(())
}
