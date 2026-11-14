//! The chat respects the grants: `POST /api/chat` needs `agents.use` on the assistant, and a
//! session the caller owns stays readable after the grant is gone
//! (`docs/design/identity-and-access.md` §3.3; differences row 80).
//!
//! The model is the scripted stub the other chat tests use, so nothing here touches the
//! network.

#[path = "chat_plain/stub.rs"]
mod stub;

#[path = "chat_plain/helpers.rs"]
mod helpers;

#[path = "agent_rbac/support.rs"]
mod support;

#[allow(dead_code, reason = "shared test helpers, used piecemeal")]
mod common;

use std::time::Duration;

use common::{R, bearer, send};
use serde_json::{Value, json};
use stub::{Script, Stub};
use support::{assistant, grant, member_of, org};

/// The refusal a call that was not approved gives the model.
const DENIED: &str = r#"{"performed":false,"approval":"denied","message":"The user declined this action. Do not retry it; tell the user it was not performed."}"#;

/// The body of a plain chat.
fn body(assistant_id: &str) -> Value {
    json!({
        "messages": [{"id": "m1", "role": "user", "content": "hello"}],
        "assistantId": assistant_id,
    })
}

#[tokio::test]
async fn a_chat_without_the_use_grant_is_a_403_and_with_it_streams() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned(), " there".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let id = assistant(&db, &org_id).await?;
    let auth = bearer(&member_user)?;

    // Without a grant: 403. The assistant is the caller's organisation's, so it exists.
    let (status, _headers, text) =
        helpers::send_raw(&app, "POST", "/api/chat", Some(&auth), Some(body(&id))).await?;
    assert_eq!(status, 403);
    assert!(text.contains("\"code\":\"permission_denied\""), "{text}");

    // Positive control: an admin may chat with it (the model is the stub).
    let (status, _headers, text) = helpers::send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&admin)?),
        Some(body(&id)),
    )
    .await?;
    assert_eq!(status, 200, "an admin chats with the same assistant");
    assert!(text.contains("\"type\":\"text-delta\""), "{text}");

    // With the grant the member's chat streams.
    grant(&db, &org_id, &id, "user", &member_user, "use").await?;
    let (status, _headers, text) =
        helpers::send_raw(&app, "POST", "/api/chat", Some(&auth), Some(body(&id))).await?;
    assert_eq!(status, 200, "a granted member chats");
    assert!(text.contains("\"delta\":\"Hello\""), "{text}");
    Ok(())
}

#[tokio::test]
async fn the_old_sessions_of_a_caller_who_lost_access_stay_readable() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let id = assistant(&db, &org_id).await?;
    let auth = bearer(&member_user)?;
    grant(&db, &org_id, &id, "user", &member_user, "use").await?;

    // A session of the member's own.
    let (status, session) = send(
        &app,
        "POST",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        Some(json!({ "assistantId": id, "title": "before" })),
    )
    .await?;
    assert_eq!(status, 200);
    let session_id = session
        .pointer("/id")
        .and_then(Value::as_str)
        .ok_or("no session id")?
        .to_owned();

    // The admin takes the grant away.
    let (status, _) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&bearer(&admin)?),
        Some(json!([])),
    )
    .await?;
    assert_eq!(status, 200);

    // Sending is refused ...
    let (status, _headers, text) =
        helpers::send_raw(&app, "POST", "/api/chat", Some(&auth), Some(body(&id))).await?;
    assert_eq!(status, 403);
    assert!(text.contains("\"code\":\"permission_denied\""), "{text}");

    // ... and the old session is still the owner's to read (and its messages).
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{session_id}"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "the owner still reads their old session");
    assert_eq!(body.pointer("/id"), Some(&json!(session_id.as_str())));
    let (status, _) = send(
        &app,
        "GET",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "the owner still lists their sessions");
    Ok(())
}

#[tokio::test]
async fn a_chat_with_another_organisations_assistant_is_a_404() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    let member_user = member_of(&db, &org_a, "member").await?;
    let theirs = assistant(&db, &org_b).await?;
    grant(&db, &org_b, &theirs, "org", &org_b, "use").await?;

    let (status, _headers, text) = helpers::send_raw(
        &app,
        "POST",
        "/api/chat",
        Some(&bearer(&member_user)?),
        Some(body(&theirs)),
    )
    .await?;
    assert_eq!(
        status, 404,
        "another organisation's assistant is a 404, not a 403"
    );
    assert!(text.contains("\"code\":\"not_found\""), "{text}");
    Ok(())
}

/// A `Tool` row and its binding to the assistant; returns the tool's id.
async fn bind_tool(
    db: &agents_store::PgPool,
    org_id: &str,
    assistant_id: &str,
) -> Result<String, sqlx::Error> {
    let tool_id = agents_store::new_id();
    sqlx::query(
        r#"INSERT INTO "Tool" ("id","name","displayName","description","category","parameters","tags",
             "isBuiltIn","enabled","userSelectable","organizationId","createdAt","updatedAt")
           VALUES ($1,'calculator','calculator','Evaluate mathematical expressions.','builtin','{}','{}',
             true,true,true,$2,now(),now())"#,
    )
    .bind(&tool_id)
    .bind(org_id)
    .execute(db)
    .await?;
    sqlx::query(
        r#"INSERT INTO "AssistantTool" ("id","assistantId","toolId","enabled","createdAt")
           VALUES ($1,$2,$3,true,now())"#,
    )
    .bind(agents_store::new_id())
    .bind(assistant_id)
    .bind(&tool_id)
    .execute(db)
    .await?;
    Ok(tool_id)
}

/// Waits until the chat has written its pending decision, and returns the tool call it is for.
async fn pending_call(
    db: &agents_store::PgPool,
    user_id: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    for _ in 0..400 {
        let call: Option<String> = sqlx::query_scalar(
            r#"SELECT "toolCallId" FROM "ChatToolApproval"
               WHERE "userId"=$1 AND "status"='pending' LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(db)
        .await?;
        if let Some(call) = call {
            return Ok(call);
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    Err("the chat never waited for a decision".into())
}

/// The output the client saw for the call.
fn output_of(text: &str, call_id: &str) -> Option<Value> {
    helpers::frames(text).into_iter().find_map(|frame| {
        (frame.get("type").and_then(Value::as_str) == Some("tool-output-available")
            && frame.get("toolCallId").and_then(Value::as_str) == Some(call_id))
        .then(|| frame.get("output").cloned())
        .flatten()
    })
}

/// How many times the tool ran, by the execution log.
async fn runs(db: &agents_store::PgPool, tool_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(r#"SELECT COUNT(*) FROM "ToolExecution" WHERE "toolId"=$1"#)
        .bind(tool_id)
        .fetch_one(db)
        .await
}

/// A chat that asks for approval runs the call only while the caller may use the agent.
///
/// The approval route cannot make the check itself (the row is keyed by tool call and user,
/// and the body names no assistant), so the stream repeats it when a decision arrives.
#[tokio::test]
async fn an_approved_call_does_not_run_for_a_caller_who_lost_the_grant() -> R {
    let stub = Stub::start(Script::ToolThenText {
        name: "calculator".to_owned(),
        arguments: r#"{"expression":"2 + 3 * 4"}"#.to_owned(),
        text: vec!["The answer is 14.".to_owned()],
    })
    .await?;
    // A short wait, polled often, so the test never sits out the 90 seconds.
    let Some((app, db)) = helpers::router_with(&stub, |state| {
        state.tool_approval = agents_server::config::ToolApprovalTiming {
            timeout: Duration::from_secs(5),
            poll: Duration::from_millis(25),
        };
    })
    .await?
    else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let id = assistant(&db, &org_id).await?;
    sqlx::query(r#"UPDATE "Assistant" SET "guardRails"=$2 WHERE "id"=$1"#)
        .bind(&id)
        .bind(sqlx::types::Json(json!({"toolApproval": "all"})))
        .execute(&db)
        .await?;
    let tool_id = bind_tool(&db, &org_id, &id).await?;
    grant(&db, &org_id, &id, "user", &member_user, "use").await?;
    let auth = bearer(&member_user)?;

    let app_for_chat = app.clone();
    let token = auth.clone();
    let first_id = id.clone();
    let chat = tokio::spawn(async move {
        helpers::send_raw(
            &app_for_chat,
            "POST",
            "/api/chat",
            Some(&token),
            Some(body(&first_id)),
        )
        .await
    });
    let first_call = pending_call(&db, &member_user).await?;

    // The grant goes while the user is deciding.
    sqlx::query(r#"DELETE FROM "AssistantGrant" WHERE "assistantId"=$1"#)
        .bind(&id)
        .execute(&db)
        .await?;
    let (status, _) = send(
        &app,
        "POST",
        "/api/chat/tool-approval",
        Some(&auth),
        Some(json!({"toolCallId": first_call, "approved": true})),
    )
    .await?;
    assert_eq!(status, 200);

    let (status, _headers, text) = chat.await??;
    assert_eq!(status, 200, "{text}");
    let expected: Value = serde_json::from_str(DENIED)?;
    assert_eq!(
        output_of(&text, &first_call),
        Some(expected),
        "the call was refused, not run"
    );
    assert_eq!(runs(&db, &tool_id).await?, 0, "the tool never ran");

    // Positive control: with the grant back, the same approved call runs.
    grant(&db, &org_id, &id, "user", &member_user, "use").await?;
    let app_for_chat = app.clone();
    let token = auth.clone();
    let chat = tokio::spawn(async move {
        helpers::send_raw(
            &app_for_chat,
            "POST",
            "/api/chat",
            Some(&token),
            Some(body(&id)),
        )
        .await
    });
    let second_call = pending_call(&db, &member_user).await?;
    let (status, _) = send(
        &app,
        "POST",
        "/api/chat/tool-approval",
        Some(&auth),
        Some(json!({"toolCallId": second_call, "approved": true})),
    )
    .await?;
    assert_eq!(status, 200);
    let (status, _headers, text) = chat.await??;
    assert_eq!(status, 200, "{text}");
    assert_eq!(
        output_of(&text, &second_call).and_then(|o| o.get("result").cloned()),
        Some(json!(14)),
        "the granted caller's call ran"
    );
    assert_eq!(runs(&db, &tool_id).await?, 1, "the tool ran once");
    Ok(())
}
