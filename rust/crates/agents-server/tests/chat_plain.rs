//! `POST /api/chat`: the plain chat, against a scripted model server.
//!
//! Old: `src/app/api/chat/route.ts` and `runChat` in `src/features/chat-public/service.ts`.
//! The frames the client sees are the ones the `ai` package writes, so they are asserted
//! exactly.

#[path = "chat_plain/stub.rs"]
mod stub;

mod common;

use agents_store::PgPool;
use agents_store::new_id;
use axum::Router;
use axum::body::Body;
use axum::http::{Request, Response};
use common::{R, bearer, code, router_with_llm, send, user};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use stub::{Script, Stub};
use tower::ServiceExt;

/// Sends one request and returns the status, the headers and the body as text.
///
/// The chat answers with an event stream, which is not JSON.
async fn send_raw(
    router: &Router,
    method: &str,
    uri: &str,
    auth: Option<&str>,
    body: Option<Value>,
) -> Result<(u16, axum::http::HeaderMap, String), String> {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(a) = auth {
        req = req.header("authorization", a);
    }
    let req = match body {
        Some(b) => req
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_vec(&b).map_err(|error| error.to_string())?,
            ))
            .map_err(|error| error.to_string())?,
        None => req.body(Body::empty()).map_err(|error| error.to_string())?,
    };
    let res: Response<Body> = router
        .clone()
        .oneshot(req)
        .await
        .map_err(|error| error.to_string())?;
    let status = res.status().as_u16();
    let headers = res.headers().clone();
    let bytes = res
        .into_body()
        .collect()
        .await
        .map_err(|error| error.to_string())?
        .to_bytes();
    Ok((status, headers, String::from_utf8_lossy(&bytes).to_string()))
}

/// An assistant without a knowledge base, tools or a workflow; returns its id.
async fn assistant(db: &PgPool, organization_id: Option<&str>) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Assistant" ("id","name","systemPrompt","model","organizationId",
             "knowledgeBaseGroupIds","openingQuestions","tags","createdAt","updatedAt")
           VALUES ($1,'Budi Helper','You are Budi''s helper.','rantai/nano',$2,'{}','{}','{}',now(),now())"#,
    )
    .bind(&id)
    .bind(organization_id)
    .execute(db)
    .await?;
    Ok(id)
}

/// An organisation; returns its id.
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
async fn member(db: &PgPool, user_id: &str, org_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,'member',now())"#,
    )
    .bind(new_id())
    .bind(user_id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(())
}

/// The body of a plain chat.
fn body(assistant_id: &str) -> Value {
    json!({
        "messages": [{"id": "m1", "role": "user", "content": "hello"}],
        "assistantId": assistant_id,
    })
}

/// The frames of a stream, as their JSON values.
fn frames(body: &str) -> Vec<Value> {
    body.split("\n\n")
        .filter(|frame| !frame.trim().is_empty())
        .map(|frame| {
            let payload = frame.strip_prefix("data: ").unwrap_or(frame);
            serde_json::from_str(payload).unwrap_or(Value::Null)
        })
        .collect()
}

/// The type of every frame.
fn types(body: &str) -> Vec<String> {
    frames(body)
        .iter()
        .map(|frame| {
            frame
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned()
        })
        .collect()
}

#[tokio::test]
async fn a_plain_chat_streams_the_frames_the_sdk_writes() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned(), " world".to_owned()])).await?;
    let Some((app, db)) = router_with_llm(Some(&stub.base_url())).await? else {
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
    let Some((app, db)) = router_with_llm(Some(&stub.base_url())).await? else {
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
    let Some((app, db)) = router_with_llm(Some(&stub.base_url())).await? else {
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
    let request = stub.chat_request()?.expect("the chat request");
    let messages = request
        .get("messages")
        .and_then(Value::as_array)
        .expect("messages");
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
    let Some((app, db)) = router_with_llm(Some(&stub.base_url())).await? else {
        return Ok(());
    };

    let mine = user(&db, false).await?;
    let my_org = org(&db).await?;
    member(&db, &mine, &my_org).await?;
    let my_assistant = assistant(&db, Some(&my_org)).await?;

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
    let Some((app, db)) = router_with_llm(Some(&stub.base_url())).await? else {
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
    with_file["fileDocumentIds"] = json!(["doc_1"]);
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
        let Some((app, db)) = router_with_llm(Some(&stub.base_url())).await? else {
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
    let Some((app, db)) = router_with_llm(Some(&stub.base_url())).await? else {
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
async fn eight_chats_at_once_lose_no_fact_of_the_profile() -> R {
    let stub = Stub::start(Script::SaveMessageThenText {
        text: vec!["saved".to_owned()],
    })
    .await?;
    let Some((app, db)) = router_with_llm(Some(&stub.base_url())).await? else {
        return Ok(());
    };
    let user_id = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;

    // Eight chats of the same user, at the same time. Each of them remembers what the user
    // said, under a label of its own.
    let mut chats = Vec::new();
    for index in 0..8 {
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

    // The profile holds every fact: the writers that lost the race read the row again and
    // write their change on top of it.
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
    assert_eq!(
        predicates,
        vec![
            "chat_0".to_owned(),
            "chat_1".to_owned(),
            "chat_2".to_owned(),
            "chat_3".to_owned(),
            "chat_4".to_owned(),
            "chat_5".to_owned(),
            "chat_6".to_owned(),
            "chat_7".to_owned(),
        ]
    );
    Ok(())
}
