//! `POST /api/chat` with tools (D3), against a scripted model server.
//!
//! Old: the tool parts of `runChat` (`src/features/chat-public/service.ts`), the registry and
//! the approval gate (`src/lib/tools/{registry,approval}.ts`) and
//! `src/app/api/chat/tool-approval/route.ts`. The expected frames are the ones
//! `bun scripts/oracle-tool-frames.ts` prints from the `ai` package itself.

#[path = "chat_plain/stub.rs"]
mod stub;

#[path = "chat_plain/helpers.rs"]
mod helpers;

mod common;

use std::time::Duration;

use agents_server::config::ToolApprovalTiming;
use agents_store::{PgPool, new_id};
use axum::Router;
use common::{R, bearer, code, send, user};
use helpers::{assistant, body, frames, router_with, send_raw};
use serde_json::{Value, json};
use stub::{Script, Stub};

const INPUT: &str = r#"{"expression":"2 + 3 * 4"}"#;

/// What the oracle printed for "two steps, the tool answers", with the stub's call id.
fn two_steps(call_id: &str) -> String {
    [
        r#"data: {"type":"start"}"#,
        r#"data: {"type":"start-step"}"#,
        r#"data: {"type":"tool-input-start","toolCallId":"call_1","toolName":"calculator"}"#,
        r#"data: {"type":"tool-input-delta","toolCallId":"call_1","inputTextDelta":"{\"expression\":\"2 + 3 * 4\"}"}"#,
        r#"data: {"type":"tool-input-available","toolCallId":"call_1","toolName":"calculator","input":{"expression":"2 + 3 * 4"}}"#,
        r#"data: {"type":"tool-output-available","toolCallId":"call_1","output":{"success":true,"expression":"2 + 3 * 4","result":14}}"#,
        r#"data: {"type":"finish-step"}"#,
        r#"data: {"type":"start-step"}"#,
        r#"data: {"type":"text-start","id":"txt-0"}"#,
        // The old think extraction (`createExtractThinkTransform`) held back the last six
        // characters, which could still open a `<think>` tag: one delta became two.
        r#"data: {"type":"text-delta","id":"txt-0","delta":"The answer "}"#,
        r#"data: {"type":"text-delta","id":"txt-0","delta":"is 14."}"#,
        r#"data: {"type":"text-end","id":"txt-0"}"#,
        r#"data: {"type":"finish-step"}"#,
        r#"data: {"type":"finish","finishReason":"stop"}"#,
        "data: [DONE]",
    ]
    .iter()
    .map(|frame| format!("{frame}\n\n"))
    .collect::<String>()
    .replace("call_1", call_id)
}

/// The denial the oracle printed for "gated: denied".
const DENIED: &str = r#"{"performed":false,"approval":"denied","message":"The user declined this action. Do not retry it; tell the user it was not performed."}"#;

fn calculator_script() -> Script {
    Script::ToolThenText {
        name: "calculator".to_owned(),
        arguments: INPUT.to_owned(),
        text: vec!["The answer is 14.".to_owned()],
    }
}

/// A short wait, polled often, so a test never sits out the 90 seconds.
fn quick(state: &mut agents_server::AppState) {
    state.tool_approval = ToolApprovalTiming {
        timeout: Duration::from_secs(5),
        poll: Duration::from_millis(25),
    };
}

/// A tool row and its binding to the assistant; returns the tool's id.
async fn bind_tool(
    db: &PgPool,
    assistant_id: &str,
    name: &str,
    category: &str,
) -> Result<String, sqlx::Error> {
    let tool_id = new_id();
    sqlx::query(
        r#"INSERT INTO "Tool" ("id","name","displayName","description","category","parameters","tags",
             "isBuiltIn","enabled","userSelectable","createdAt","updatedAt")
           VALUES ($1,$2,$2,'Evaluate mathematical expressions.',$3,'{}','{}',$4,true,true,now(),now())"#,
    )
    .bind(&tool_id)
    .bind(name)
    .bind(category)
    .bind(category == "builtin")
    .execute(db)
    .await?;
    sqlx::query(
        r#"INSERT INTO "AssistantTool" ("id","assistantId","toolId","enabled","createdAt")
           VALUES ($1,$2,$3,true,now())"#,
    )
    .bind(new_id())
    .bind(assistant_id)
    .bind(&tool_id)
    .execute(db)
    .await?;
    Ok(tool_id)
}

/// An assistant with the calculator bound; `guard_rails` and `model_config` are its columns.
async fn calculator_assistant(
    db: &PgPool,
    guard_rails: Option<Value>,
    model_config: Option<Value>,
) -> Result<String, Box<dyn std::error::Error>> {
    let id = assistant(db, None).await?;
    sqlx::query(r#"UPDATE "Assistant" SET "guardRails"=$2, "modelConfig"=$3 WHERE "id"=$1"#)
        .bind(&id)
        .bind(guard_rails.map(sqlx::types::Json))
        .bind(model_config.map(sqlx::types::Json))
        .execute(db)
        .await?;
    bind_tool(db, &id, "calculator", "builtin").await?;
    Ok(id)
}

/// Starts a chat in the background: the stream stays open while the tool waits.
fn start_chat(
    app: &Router,
    token: String,
    assistant_id: &str,
) -> tokio::task::JoinHandle<Result<(u16, axum::http::HeaderMap, String), String>> {
    let app = app.clone();
    let request = body(assistant_id);
    tokio::spawn(
        async move { send_raw(&app, "POST", "/api/chat", Some(&token), Some(request)).await },
    )
}

/// Waits until the chat has written its pending decision for the call.
async fn pending(db: &PgPool, call_id: &str, user_id: &str) -> R {
    for _ in 0..400 {
        let status: Option<String> = sqlx::query_scalar(
            r#"SELECT "status" FROM "ChatToolApproval" WHERE "toolCallId"=$1 AND "userId"=$2"#,
        )
        .bind(call_id)
        .bind(user_id)
        .fetch_optional(db)
        .await?;
        if status.as_deref() == Some("pending") {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    Err("the chat never waited for a decision".into())
}

/// The output the client saw for the call.
fn output_of(text: &str, call_id: &str) -> Option<Value> {
    frames(text).into_iter().find_map(|frame| {
        (frame.get("type").and_then(Value::as_str) == Some("tool-output-available")
            && frame.get("toolCallId").and_then(Value::as_str) == Some(call_id))
        .then(|| frame.get("output").cloned())
        .flatten()
    })
}

/// How many times the tool ran, by the execution log.
async fn runs(db: &PgPool, tool_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(r#"SELECT COUNT(*) FROM "ToolExecution" WHERE "toolId"=$1"#)
        .bind(tool_id)
        .fetch_one(db)
        .await
}

#[tokio::test]
async fn a_tool_runs_and_its_output_streams_as_the_sdk_wrote_it() -> R {
    let stub = Stub::start(calculator_script()).await?;
    let Some((app, db)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    // No guard rails: "risky", and the calculator is one of the tools that never waits.
    let assistant_id = calculator_assistant(&db, None, None).await?;
    let tool_id: String =
        sqlx::query_scalar(r#"SELECT "toolId" FROM "AssistantTool" WHERE "assistantId"=$1"#)
            .bind(&assistant_id)
            .fetch_one(&db)
            .await?;

    let (status, headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;

    assert_eq!(status, 200, "{text}");
    assert_eq!(text, two_steps(&stub.call_id(1)));
    assert!(headers.get("x-tool-approval").is_none());

    // The model was offered the tool with the row's description and the SDK's schema, and got
    // the result back.
    let requests = stub.tool_requests()?;
    assert_eq!(requests.len(), 2);
    let offered = requests
        .first()
        .and_then(|request| request.get("tools"))
        .cloned()
        .unwrap_or(Value::Null);
    let calculator = offered
        .as_array()
        .and_then(|tools| tools.first())
        .and_then(|tool| tool.get("function"))
        .cloned()
        .unwrap_or(Value::Null);
    assert_eq!(calculator.get("name"), Some(&json!("calculator")));
    assert_eq!(
        calculator.get("description"),
        Some(&json!("Evaluate mathematical expressions."))
    );
    assert_eq!(
        calculator.pointer("/parameters/required"),
        Some(&json!(["expression"]))
    );
    let system = requests
        .first()
        .and_then(|request| request.pointer("/messages/0/content"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    assert!(
        system.contains("You have these tools: calculator."),
        "{system}"
    );
    let result = requests
        .get(1)
        .and_then(|request| request.get("messages"))
        .and_then(Value::as_array)
        .and_then(|messages| {
            messages
                .iter()
                .find(|message| message.get("role") == Some(&json!("tool")))
        })
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    assert_eq!(
        result,
        r#"{"success":true,"expression":"2 + 3 * 4","result":14}"#
    );
    assert_eq!(runs(&db, &tool_id).await?, 1);
    Ok(())
}

#[tokio::test]
async fn an_approval_waits_for_a_decision_posted_to_another_instance() -> R {
    let stub = Stub::start(calculator_script()).await?;
    let Some((streaming, db)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    // A second instance, with a pool of its own: the decision does not reach the process that
    // holds the stream.
    let Some((deciding, _other_pool)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id =
        calculator_assistant(&db, Some(json!({"toolApproval": "all"})), None).await?;
    let call_id = stub.call_id(1);

    let chat = start_chat(&streaming, bearer(&user_id)?, &assistant_id);
    pending(&db, &call_id, &user_id).await?;
    let (status, decided) = send(
        &deciding,
        "POST",
        "/api/chat/tool-approval",
        Some(&bearer(&user_id)?),
        Some(json!({"toolCallId": call_id, "approved": true})),
    )
    .await?;
    assert_eq!(status, 200, "{decided}");
    assert_eq!(decided, json!({"ok": true}));

    let (status, headers, text) = chat.await??;
    assert_eq!(status, 200, "{text}");
    assert_eq!(
        headers
            .get("x-tool-approval")
            .and_then(|value| value.to_str().ok()),
        Some("calculator,saveMemory,forgetMemory")
    );
    // Approved: the stream is the one an ungated tool writes.
    assert_eq!(text, two_steps(&call_id));
    // The wait cleaned up after itself.
    let left: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "ChatToolApproval" WHERE "toolCallId"=$1"#)
            .bind(&call_id)
            .fetch_one(&db)
            .await?;
    assert_eq!(left, 0);
    Ok(())
}

#[tokio::test]
async fn a_denial_gives_the_model_the_old_refusal_and_the_tool_does_not_run() -> R {
    let stub = Stub::start(calculator_script()).await?;
    let Some((app, db)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id =
        calculator_assistant(&db, Some(json!({"toolApproval": "all"})), None).await?;
    let tool_id: String =
        sqlx::query_scalar(r#"SELECT "toolId" FROM "AssistantTool" WHERE "assistantId"=$1"#)
            .bind(&assistant_id)
            .fetch_one(&db)
            .await?;
    let call_id = stub.call_id(1);

    let chat = start_chat(&app, bearer(&user_id)?, &assistant_id);
    pending(&db, &call_id, &user_id).await?;
    let (status, _) = send(
        &app,
        "POST",
        "/api/chat/tool-approval",
        Some(&bearer(&user_id)?),
        Some(json!({"toolCallId": call_id, "approved": false})),
    )
    .await?;
    assert_eq!(status, 200);

    let (status, _headers, text) = chat.await??;
    assert_eq!(status, 200, "{text}");
    let expected: Value = serde_json::from_str(DENIED)?;
    assert_eq!(output_of(&text, &call_id), Some(expected));
    assert!(text.contains(&format!(
        "data: {{\"type\":\"tool-output-available\",\"toolCallId\":\"{call_id}\",\"output\":{DENIED}}}\n\n"
    )));
    // The model got the refusal, and the tool never ran.
    let result = stub
        .tool_requests()?
        .get(1)
        .and_then(|request| request.get("messages"))
        .and_then(Value::as_array)
        .and_then(|messages| {
            messages
                .iter()
                .find(|message| message.get("role") == Some(&json!("tool")))
                .and_then(|message| message.get("content"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
    assert_eq!(result.as_deref(), Some(DENIED));
    assert_eq!(runs(&db, &tool_id).await?, 0);
    Ok(())
}

#[tokio::test]
async fn a_decision_on_another_user_s_call_is_not_found() -> R {
    let stub = Stub::start(calculator_script()).await?;
    let Some((app, db)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    let owner = user(&db, false).await?;
    let stranger = user(&db, false).await?;
    let assistant_id =
        calculator_assistant(&db, Some(json!({"toolApproval": "all"})), None).await?;
    let call_id = stub.call_id(1);

    let chat = start_chat(&app, bearer(&owner)?, &assistant_id);
    pending(&db, &call_id, &owner).await?;

    let (status, refused) = send(
        &app,
        "POST",
        "/api/chat/tool-approval",
        Some(&bearer(&stranger)?),
        Some(json!({"toolCallId": call_id, "approved": true})),
    )
    .await?;
    assert_eq!(status, 404, "{refused}");
    assert_eq!(code(&refused), Some("not_found"));

    // The positive control: the owner's own decision is taken, and the call runs.
    let (status, _) = send(
        &app,
        "POST",
        "/api/chat/tool-approval",
        Some(&bearer(&owner)?),
        Some(json!({"toolCallId": call_id, "approved": true})),
    )
    .await?;
    assert_eq!(status, 200);
    let (status, _headers, text) = chat.await??;
    assert_eq!(status, 200);
    assert_eq!(
        output_of(&text, &call_id),
        Some(json!({"success": true, "expression": "2 + 3 * 4", "result": 14}))
    );

    // The route's own refusals.
    let (status, _) = send(
        &app,
        "POST",
        "/api/chat/tool-approval",
        None,
        Some(json!({"toolCallId": call_id, "approved": true})),
    )
    .await?;
    assert_eq!(status, 401);
    let (status, invalid) = send(
        &app,
        "POST",
        "/api/chat/tool-approval",
        Some(&bearer(&owner)?),
        Some(json!({"toolCallId": "", "approved": "yes"})),
    )
    .await?;
    assert_eq!(status, 400);
    assert_eq!(code(&invalid), Some("invalid_request"));
    assert_eq!(
        invalid
            .pointer("/error/errors")
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(2)
    );
    Ok(())
}

#[tokio::test]
async fn the_step_budget_stops_the_loop() -> R {
    let stub = Stub::start(Script::AlwaysTool {
        name: "calculator".to_owned(),
        arguments: INPUT.to_owned(),
    })
    .await?;
    let Some((app, db)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let two = calculator_assistant(&db, None, Some(json!({"maxSteps": 2}))).await?;

    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&two)),
    )
    .await?;
    assert_eq!(status, 200, "{text}");
    // Two model calls, each answered with a call of the tool; the turn ends with the reason
    // of the last step, as the SDK ended it.
    assert_eq!(stub.tool_requests()?.len(), 2);
    let outputs = frames(&text)
        .iter()
        .filter(|frame| frame.get("type") == Some(&json!("tool-output-available")))
        .count();
    assert_eq!(outputs, 2);
    assert!(text.ends_with(
        "data: {\"type\":\"finish-step\"}\n\ndata: {\"type\":\"finish\",\"finishReason\":\"tool-calls\"}\n\ndata: [DONE]\n\n"
    ));

    // The positive control: a budget of three makes three calls, so the budget is what
    // stopped the first chat.
    let three = calculator_assistant(&db, None, Some(json!({"maxSteps": 3}))).await?;
    let (status, _headers, _text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&three)),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(stub.tool_requests()?.len(), 2 + 3);
    Ok(())
}

#[tokio::test]
async fn a_call_the_sdk_would_refuse_is_a_tool_input_error() -> R {
    // The model sends input that does not fit the schema.
    let stub = Stub::start(Script::ToolThenText {
        name: "calculator".to_owned(),
        arguments: r#"{"expr":1}"#.to_owned(),
        text: vec!["Sorry.".to_owned()],
    })
    .await?;
    let Some((app, db)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = calculator_assistant(&db, None, None).await?;
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;
    assert_eq!(status, 200, "{text}");
    let seen = frames(&text);
    let kinds: Vec<&str> = seen
        .iter()
        .filter_map(|frame| frame.get("type").and_then(Value::as_str))
        .collect();
    assert_eq!(
        kinds.get(2..6),
        Some(
            &[
                "tool-input-start",
                "tool-input-delta",
                "tool-input-error",
                "tool-output-error"
            ][..]
        )
    );
    let input_error = seen.get(4).cloned().unwrap_or(Value::Null);
    assert_eq!(input_error.get("input"), Some(&json!({"expr": 1})));
    assert!(input_error.get("dynamic").is_none());

    // The model names a tool it was not offered: the SDK marked the frames `dynamic`.
    let stub = Stub::start(Script::ToolThenText {
        name: "nope".to_owned(),
        arguments: INPUT.to_owned(),
        text: vec!["Sorry.".to_owned()],
    })
    .await?;
    let Some((app, _db)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;
    assert_eq!(status, 200, "{text}");
    let seen = frames(&text);
    assert_eq!(
        seen.get(2).and_then(|f| f.get("dynamic")),
        Some(&json!(false))
    );
    assert_eq!(
        seen.get(4).and_then(|f| f.get("type")),
        Some(&json!("tool-input-error"))
    );
    assert_eq!(
        seen.get(4).and_then(|f| f.get("dynamic")),
        Some(&json!(true))
    );
    assert_eq!(
        seen.get(5).and_then(|f| f.get("type")),
        Some(&json!("tool-output-error"))
    );
    assert_eq!(
        seen.get(5).and_then(|f| f.get("dynamic")),
        Some(&json!(true))
    );
    Ok(())
}

#[tokio::test]
async fn an_mcp_workflow_or_unported_tool_still_goes_to_the_old_service() -> R {
    let stub = Stub::start(calculator_script()).await?;
    let Some((app, db)) = router_with(&stub, quick).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let token = bearer(&user_id)?;

    // The positive control: the calculator alone is served here.
    let alone = calculator_assistant(&db, None, None).await?;
    let (status, _headers, text) =
        send_raw(&app, "POST", "/api/chat", Some(&token), Some(body(&alone))).await?;
    assert_eq!(status, 200, "{text}");

    // The calculator and an MCP server.
    let with_mcp = calculator_assistant(&db, None, None).await?;
    let server = new_id();
    sqlx::query(
        r#"INSERT INTO "McpServerConfig" ("id","name","transport","createdAt","updatedAt")
           VALUES ($1,'m','sse',now(),now())"#,
    )
    .bind(&server)
    .execute(&db)
    .await?;
    sqlx::query(
        r#"INSERT INTO "AssistantMcpServer" ("id","assistantId","mcpServerId","enabled","createdAt")
           VALUES ($1,$2,$3,true,now())"#,
    )
    .bind(new_id())
    .bind(&with_mcp)
    .bind(&server)
    .execute(&db)
    .await?;

    // The calculator and a workflow.
    let with_workflow = calculator_assistant(&db, None, None).await?;
    let workflow = new_id();
    sqlx::query(
        r#"INSERT INTO "Workflow" ("id","name","tags","createdBy","createdAt","updatedAt")
           VALUES ($1,'w','{}',$2,now(),now())"#,
    )
    .bind(&workflow)
    .bind(&user_id)
    .execute(&db)
    .await?;
    sqlx::query(
        r#"INSERT INTO "AssistantWorkflow" ("id","assistantId","workflowId","enabled","createdAt")
           VALUES ($1,$2,$3,true,now())"#,
    )
    .bind(new_id())
    .bind(&with_workflow)
    .bind(&workflow)
    .execute(&db)
    .await?;

    // The calculator and a tool that is not a built-in, or a built-in that needs a service.
    let with_custom = calculator_assistant(&db, None, None).await?;
    bind_tool(&db, &with_custom, "lookup_order", "custom").await?;
    let with_search = calculator_assistant(&db, None, None).await?;
    bind_tool(&db, &with_search, "web_search", "builtin").await?;

    for assistant_id in [&with_mcp, &with_workflow, &with_custom, &with_search] {
        let (status, _headers, text) = send_raw(
            &app,
            "POST",
            "/api/chat",
            Some(&token),
            Some(body(assistant_id)),
        )
        .await?;
        assert_eq!(status, 409, "{text}");
        assert!(
            text.contains("\"code\":\"capability_not_ported\""),
            "{text}"
        );
    }

    // The toolbar may turn the unported tool off, and then the chat is served here.
    let mut without_search = body(&with_search);
    if let Some(object) = without_search.as_object_mut() {
        object.insert("enableWebSearch".to_owned(), json!(false));
    }
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&token),
        Some(without_search),
    )
    .await?;
    assert_eq!(status, 200, "{text}");
    Ok(())
}
