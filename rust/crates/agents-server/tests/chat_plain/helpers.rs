//! The helpers of the chat tests: a request with a raw body, a router whose model is the
//! stub, seeded assistants and organisations, and the frames of a stream.
//!
//! `chat_plain.rs` and `chat_tools.rs` share it, and neither uses every part of it.
#![allow(
    dead_code,
    reason = "shared by two test crates that use different parts"
)]

use agents_store::PgPool;
use agents_store::new_id;
use axum::Router;
use axum::body::Body;
use axum::http::{Request, Response};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

use super::common;
use super::stub::Stub;

/// Sends one request and returns the status, the headers and the body as text.
///
/// The chat answers with an event stream, which is not JSON.
pub async fn send_raw(
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

/// The router over the test database, with the model served by the stub and the state the
/// caller sets up; `None` (skip) when there is no test database.
pub async fn router_with<F>(
    stub: &Stub,
    setup: F,
) -> Result<Option<(Router, PgPool)>, Box<dyn std::error::Error>>
where
    F: FnOnce(&mut agents_server::AppState),
{
    let Some(db) = common::pool().await? else {
        return Ok(None);
    };
    let mut state = agents_server::AppState::new(
        db.clone(),
        agents_server::auth::AuthConfig {
            secrets: vec![common::SECRET.to_owned()],
        },
    );
    state.llm = stub.llm();
    setup(&mut state);
    Ok(Some((agents_server::app(state), db)))
}

/// An assistant without a knowledge base, tools or a workflow; returns its id.
pub async fn assistant(db: &PgPool, organization_id: Option<&str>) -> Result<String, sqlx::Error> {
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
pub async fn org(db: &PgPool) -> Result<String, sqlx::Error> {
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
pub async fn member(db: &PgPool, user_id: &str, org_id: &str) -> Result<(), sqlx::Error> {
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
pub fn body(assistant_id: &str) -> Value {
    json!({
        "messages": [{"id": "m1", "role": "user", "content": "hello"}],
        "assistantId": assistant_id,
    })
}

/// The frames of a stream, as their JSON values.
pub fn frames(body: &str) -> Vec<Value> {
    body.split("\n\n")
        .filter(|frame| !frame.trim().is_empty())
        .map(|frame| {
            let payload = frame.strip_prefix("data: ").unwrap_or(frame);
            serde_json::from_str(payload).unwrap_or(Value::Null)
        })
        .collect()
}

/// The type of every frame.
pub fn types(body: &str) -> Vec<String> {
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
