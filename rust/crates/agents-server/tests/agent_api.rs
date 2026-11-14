//! The agent API over HTTP: the dashboard's keys, and `POST /v1/chat/completions`
//! (`docs/design/identity-and-access.md` §3.6).
//!
//! The model is the scripted stub the chat tests use, so nothing here touches the network. The
//! key is minted through the dashboard route, as a client would, and every refusal is paired
//! with the request that does work.

#[path = "chat_plain/stub.rs"]
mod stub;

#[path = "chat_plain/helpers.rs"]
mod helpers;

#[path = "agent_rbac/support.rs"]
mod support;

#[path = "agent_api/http.rs"]
mod http;

#[allow(dead_code, reason = "shared test helpers, used piecemeal")]
mod common;

use std::net::SocketAddr;

use agents_auth::api_key::hash_agent_api_key;
use common::{R, code};
use http::{Answer, bearer as key_bearer, frames, send};
use serde_json::{Value, json};
use stub::{Script, Stub};
use support::{assistant, member_of, org};

/// The dashboard's `Authorization` header for a user: the mobile token the app issues.
fn auth(user_id: &str) -> Result<(&'static str, String), Box<dyn std::error::Error>> {
    Ok(http::authorization(&common::bearer(user_id)?))
}

/// Where a test's requests appear to come from when nothing else is said.
fn peer() -> Option<SocketAddr> {
    Some(SocketAddr::from(([10, 0, 0, 7], 4444)))
}

/// Mints a key through the dashboard route; returns the whole answer.
async fn mint(
    app: &axum::Router,
    auth: (&'static str, String),
    assistant_id: &str,
    extra: Value,
) -> Result<Answer, Box<dyn std::error::Error>> {
    let mut body = json!({
        "name": "Production backend",
        "assistantId": assistant_id,
        "scopes": ["chat", "chat:stream"],
    });
    if let (Some(target), Some(extra)) = (body.as_object_mut(), extra.as_object()) {
        for (key, value) in extra {
            target.insert(key.clone(), value.clone());
        }
    }
    send(
        app,
        "POST",
        "/api/dashboard/agent-api-keys",
        &[auth],
        Some(body),
        peer(),
    )
    .await
    .map_err(Into::into)
}

/// The body of a completion.
fn completion(stream: bool) -> Value {
    json!({
        "model": "ignored-by-the-agent",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": stream,
    })
}

/// One completion with the key in the `Authorization` header.
async fn chat(
    app: &axum::Router,
    key: &str,
    body: Value,
) -> Result<Answer, Box<dyn std::error::Error>> {
    send(
        app,
        "POST",
        "/v1/chat/completions",
        &[key_bearer(key)],
        Some(body),
        peer(),
    )
    .await
    .map_err(Into::into)
}

#[tokio::test]
async fn a_new_key_is_shown_once_and_only_its_hash_is_stored() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;

    let answer = mint(&app, auth(&admin)?, &assistant_id, json!({})).await?;
    assert_eq!(answer.status, 201, "{}", answer.text);
    let body = answer.json();
    let key = body
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    assert!(key.starts_with("rantai_sk_"), "{key}");
    assert_eq!(key.len(), "rantai_sk_".len() + 32, "{key}");
    assert_eq!(
        body.get("assistantId").and_then(Value::as_str),
        Some(assistant_id.as_str())
    );
    assert_eq!(body.get("enabled").and_then(Value::as_bool), Some(true));
    assert_eq!(
        body.pointer("/assistant/id").and_then(Value::as_str),
        Some(assistant_id.as_str()),
        "the create answer names the agent"
    );

    // The row keeps the hash and the mask, never the key.
    let id = body.get("id").and_then(Value::as_str).unwrap_or_default();
    let (stored_hash, stored_key): (Option<String>, String) =
        sqlx::query_as(r#"SELECT "keyHash","key" FROM "AgentApiKey" WHERE "id" = $1"#)
            .bind(id)
            .fetch_one(&db)
            .await?;
    assert_eq!(
        stored_hash.as_deref(),
        Some(hash_agent_api_key(&key).as_str())
    );
    assert_ne!(stored_key, key, "the plain key is not stored");
    assert!(stored_key.contains('…'), "{stored_key}");

    // The list shows the mask, not the key: the whole key was in the create answer only.
    let listed = send(
        &app,
        "GET",
        "/api/dashboard/agent-api-keys",
        &[auth(&admin)?],
        None,
        peer(),
    )
    .await?;
    assert_eq!(listed.status, 200, "{}", listed.text);
    let listed = listed.json();
    let first = listed
        .as_array()
        .and_then(|items| items.first())
        .cloned()
        .unwrap_or(Value::Null);
    let shown = first.get("key").and_then(Value::as_str).unwrap_or_default();
    assert_ne!(shown, key);
    assert!(shown.contains('…'), "{shown}");
    assert!(key.ends_with(&shown[shown.len() - 4..]), "{shown}");

    // The change left an audit row, in the same transaction.
    let action: Option<String> = sqlx::query_scalar(
        r#"SELECT "action" FROM "AuditLog" WHERE "resource" = $1 AND "organizationId" = $2"#,
    )
    .bind(format!("api_key:{id}"))
    .bind(&org_id)
    .fetch_optional(&db)
    .await?;
    assert_eq!(action.as_deref(), Some("api_key.create"));

    // And the key works: the plain key the create answer carried is the one that authenticates.
    let answer = chat(&app, &key, completion(false)).await?;
    assert_eq!(answer.status, 200, "{}", answer.text);
    Ok(())
}

#[tokio::test]
async fn a_member_cannot_manage_keys_and_an_admin_can() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let member = member_of(&db, &org_id, "member").await?;
    let assistant_id = assistant(&db, &org_id).await?;

    let refused = mint(&app, auth(&member)?, &assistant_id, json!({})).await?;
    assert_eq!(refused.status, 403, "{}", refused.text);
    assert_eq!(code(&refused.json()), Some("permission_denied"));

    let listed = send(
        &app,
        "GET",
        "/api/dashboard/agent-api-keys",
        &[auth(&member)?],
        None,
        peer(),
    )
    .await?;
    assert_eq!(listed.status, 403, "{}", listed.text);

    // Positive control: the same request from an admin is answered.
    let allowed = mint(&app, auth(&admin)?, &assistant_id, json!({})).await?;
    assert_eq!(allowed.status, 201, "{}", allowed.text);
    Ok(())
}

#[tokio::test]
async fn another_organisations_key_is_a_404() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let ours = org(&db).await?;
    let theirs = org(&db).await?;
    let our_admin = member_of(&db, &ours, "admin").await?;
    let their_admin = member_of(&db, &theirs, "admin").await?;
    let our_agent = assistant(&db, &ours).await?;
    let their_agent = assistant(&db, &theirs).await?;

    let their_key = mint(&app, auth(&their_admin)?, &their_agent, json!({})).await?;
    assert_eq!(their_key.status, 201, "{}", their_key.text);
    let their_id = their_key
        .json()
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    // Another tenant's key: 404, the same answer as a key that does not exist.
    let stolen = send(
        &app,
        "GET",
        &format!("/api/dashboard/agent-api-keys/{their_id}"),
        &[auth(&our_admin)?],
        None,
        peer(),
    )
    .await?;
    assert_eq!(stolen.status, 404, "{}", stolen.text);
    assert_eq!(code(&stolen.json()), Some("not_found"));

    // Nor may a key be minted for another tenant's agent.
    let foreign = mint(&app, auth(&our_admin)?, &their_agent, json!({})).await?;
    assert_eq!(foreign.status, 404, "{}", foreign.text);

    // Positive control: our own key, read by our own admin.
    let ours_key = mint(&app, auth(&our_admin)?, &our_agent, json!({})).await?;
    assert_eq!(ours_key.status, 201, "{}", ours_key.text);
    let our_id = ours_key
        .json()
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let read = send(
        &app,
        "GET",
        &format!("/api/dashboard/agent-api-keys/{our_id}"),
        &[auth(&our_admin)?],
        None,
        peer(),
    )
    .await?;
    assert_eq!(read.status, 200, "{}", read.text);

    // And the other tenant's admin cannot delete it either.
    let deleted = send(
        &app,
        "DELETE",
        &format!("/api/dashboard/agent-api-keys/{our_id}"),
        &[auth(&their_admin)?],
        None,
        peer(),
    )
    .await?;
    assert_eq!(deleted.status, 404, "{}", deleted.text);
    Ok(())
}

#[tokio::test]
async fn a_completion_is_framed_as_openai_without_a_stream() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned(), " world".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = mint(&app, auth(&admin)?, &assistant_id, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    let answer = chat(&app, &key, completion(false)).await?;
    assert_eq!(answer.status, 200, "{}", answer.text);
    assert_eq!(answer.header("content-type"), Some("application/json"));
    assert_eq!(answer.header("access-control-allow-origin"), Some("*"));

    let body = answer.json();
    assert_eq!(
        body.get("object").and_then(Value::as_str),
        Some("chat.completion")
    );
    assert_eq!(
        body.get("model").and_then(Value::as_str),
        Some("rantai/nano")
    );
    assert!(
        body.get("created").and_then(Value::as_i64).unwrap_or(0) > 0,
        "a timestamp"
    );
    assert_eq!(
        body.pointer("/choices/0/message/role")
            .and_then(Value::as_str),
        Some("assistant")
    );
    assert_eq!(
        body.pointer("/choices/0/message/content")
            .and_then(Value::as_str),
        Some("Hello world")
    );
    assert_eq!(
        body.pointer("/choices/0/finish_reason")
            .and_then(Value::as_str),
        Some("stop")
    );
    assert_eq!(
        body.pointer("/usage/total_tokens").and_then(Value::as_i64),
        Some(13),
        "the stub reports 11 + 2"
    );
    assert_eq!(
        body.get("sources").and_then(Value::as_array).map(Vec::len),
        Some(0),
        "sources is present and empty without retrieval"
    );
    assert!(body.get("error").is_none(), "{}", answer.text);

    // The key counted the call.
    let (count, used): (i32, Option<chrono::NaiveDateTime>) = sqlx::query_as(
        r#"SELECT "requestCount","lastUsedAt" FROM "AgentApiKey" WHERE "keyHash" = $1"#,
    )
    .bind(hash_agent_api_key(&key))
    .fetch_one(&db)
    .await?;
    assert_eq!(count, 1);
    assert!(used.is_some(), "lastUsedAt is written");
    Ok(())
}

#[tokio::test]
async fn a_completion_streams_the_old_chunks() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned(), " world".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = mint(&app, auth(&admin)?, &assistant_id, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    let answer = chat(&app, &key, completion(true)).await?;
    assert_eq!(answer.status, 200, "{}", answer.text);
    assert_eq!(answer.header("content-type"), Some("text/event-stream"));
    assert_eq!(answer.header("cache-control"), Some("no-cache"));

    let frames = frames(&answer.text);
    assert_eq!(frames.len(), 5, "{}", answer.text);
    assert_eq!(
        frames
            .first()
            .and_then(|f| f.get("object"))
            .and_then(Value::as_str),
        Some("chat.completion.chunk")
    );
    assert_eq!(
        frames
            .first()
            .and_then(|f| f.pointer("/choices/0/delta/content"))
            .and_then(Value::as_str),
        Some("Hello")
    );
    assert_eq!(
        frames
            .get(1)
            .and_then(|f| f.pointer("/choices/0/delta/content"))
            .and_then(Value::as_str),
        Some(" world")
    );
    assert_eq!(
        frames
            .get(2)
            .and_then(|f| f.pointer("/choices/0/finish_reason"))
            .and_then(Value::as_str),
        Some("stop")
    );
    assert_eq!(
        frames
            .get(2)
            .and_then(|f| f.get("sources"))
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(0)
    );
    assert_eq!(
        frames
            .get(3)
            .and_then(|f| f.get("choices"))
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(0),
        "the usage frame carries no choices"
    );
    assert_eq!(
        frames
            .get(3)
            .and_then(|f| f.pointer("/usage/total_tokens"))
            .and_then(Value::as_i64),
        Some(13)
    );
    assert_eq!(frames.last(), Some(&Value::String("[DONE]".to_owned())));
    Ok(())
}

#[tokio::test]
async fn a_disabled_an_expired_a_narrow_and_a_wrong_scope_key_are_refused() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let token = auth(&admin)?;

    // A key that works, so every refusal below is about the one property it names.
    let good = mint(&app, token.clone(), &assistant_id, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    assert_eq!(chat(&app, &good, completion(false)).await?.status, 200);

    // Expired on creation.
    let expired = mint(
        &app,
        token.clone(),
        &assistant_id,
        json!({"expiresAt": "2020-01-01T00:00:00Z"}),
    )
    .await?
    .json()
    .get("key")
    .and_then(Value::as_str)
    .unwrap_or_default()
    .to_owned();
    let refused = chat(&app, &expired, completion(false)).await?;
    assert_eq!(refused.status, 401, "{}", refused.text);
    assert_eq!(code(&refused.json()), Some("unauthenticated"));

    // A key with a scope that is not these two.
    let narrow = mint(
        &app,
        token.clone(),
        &assistant_id,
        json!({"scopes": ["other"]}),
    )
    .await?
    .json()
    .get("key")
    .and_then(Value::as_str)
    .unwrap_or_default()
    .to_owned();
    let refused = chat(&app, &narrow, completion(false)).await?;
    assert_eq!(refused.status, 403, "{}", refused.text);
    assert_eq!(code(&refused.json()), Some("permission_denied"));

    // `chat` alone is not `chat:stream`.
    let no_stream = mint(
        &app,
        token.clone(),
        &assistant_id,
        json!({"scopes": ["chat:stream"]}),
    )
    .await?
    .json()
    .get("key")
    .and_then(Value::as_str)
    .unwrap_or_default()
    .to_owned();
    assert_eq!(chat(&app, &no_stream, completion(false)).await?.status, 403);
    assert_eq!(chat(&app, &no_stream, completion(true)).await?.status, 200);

    // Disabled after the fact: the row is switched off, the key still hashes to it, and the
    // next call is refused.
    let disposable = mint(&app, token.clone(), &assistant_id, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    assert_eq!(
        chat(&app, &disposable, completion(false)).await?.status,
        200
    );
    let id: String = sqlx::query_scalar(r#"SELECT "id" FROM "AgentApiKey" WHERE "keyHash" = $1"#)
        .bind(hash_agent_api_key(&disposable))
        .fetch_one(&db)
        .await?;
    let off = send(
        &app,
        "PATCH",
        &format!("/api/dashboard/agent-api-keys/{id}"),
        std::slice::from_ref(&token),
        Some(json!({"enabled": false})),
        peer(),
    )
    .await?;
    assert_eq!(off.status, 200, "{}", off.text);
    let refused = chat(&app, &disposable, completion(false)).await?;
    assert_eq!(refused.status, 401, "{}", refused.text);
    Ok(())
}

#[tokio::test]
async fn an_ip_allowlist_refuses_an_address_it_does_not_name() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let token = auth(&admin)?;

    let allowed = mint(
        &app,
        token.clone(),
        &assistant_id,
        json!({"ipWhitelist": ["10.0.0.7"]}),
    )
    .await?
    .json()
    .get("key")
    .and_then(Value::as_str)
    .unwrap_or_default()
    .to_owned();

    // The named address gets in (positive control)…
    let answer = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &[key_bearer(&allowed)],
        Some(completion(false)),
        Some(SocketAddr::from(([10, 0, 0, 7], 5000))),
    )
    .await?;
    assert_eq!(answer.status, 200, "{}", answer.text);

    // …another one does not…
    let answer = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &[key_bearer(&allowed)],
        Some(completion(false)),
        Some(SocketAddr::from(([10, 0, 0, 8], 5000))),
    )
    .await?;
    assert_eq!(answer.status, 403, "{}", answer.text);
    assert_eq!(code(&answer.json()), Some("permission_denied"));

    // …and a request with no peer address at all is not guessed at.
    let answer = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &[key_bearer(&allowed)],
        Some(completion(false)),
        None,
    )
    .await?;
    assert_eq!(answer.status, 403, "{}", answer.text);

    // A key without an allowlist takes any address.
    let open = mint(&app, token.clone(), &assistant_id, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let answer = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &[key_bearer(&open)],
        Some(completion(false)),
        Some(SocketAddr::from(([10, 0, 0, 8], 5000))),
    )
    .await?;
    assert_eq!(answer.status, 200, "{}", answer.text);
    Ok(())
}

#[tokio::test]
async fn a_request_without_a_key_is_a_401() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = mint(&app, auth(&admin)?, &assistant_id, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    let answer = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &[],
        Some(completion(false)),
        peer(),
    )
    .await?;
    assert_eq!(answer.status, 401, "{}", answer.text);
    assert_eq!(code(&answer.json()), Some("unauthenticated"));

    let answer = send(
        &app,
        "POST",
        "/v1/chat/completions",
        &[key_bearer("rantai_sk_nope")],
        Some(completion(false)),
        peer(),
    )
    .await?;
    assert_eq!(answer.status, 401, "{}", answer.text);

    // Positive control: the key that is real.
    assert_eq!(chat(&app, &key, completion(false)).await?.status, 200);

    // A bare OPTIONS is the browser's pre-flight and needs no key.
    let answer = send(&app, "OPTIONS", "/v1/chat/completions", &[], None, peer()).await?;
    assert_eq!(answer.status, 204);
    assert_eq!(answer.header("access-control-allow-origin"), Some("*"));
    Ok(())
}

#[tokio::test]
async fn an_agent_that_needs_the_knowledge_base_is_a_409_and_a_plain_one_answers() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let token = auth(&admin)?;
    let plain = assistant(&db, &org_id).await?;

    // The same agent, with the knowledge base switched on.
    let kb = assistant(&db, &org_id).await?;
    sqlx::query(r#"UPDATE "Assistant" SET "useKnowledgeBase" = true WHERE "id" = $1"#)
        .bind(&kb)
        .execute(&db)
        .await?;

    let kb_key = mint(&app, token.clone(), &kb, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let refused = chat(&app, &kb_key, completion(false)).await?;
    assert_eq!(refused.status, 409, "{}", refused.text);
    assert_eq!(code(&refused.json()), Some("capability_not_ported"));

    let plain_key = mint(&app, token.clone(), &plain, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let answer = chat(&app, &plain_key, completion(false)).await?;
    assert_eq!(answer.status, 200, "{}", answer.text);

    // A request that names knowledge bases is refused even on an agent that has none.
    let mut asking = completion(false);
    if let Some(object) = asking.as_object_mut() {
        object.insert("knowledge_base_ids".to_owned(), json!(["kb_1"]));
    }
    let refused = chat(&app, &plain_key, asking).await?;
    assert_eq!(refused.status, 409, "{}", refused.text);
    Ok(())
}

#[tokio::test]
async fn an_agent_with_an_mcp_server_or_a_workflow_is_a_409() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let token = auth(&admin)?;

    // An MCP server bound to the agent.
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
    {
        let key = mint(&app, token.clone(), &with_mcp, json!({}))
            .await?
            .json()
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let refused = chat(&app, &key, completion(false)).await?;
        assert_eq!(refused.status, 409, "{}", refused.text);
    }

    // A workflow bound to the agent.
    let with_workflow = assistant(&db, &org_id).await?;
    let workflow = agents_store::new_id();
    sqlx::query(
        r#"INSERT INTO "Workflow" ("id","name","createdBy","organizationId","tags","createdAt","updatedAt")
           VALUES ($1,'t',$2,$3,'{}',now(),now())"#,
    )
    .bind(&workflow)
    .bind(&admin)
    .bind(&org_id)
    .execute(&db)
    .await?;
    sqlx::query(
        r#"INSERT INTO "AssistantWorkflow" ("id","assistantId","workflowId","enabled","createdAt")
           VALUES ($1,$2,$3,true,now())"#,
    )
    .bind(agents_store::new_id())
    .bind(&with_workflow)
    .bind(&workflow)
    .execute(&db)
    .await?;
    {
        let key = mint(&app, token.clone(), &with_workflow, json!({}))
            .await?
            .json()
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let refused = chat(&app, &key, completion(false)).await?;
        assert_eq!(refused.status, 409, "{}", refused.text);
    }

    // Positive control: an agent with neither answers.
    let plain = assistant(&db, &org_id).await?;
    let key = mint(&app, token.clone(), &plain, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    assert_eq!(chat(&app, &key, completion(false)).await?.status, 200);
    Ok(())
}

#[tokio::test]
async fn concurrent_calls_count_every_use() -> R {
    // The property is "this is atomic": eight calls at the same moment must leave eight uses.
    // Awaiting them in turn would pass with or without a read-then-write.
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = mint(&app, auth(&admin)?, &assistant_id, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    let calls = (0..8).map(|_| chat(&app, &key, completion(false)));
    for answer in futures::future::join_all(calls).await {
        assert_eq!(answer?.status, 200);
    }

    let (count, used): (i32, Option<chrono::NaiveDateTime>) = sqlx::query_as(
        r#"SELECT "requestCount","lastUsedAt" FROM "AgentApiKey" WHERE "keyHash" = $1"#,
    )
    .bind(hash_agent_api_key(&key))
    .fetch_one(&db)
    .await?;
    assert_eq!(count, 8, "every use is counted, none lost");
    assert!(used.is_some());
    Ok(())
}

#[tokio::test]
async fn a_malformed_completion_body_is_a_400_naming_every_bad_field() -> R {
    let stub = Stub::start(Script::Text(vec!["Hello".to_owned()])).await?;
    let Some((app, db)) = helpers::router_with(&stub, |_| {}).await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let assistant_id = assistant(&db, &org_id).await?;
    let key = mint(&app, auth(&admin)?, &assistant_id, json!({}))
        .await?
        .json()
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();

    let broken = json!({
        "messages": [],
        "temperature": 9.5,
        "max_tokens": 0,
    });
    let answer = chat(&app, &key, broken).await?;
    assert_eq!(answer.status, 400, "{}", answer.text);
    let body = answer.json();
    assert_eq!(code(&body), Some("invalid_request"));
    let fields: Vec<String> = body
        .pointer("/error/errors")
        .and_then(Value::as_array)
        .map(|errors| {
            errors
                .iter()
                .filter_map(|e| e.get("field").and_then(Value::as_str).map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();
    for expected in ["/messages", "/temperature", "/max_tokens"] {
        assert!(fields.iter().any(|f| f == expected), "{fields:?}");
    }

    // Positive control: the same conversation with the numbers in range.
    assert_eq!(chat(&app, &key, completion(false)).await?.status, 200);
    Ok(())
}
