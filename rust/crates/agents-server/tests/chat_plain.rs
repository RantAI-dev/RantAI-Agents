//! `POST /api/chat`: the plain chat, against a scripted model server.
//!
//! Old: `src/app/api/chat/route.ts` and `runChat` in `src/features/chat-public/service.ts`.
//! The frames the client sees are the ones the `ai` package writes, so they are asserted
//! exactly.

#[path = "chat_plain/stub.rs"]
mod stub;

#[path = "chat_plain/helpers.rs"]
mod helpers;

mod common;

use std::sync::Arc;

use agents_store::PgPool;
use agents_store::new_id;
use axum::body::Body;
use common::{R, bearer, code, send, user};
use helpers::{assistant, body, frames, grant_org, member, org, router_with, send_raw, types};
use serde_json::{Value, json};
use stub::{Script, Stub};
use tower::ServiceExt;

#[tokio::test]
async fn a_plain_chat_streams_the_frames_the_sdk_writes() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned(), " world".to_owned()])).await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;

    let (status, headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;

    assert_eq!(status, 200);
    assert_eq!(
        headers.get("content-type").and_then(|v| v.to_str().ok()),
        Some("text/event-stream")
    );
    assert_eq!(
        headers
            .get("x-vercel-ai-ui-message-stream")
            .and_then(|v| v.to_str().ok()),
        Some("v1")
    );
    assert_eq!(
        headers.get("cache-control").and_then(|v| v.to_str().ok()),
        Some("no-cache")
    );
    assert_eq!(
        headers
            .get("x-accel-buffering")
            .and_then(|v| v.to_str().ok()),
        Some("no")
    );

    // The frames, exactly as the `ai` package writes them.
    assert_eq!(
        text,
        "data: {\"type\":\"start\"}\n\n\
         data: {\"type\":\"start-step\"}\n\n\
         data: {\"type\":\"text-start\",\"id\":\"txt-0\"}\n\n\
         data: {\"type\":\"text-delta\",\"id\":\"txt-0\",\"delta\":\"Hello\"}\n\n\
         data: {\"type\":\"text-delta\",\"id\":\"txt-0\",\"delta\":\" world\"}\n\n\
         data: {\"type\":\"text-end\",\"id\":\"txt-0\"}\n\n\
         data: {\"type\":\"finish-step\"}\n\n\
         data: {\"type\":\"finish\",\"finishReason\":\"stop\"}\n\n\
         data: [DONE]\n\n"
    );
    Ok(())
}

#[tokio::test]
async fn the_think_content_becomes_reasoning() -> R {
    let stub = Stub::start(Script::Text(vec![
        "<think>hmm</think>the answer".to_owned(),
    ]))
    .await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;

    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;
    assert_eq!(status, 200);

    let kinds = types(&text);
    assert!(kinds.contains(&"reasoning-start".to_owned()));
    assert!(kinds.contains(&"reasoning-delta".to_owned()));
    assert!(kinds.contains(&"reasoning-end".to_owned()));

    let frames = frames(&text);
    let reasoning = frames
        .iter()
        .find(|frame| frame.get("type").and_then(Value::as_str) == Some("reasoning-delta"))
        .and_then(|frame| frame.get("delta"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    assert_eq!(reasoning, "hmm");

    // The reasoning and the answer are separate parts, and the reasoning is closed after
    // the finish frame.
    let start = frames
        .iter()
        .find(|frame| frame.get("type").and_then(Value::as_str) == Some("reasoning-start"))
        .and_then(|frame| frame.get("id"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let end = frames
        .iter()
        .find(|frame| frame.get("type").and_then(Value::as_str) == Some("reasoning-end"))
        .and_then(|frame| frame.get("id"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    assert!(!start.is_empty());
    assert_eq!(start, end);

    // The answer itself carries no thinking.
    let deltas: Vec<String> = frames
        .iter()
        .filter(|frame| frame.get("type").and_then(Value::as_str) == Some("text-delta"))
        .filter_map(|frame| frame.get("delta").and_then(Value::as_str))
        .map(str::to_owned)
        .collect();
    assert_eq!(deltas.concat(), "the answer");
    Ok(())
}

#[tokio::test]
async fn the_system_prompt_carries_the_guard_rails_and_the_profile() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;

    // The assistant has guard rails and a profile with one fact.
    sqlx::query(r#"UPDATE "Assistant" SET "guardRails"=$2 WHERE "id"=$1"#)
        .bind(&assistant_id)
        .bind(json!({"blockedTopics": ["politics"], "requireCitations": true}))
        .execute(&db)
        .await?;
    let profile = json!({
        "id": "p1",
        "userId": user_id,
        "facts": [{
            "id": "f1",
            "subject": "user",
            "predicate": "location",
            "object": "Depok",
            "confidence": 0.9,
            "source": "t",
            "createdAt": "2026-01-01T00:00:00.000Z",
        }],
        "preferences": [],
        "interactionSummary": "",
        "totalConversations": 1,
    });
    sqlx::query(
        r#"INSERT INTO "UserMemory" ("id","userId","type","key","value","embedding","createdAt","updatedAt")
           VALUES ($1,$2,'LONG_TERM','user_profile',$3,'{}',now(),now())"#,
    )
    .bind(format!("profile_{user_id}"))
    .bind(&user_id)
    .bind(&profile)
    .execute(&db)
    .await?;

    let (status, _headers, _text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;
    assert_eq!(status, 200);

    // What the model was asked.
    let request = stub
        .chat_request()?
        .ok_or("the stub received the chat request")?;
    let messages = request
        .get("messages")
        .and_then(Value::as_array)
        .ok_or("the request carries the messages")?;
    let system = messages
        .first()
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    assert!(system.starts_with("You are Budi's helper."));
    assert!(system.contains("SAFETY RULES:"));
    assert!(system.contains("politics"));
    assert!(system.contains("Always cite sources when making factual claims"));
    assert!(system.contains("--- Long-term User Profile ---"));
    assert!(system.contains("location: Depok"));
    Ok(())
}

#[tokio::test]
async fn the_assistant_of_another_organisation_is_not_found() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };

    let mine = user(&db, false).await?;
    let my_org = org(&db).await?;
    member(&db, &mine, &my_org).await?;
    let my_assistant = assistant(&db, Some(&my_org)).await?;
    // A member uses an agent through a grant (differences row 80).
    grant_org(&db, &my_org, &my_assistant).await?;

    let other = user(&db, false).await?;
    let other_org = org(&db).await?;
    member(&db, &other, &other_org).await?;
    let other_assistant = assistant(&db, Some(&other_org)).await?;

    // Another organisation's assistant is a 404, the same answer as one that does not exist.
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&mine)?),
        Some(body(&other_assistant)),
    )
    .await?;
    assert_eq!(status, 404);
    assert!(text.contains("\"code\":\"not_found\""), "{text}");

    // The assistant of the caller's own organisation answers.
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&mine)?),
        Some(body(&my_assistant)),
    )
    .await?;
    assert_eq!(status, 200);
    assert!(text.contains("\"type\":\"text-delta\""));
    Ok(())
}

#[tokio::test]
async fn an_assistant_with_a_knowledge_base_or_tools_is_not_ported_yet() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;

    // An assistant with the knowledge base on.
    let kb = assistant(&db, None).await?;
    sqlx::query(r#"UPDATE "Assistant" SET "useKnowledgeBase"=true WHERE "id"=$1"#)
        .bind(&kb)
        .execute(&db)
        .await?;
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&kb)),
    )
    .await?;
    assert_eq!(status, 409);
    assert!(
        text.contains("\"code\":\"capability_not_ported\""),
        "{text}"
    );

    // An assistant with a tool.
    let with_tool = assistant(&db, None).await?;
    let tool_id = new_id();
    sqlx::query(
        r#"INSERT INTO "Tool" ("id","name","displayName","description","category","parameters","tags",
             "isBuiltIn","enabled","userSelectable","createdAt","updatedAt")
           VALUES ($1,'web_search','Web search','search','builtin','{}','{}',true,true,true,now(),now())"#,
    )
    .bind(&tool_id)
    .execute(&db)
    .await?;
    sqlx::query(
        r#"INSERT INTO "AssistantTool" ("id","assistantId","toolId","enabled","createdAt")
           VALUES ($1,$2,$3,true,now())"#,
    )
    .bind(new_id())
    .bind(&with_tool)
    .bind(&tool_id)
    .execute(&db)
    .await?;
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&with_tool)),
    )
    .await?;
    assert_eq!(status, 409);
    assert!(
        text.contains("\"code\":\"capability_not_ported\""),
        "{text}"
    );

    // A request with an attachment.
    let plain = assistant(&db, None).await?;
    let mut with_file = body(&plain);
    if let Some(object) = with_file.as_object_mut() {
        object.insert("fileDocumentIds".to_owned(), json!(["doc_1"]));
    }
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(with_file),
    )
    .await?;
    assert_eq!(status, 409);
    assert!(
        text.contains("\"code\":\"capability_not_ported\""),
        "{text}"
    );

    // A message whose file travels as a part, the way the SDK's own transport sends it: the
    // model is never called with the file dropped.
    let with_part = json!({
        "messages": [{"id": "m1", "role": "user", "parts": [
            {"type": "text", "text": "what is in this picture?"},
            {"type": "file", "mediaType": "image/png", "url": "data:image/png;base64,AA"},
        ]}],
        "assistantId": plain,
    });
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(with_part),
    )
    .await?;
    assert_eq!(status, 409, "{text}");
    assert!(stub.requests()?.is_empty(), "the model must not be called");
    Ok(())
}

#[tokio::test]
async fn an_upstream_failure_is_the_error_frame_the_old_code_showed() -> R {
    for (status_code, expected) in [
        (
            401,
            "The model provider rejected the request — its API key may be missing or invalid. Try a different model.",
        ),
        (
            429,
            "This model is busy or rate-limited right now. Please wait a moment or switch models.",
        ),
    ] {
        let stub = Stub::start(Script::Status(status_code)).await?;
        let Some((app, db)) = router_with(&stub, |_| {}).await? else {
            return Ok(());
        };
        let user_id = user(&db, false).await?;
        let assistant_id = assistant(&db, None).await?;

        let (status, _headers, text) = send_raw(
            &app,
            "POST",
            "/api/chat",
            Some(&bearer(&user_id)?),
            Some(body(&assistant_id)),
        )
        .await?;
        assert_eq!(status, 200);

        let kinds = types(&text);
        assert_eq!(kinds.first().map(String::as_str), Some("start"));
        assert_eq!(kinds.get(1).map(String::as_str), Some("error"));
        let parsed = frames(&text);
        let error = parsed
            .get(1)
            .and_then(|frame| frame.get("errorText"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        assert_eq!(error, expected);
        // The stream ends after the error.
        assert!(text.ends_with("data: [DONE]\n\n"));
    }
    Ok(())
}

#[tokio::test]
async fn a_caller_without_a_token_is_refused() -> R {
    let Some((app, db)) = common::router().await? else {
        return Ok(());
    };
    let assistant_id = assistant(&db, None).await?;

    let (status, response) =
        send(&app, "POST", "/api/chat", None, Some(body(&assistant_id))).await?;
    assert_eq!(status, 401);
    assert_eq!(code(&response), Some("unauthenticated"));
    Ok(())
}

#[tokio::test]
async fn a_suspended_user_is_refused() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let suspended = user(&db, true).await?;
    let assistant_id = assistant(&db, None).await?;

    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&suspended)?),
        Some(body(&assistant_id)),
    )
    .await?;
    assert_eq!(status, 401);
    assert!(text.contains("\"code\":\"unauthenticated\""), "{text}");
    Ok(())
}

/// The profile of a user, as the row holds it.
async fn profile_of(db: &PgPool, user_id: &str) -> Result<Value, sqlx::Error> {
    let value: Option<Value> = sqlx::query_scalar(
        r#"SELECT "value" FROM "UserMemory"
           WHERE "userId"=$1 AND "type"='LONG_TERM' AND "key"='user_profile'"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    Ok(value.unwrap_or(Value::Null))
}

#[tokio::test]
async fn a_memory_without_the_long_term_profile_neither_reads_nor_writes_it() -> R {
    let stub = Stub::start(Script::SaveMessageThenText {
        text: vec!["noted".to_owned()],
    })
    .await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;
    // The memory is on, the long-term profile is off: the old code then neither loaded the
    // profile into the prompt nor wrote it (`profileUserId` was null).
    sqlx::query(r#"UPDATE "Assistant" SET "memoryConfig"=$2 WHERE "id"=$1"#)
        .bind(&assistant_id)
        .bind(json!({"enabled": true, "longTermProfile": false}))
        .execute(&db)
        .await?;
    let profile = json!({
        "id": format!("profile_{user_id}"),
        "userId": user_id,
        "facts": [{"id": "f1", "subject": "user", "predicate": "location", "object": "Depok",
                   "confidence": 0.9, "source": "t", "createdAt": "2026-01-01T00:00:00.000Z"}],
        "preferences": [],
        "interactionSummary": "",
        "totalConversations": 1,
    });
    sqlx::query(
        r#"INSERT INTO "UserMemory" ("id","userId","type","key","value","embedding","createdAt","updatedAt")
           VALUES ($1,$2,'LONG_TERM','user_profile',$3,'{}',now(),now())"#,
    )
    .bind(format!("profile_{user_id}"))
    .bind(&user_id)
    .bind(&profile)
    .execute(&db)
    .await?;

    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;
    assert_eq!(status, 200);
    assert!(text.contains("\"delta\":\"noted\""));

    let requests = stub.requests()?;
    let system = requests
        .first()
        .and_then(|request| request.pointer("/messages/0/content"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    assert!(
        !system.contains("location: Depok"),
        "the profile must not be read"
    );
    assert_eq!(
        profile_of(&db, &user_id).await?,
        profile,
        "the profile must not be written"
    );
    Ok(())
}

/// A meter that refuses the first chat and records the usage of the second.
#[derive(Debug, Default)]
struct Meter {
    refused: std::sync::atomic::AtomicBool,
    usage: std::sync::Mutex<Option<agents_llm::types::Usage>>,
}

impl agents_server::policy::ChatMeter for Meter {
    fn check(
        &self,
        _ctx: &agents_server::policy::ChatContext<'_>,
    ) -> Result<(), agents_server::http::ApiError> {
        if self.refused.swap(true, std::sync::atomic::Ordering::SeqCst) {
            return Ok(());
        }
        Err(agents_server::http::ApiError::new(
            agents_contracts::error_codes::ErrorCode::PermissionDenied,
        ))
    }

    fn record(
        &self,
        _ctx: &agents_server::policy::ChatContext<'_>,
        usage: agents_llm::types::Usage,
    ) {
        if let Ok(mut guard) = self.usage.lock() {
            *guard = Some(usage);
        }
    }
}

#[tokio::test]
async fn the_meter_may_refuse_a_chat_and_records_the_usage() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let meter = Arc::new(Meter::default());
    let Some((app, db)) = router_with(&stub, {
        let meter = Arc::clone(&meter);
        move |state| state.meter = meter
    })
    .await?
    else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;

    // The meter refuses the first chat: a 403, never a 402.
    let (status, _headers, text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;
    assert_eq!(status, 403);
    assert!(text.contains("\"code\":\"permission_denied\""), "{text}");

    // The second chat goes through, and the usage is recorded.
    let (status, _headers, _text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(body(&assistant_id)),
    )
    .await?;
    assert_eq!(status, 200);
    let recorded = meter
        .usage
        .lock()
        .ok()
        .and_then(|guard| *guard)
        .ok_or("the usage was not recorded")?;
    assert_eq!(recorded.total, 13);
    Ok(())
}

#[tokio::test]
async fn a_client_that_hangs_up_stops_the_model_call() -> R {
    use futures::StreamExt;

    let stub = Stub::start(Script::Hang("hello there".to_owned())).await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;

    let request = axum::http::Request::builder()
        .method("POST")
        .uri("/api/chat")
        .header("authorization", bearer(&user_id)?)
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_vec(&body(&assistant_id)).map_err(|error| error.to_string())?,
        ))
        .map_err(|error| error.to_string())?;
    let response = app
        .clone()
        .oneshot(request)
        .await
        .map_err(|error| error.to_string())?;
    assert_eq!(response.status().as_u16(), 200);

    // Read until the model has answered, then hang up.
    let mut stream = Box::pin(response.into_body().into_data_stream());
    let mut seen = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        seen.push_str(&String::from_utf8_lossy(&chunk));
        if seen.contains("text-delta") {
            break;
        }
    }
    assert!(seen.contains("text-delta"), "the model must have answered");
    drop(stream);

    // The upstream call is stopped: the stub sees the connection close.
    for _ in 0..100 {
        if stub.client_hung_up() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(
        stub.client_hung_up(),
        "the model call must stop when the client hangs up"
    );
    Ok(())
}

#[tokio::test]
async fn the_answer_is_written_to_the_session() -> R {
    let stub = Stub::start(Script::Text(vec!["the answer".to_owned()])).await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;
    let session =
        agents_store::sessions::create_session(&db, &user_id, None, &assistant_id, "New Chat")
            .await?;

    let mut request = body(&assistant_id);
    // The ids are fresh ones: the tests share a database, and a message id that already
    // lives in another session is a conflict.
    let assistant_message_id = new_id();
    if let Some(object) = request.as_object_mut() {
        object.insert("sessionId".to_owned(), json!(session.id));
        object.insert("assistantMessageId".to_owned(), json!(assistant_message_id));
        object.insert(
            "messages".to_owned(),
            json!([{"id": new_id(), "role": "user", "content": "hello"}]),
        );
    }
    let (status, _headers, _text) = send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&user_id)?),
        Some(request),
    )
    .await?;
    assert_eq!(status, 200);

    // The rows are written before the stream ends, so they are there when the answer is.
    let messages = agents_store::sessions::list_messages(&db, &user_id, &session.id).await?;
    let roles: Vec<&str> = messages.iter().map(|row| row.role.as_str()).collect();
    assert_eq!(roles, vec!["user", "assistant"]);
    let answer = messages
        .iter()
        .find(|row| row.role == "assistant")
        .ok_or("the answer is not stored")?;
    assert_eq!(answer.id, assistant_message_id);
    assert_eq!(answer.content, "the answer");
    Ok(())
}

#[tokio::test]
async fn sixteen_chats_at_once_lose_no_fact_of_the_profile() -> R {
    const CHATS: usize = 16;
    let stub = Stub::start(Script::SaveMessageThenText {
        text: vec!["saved".to_owned()],
    })
    .await?;
    let Some((app, db)) = router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;

    // Sixteen chats of the same user, at the same time. Each of them remembers what the user
    // said, under a label of its own, and each of them is counted by the drain: every chat
    // writes the profile twice, and all of them write the same row.
    let mut chats = Vec::new();
    for index in 0..CHATS {
        let auth = bearer(&user_id)?;
        let request = json!({
            "messages": [{
                "id": format!("m{index}"),
                "role": "user",
                "content": format!("chat {index}"),
            }],
            "assistantId": assistant_id,
        });
        let app = app.clone();
        chats.push(tokio::spawn(async move {
            send_raw(&app, "POST", "/api/chat", Some(&auth), Some(request)).await
        }));
    }
    for chat in chats {
        let (status, _headers, text) = chat.await??;
        assert_eq!(status, 200);
        assert!(text.contains("\"type\":\"text-delta\""));
    }

    // The profile holds every fact and every turn: each writer holds the row lock from its
    // read to its write.
    let profile = profile_of(&db, &user_id).await?;
    let facts = profile
        .get("facts")
        .and_then(Value::as_array)
        .ok_or("the profile has no facts")?;
    let mut predicates: Vec<String> = facts
        .iter()
        .filter_map(|fact| fact.get("predicate").and_then(Value::as_str))
        .map(str::to_owned)
        .collect();
    predicates.sort();
    let mut expected: Vec<String> = (0..CHATS).map(|index| format!("chat_{index}")).collect();
    expected.sort();
    assert_eq!(predicates, expected);
    assert_eq!(
        profile.get("totalConversations").and_then(Value::as_u64),
        Some(CHATS as u64),
        "every chat's drain must be counted"
    );
    Ok(())
}
