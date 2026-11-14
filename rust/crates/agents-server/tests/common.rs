//! Shared helpers for route tests: a router over the test database, seeded users and tokens.

use agents_server::auth::AuthConfig;
use agents_server::config::LlmSettings;
use agents_server::policy::{AllowAll, WizardModel};
use agents_server::{AppState, app};
use agents_store::{PgPool, new_id};
use axum::Router;
use axum::body::Body;
use axum::http::{Request, Response};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

pub const SECRET: &str = "route-test-secret-0123456789abcdef";

pub type R = Result<(), Box<dyn std::error::Error>>;

/// The router over `TEST_DATABASE_URL`, or `None` (skip) when it is unset outside CI.
pub async fn router() -> Result<Option<(Router, PgPool)>, Box<dyn std::error::Error>> {
    let Some(db) = pool().await? else {
        return Ok(None);
    };
    let app = router_over(
        &db,
        std::sync::Arc::new(AllowAll),
        std::sync::Arc::new(agents_server::policy::ConfiguredWizard::new(
            "stub-model",
            true,
        )),
        LlmSettings::default(),
    );
    Ok(Some((app, db)))
}

/// The test database, or `None` (skip) when it is unset outside CI.
pub async fn pool() -> Result<Option<PgPool>, Box<dyn std::error::Error>> {
    let url = match std::env::var("TEST_DATABASE_URL") {
        Ok(u) if !u.is_empty() => u,
        _ if std::env::var_os("CI").is_some() => {
            return Err("TEST_DATABASE_URL must be set in CI".into());
        }
        _ => {
            eprintln!("skipped: TEST_DATABASE_URL is not set");
            return Ok(None);
        }
    };
    Ok(Some(PgPool::connect(&url).await?))
}

/// The router over a pool, with the caller's policy, wizard model and model endpoint.
///
/// The wizard model and the endpoint are what the cloud edition brings; a test that needs
/// the wizard to talk to a stub server passes its base URL here.
pub fn router_over(
    db: &PgPool,
    policy: std::sync::Arc<dyn agents_server::policy::AssistantPolicy>,
    wizard: std::sync::Arc<dyn WizardModel>,
    llm: LlmSettings,
) -> Router {
    let state = AppState {
        db: db.clone(),
        auth: AuthConfig {
            secrets: vec![SECRET.to_owned()],
        },
        policy,
        wizard,
        llm,
    };
    app(state)
}

/// A user row; returns its id.
pub async fn user(db: &PgPool, suspended: bool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Agent" ("id","email","name","passwordHash","createdAt","updatedAt","suspendedAt")
           VALUES ($1, $1 || '@test.invalid', 'Test', 'x', now(), now(), CASE WHEN $2 THEN now() END)"#,
    )
    .bind(&id)
    .bind(suspended)
    .execute(db)
    .await?;
    Ok(id)
}

/// A mobile Bearer token for the user, as the Next.js app would issue it.
pub fn bearer(user_id: &str) -> Result<String, agents_auth::AuthError> {
    let now = chrono_now();
    agents_auth::mobile::sign_mobile_token(user_id, "t@test.invalid", None, SECRET, now)
        .map(|t| format!("Bearer {t}"))
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(0))
}

/// Sends one request; returns the status and the JSON body (`Value::Null` when empty).
pub async fn send(
    router: &Router,
    method: &str,
    uri: &str,
    auth: Option<&str>,
    body: Option<Value>,
) -> Result<(u16, Value), Box<dyn std::error::Error>> {
    send_with(router, method, uri, auth, body, &[]).await
}

/// Sends one request with extra headers; returns the status and the JSON body.
pub async fn send_with(
    router: &Router,
    method: &str,
    uri: &str,
    auth: Option<&str>,
    body: Option<Value>,
    headers: &[(&str, &str)],
) -> Result<(u16, Value), Box<dyn std::error::Error>> {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(a) = auth {
        req = req.header("authorization", a);
    }
    for (name, value) in headers {
        req = req.header(*name, *value);
    }
    let req = match body {
        Some(b) => req
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&b)?))?,
        None => req.body(Body::empty())?,
    };
    let res: Response<Body> = router.clone().oneshot(req).await?;
    let status = res.status().as_u16();
    let bytes = res.into_body().collect().await?.to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)?
    };
    Ok((status, json))
}

pub fn code(v: &Value) -> Option<&str> {
    v.pointer("/error/code").and_then(Value::as_str)
}
