//! Shared by the sign-in tests: a router with sign-in configured, seeded rows, raw responses with
//! their headers, and a stub OIDC provider (discovery, JWKS, token endpoint) that signs RS256
//! with the throwaway test key in `agents-auth/tests/fixtures/`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use agents_server::auth::AuthConfig;
use agents_server::signin::SignIn;
use agents_server::sso::client::OidcClient;
use agents_server::{AppState, app};
use agents_store::{PgPool, new_id};
use axum::Router;
use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, Response, header};
use axum::routing::{get, post};
use http_body_util::BodyExt;
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde_json::{Value, json};
use sha2::Digest;
use tower::ServiceExt;

pub const SECRET: &str = "signin-test-secret-0123456789abcdef";
pub const PUBLIC_URL: &str = "http://app.test";
pub const KEY: &str = include_str!("../../../agents-auth/tests/fixtures/oidc-test-rsa.pem");
pub const KEY_N: &str = include_str!("../../../agents-auth/tests/fixtures/oidc-test-rsa.n");
pub const OTHER_KEY: &str = include_str!("../../../agents-auth/tests/fixtures/oidc-other-rsa.pem");
pub const OTHER_KEY_N: &str = include_str!("../../../agents-auth/tests/fixtures/oidc-other-rsa.n");
/// bcryptjs, cost 4, of "correct horse".
pub const PASSWORD_HASH: &str = "$2b$04$NHPOUEVHFoloeN1GOGKFW.A5q2MriVrn.aXoPKJlJomt9UcHOSan.";
pub const PASSWORD: &str = "correct horse";
pub const CLIENT_ID: &str = "rantai-test";

pub type R = Result<(), Box<dyn std::error::Error>>;
pub type Res<T> = Result<T, Box<dyn std::error::Error>>;

/// The test database, or `None` (skip) when it is unset outside CI.
pub async fn pool() -> Res<Option<PgPool>> {
    match std::env::var("TEST_DATABASE_URL") {
        Ok(u) if !u.is_empty() => Ok(Some(PgPool::connect(&u).await?)),
        _ if std::env::var_os("CI").is_some() => Err("TEST_DATABASE_URL must be set in CI".into()),
        _ => {
            eprintln!("skipped: TEST_DATABASE_URL is not set");
            Ok(None)
        }
    }
}

/// The router with sign-in configured for `PUBLIC_URL` (or `https://app.test` when `secure`).
pub fn router(db: &PgPool, secure: bool) -> Router {
    router_with_env(db, secure, None)
}

/// The same, with a provider from the environment.
pub fn router_with_env(
    db: &PgPool,
    secure: bool,
    env_provider: Option<agents_server::sso::env::EnvProvider>,
) -> Router {
    let signin = SignIn {
        env_provider,
        public_url: Some(
            if secure {
                "https://app.test"
            } else {
                PUBLIC_URL
            }
            .to_owned(),
        ),
        credential_key: agents_auth::credential::CredentialKey::parse(
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        )
        .ok(),
        oidc: OidcClient::with_options(true, std::time::Duration::ZERO),
        ..SignIn::default()
    };
    let state = AppState {
        signin: Arc::new(signin),
        ..AppState::new(
            db.clone(),
            AuthConfig {
                secrets: vec![SECRET.to_owned()],
            },
        )
    };
    app(state)
}

/// A response with what the sign-in tests look at.
#[derive(Debug)]
pub struct Reply {
    pub status: u16,
    pub location: Option<String>,
    pub set_cookies: Vec<String>,
    pub body: Value,
    pub retry_after: Option<String>,
}

impl Reply {
    /// `name=value` of the first `Set-Cookie` for `name` with a value.
    pub fn cookie(&self, name: &str) -> Option<String> {
        self.set_cookies.iter().find_map(|c| {
            let pair = c.split(';').next()?;
            let (n, v) = pair.split_once('=')?;
            (n == name && !v.is_empty()).then(|| pair.to_owned())
        })
    }

    pub fn code(&self) -> Option<&str> {
        self.body.pointer("/error/code").and_then(Value::as_str)
    }
}

pub async fn call(
    router: &Router,
    method: &str,
    uri: &str,
    headers: &[(&str, &str)],
    body: Option<Value>,
) -> Res<Reply> {
    let mut req = Request::builder().method(method).uri(uri);
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let req = match body {
        Some(b) => req
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&b)?))?,
        None => req.body(Body::empty())?,
    };
    let res: Response<Body> = router.clone().oneshot(req).await?;
    let status = res.status().as_u16();
    let location = res
        .headers()
        .get(header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let retry_after = res
        .headers()
        .get(header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let set_cookies = res
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok().map(str::to_owned))
        .collect();
    let bytes = res.into_body().collect().await?.to_bytes();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    Ok(Reply {
        status,
        location,
        set_cookies,
        body,
        retry_after,
    })
}

/// An organisation; returns its id.
pub async fn org(db: &PgPool, password_login: bool) -> Res<String> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Organization" ("id","name","slug","passwordLoginEnabled","createdAt","updatedAt")
           VALUES ($1,'Signin test',$1,$2,now(),now())"#,
    )
    .bind(&id)
    .bind(password_login)
    .execute(db)
    .await?;
    Ok(id)
}

/// A user with `email` and the test password (or none); returns its id.
pub async fn user_with(
    db: &PgPool,
    email: &str,
    password: bool,
    platform_admin: bool,
) -> Res<String> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Agent" ("id","email","name","passwordHash","role","createdAt","updatedAt")
           VALUES ($1,$2,'Signin User',$3,$4::"Role",now(),now())"#,
    )
    .bind(&id)
    .bind(email)
    .bind(password.then_some(PASSWORD_HASH))
    .bind(if platform_admin { "ADMIN" } else { "USER" })
    .execute(db)
    .await?;
    Ok(id)
}

pub async fn member(db: &PgPool, org: &str, user: &str, role: &str) -> R {
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@member.test',$3,$4,now())"#,
    )
    .bind(new_id())
    .bind(user)
    .bind(org)
    .bind(role)
    .execute(db)
    .await?;
    Ok(())
}

/// A unique email domain, so tests sharing the database never claim the same one.
pub fn domain() -> String {
    format!("d{}.test", new_id())
}

/// The session cookie (`name=value`) a mobile-free test signs in with.
pub fn session_cookie(reply: &Reply, secure: bool) -> Option<String> {
    reply.cookie(if secure {
        "__Secure-authjs.session-token"
    } else {
        "authjs.session-token"
    })
}

/// How the stub signs the next ID token.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Signing {
    Good,
    OtherKey,
    AlgNone,
}

#[derive(Debug, Clone)]
struct Grant {
    claims: Value,
    challenge: String,
    signing: Signing,
}

#[derive(Default)]
struct StubState {
    issuer: String,
    /// The `kid` → modulus of the published keys.
    keys: Vec<(String, String)>,
    /// The key and kid the stub signs with.
    signer: (String, String),
    grants: HashMap<String, Grant>,
    token_calls: usize,
}

/// A local OIDC provider. The test registers what the token endpoint returns for a code.
#[derive(Clone)]
pub struct StubIdp {
    state: Arc<Mutex<StubState>>,
    pub issuer: String,
}

fn lock(s: &Mutex<StubState>) -> std::sync::MutexGuard<'_, StubState> {
    s.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl StubIdp {
    pub async fn start() -> Res<Self> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let issuer = format!("http://{}/realms/acme", listener.local_addr()?);
        let state = Arc::new(Mutex::new(StubState {
            issuer: issuer.clone(),
            keys: vec![("k1".into(), KEY_N.trim().into())],
            signer: (KEY.into(), "k1".into()),
            ..StubState::default()
        }));
        let app = Router::new()
            .route(
                "/realms/acme/.well-known/openid-configuration",
                get(discovery),
            )
            .route("/realms/acme/jwks", get(jwks))
            .route("/realms/acme/token", post(token))
            .with_state(state.clone());
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        Ok(Self { state, issuer })
    }

    /// The token endpoint answers `code` with these claims, if the verifier matches `challenge`.
    pub fn grant(&self, code: &str, claims: Value, challenge: &str, signing: Signing) {
        lock(&self.state).grants.insert(
            code.to_owned(),
            Grant {
                claims,
                challenge: challenge.to_owned(),
                signing,
            },
        );
    }

    /// Rotates to the other key: published under a new kid, used for signing from now on.
    pub fn rotate(&self) {
        let mut s = lock(&self.state);
        s.keys = vec![("k2".into(), OTHER_KEY_N.trim().into())];
        s.signer = (OTHER_KEY.into(), "k2".into());
    }

    pub fn token_calls(&self) -> usize {
        lock(&self.state).token_calls
    }

    /// Standard claims for a sign-in, valid now.
    pub fn claims(&self, sub: &str, email: &str, nonce: &str) -> Value {
        let now = chrono::Utc::now().timestamp();
        json!({
            "iss": self.issuer, "aud": CLIENT_ID, "sub": sub, "nonce": nonce,
            "iat": now, "exp": now + 300, "email": email, "email_verified": true,
            "name": "Sso User"
        })
    }
}

async fn discovery(State(s): State<Arc<Mutex<StubState>>>) -> axum::Json<Value> {
    let issuer = lock(&s).issuer.clone();
    axum::Json(json!({
        "issuer": issuer,
        "authorization_endpoint": format!("{issuer}/auth"),
        "token_endpoint": format!("{issuer}/token"),
        "jwks_uri": format!("{issuer}/jwks"),
    }))
}

async fn jwks(State(s): State<Arc<Mutex<StubState>>>) -> axum::Json<Value> {
    let keys: Vec<Value> = lock(&s)
        .keys
        .iter()
        .map(|(kid, n)| json!({ "kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256", "n": n, "e": "AQAB" }))
        .collect();
    axum::Json(json!({ "keys": keys }))
}

async fn token(
    State(s): State<Arc<Mutex<StubState>>>,
    body: String,
) -> Result<axum::Json<Value>, axum::http::StatusCode> {
    let bad = axum::http::StatusCode::BAD_REQUEST;
    let form: HashMap<String, String> = reqwest::Url::parse(&format!("http://form/?{body}"))
        .map_err(|_| bad)?
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    let (grant, signer) = {
        let mut st = lock(&s);
        st.token_calls += 1;
        // Codes may be reused here on purpose: the replay guard under test is ours, not the IdP's.
        let grant = st
            .grants
            .get(form.get("code").ok_or(bad)?)
            .cloned()
            .ok_or(bad)?;
        (grant, st.signer.clone())
    };
    if form.get("client_id").map(String::as_str) != Some(CLIENT_ID)
        || form.get("grant_type").map(String::as_str) != Some("authorization_code")
    {
        return Err(bad);
    }
    let verifier = form.get("code_verifier").ok_or(bad)?;
    let challenge = agents_auth::base64url::encode(&sha2::Sha256::digest(verifier.as_bytes()));
    if challenge != grant.challenge {
        return Err(bad);
    }
    let id_token = match grant.signing {
        Signing::AlgNone => {
            let h = agents_auth::base64url::encode(br#"{"alg":"none","kid":"k1"}"#);
            let p = agents_auth::base64url::encode(grant.claims.to_string().as_bytes());
            format!("{h}.{p}.")
        }
        Signing::Good | Signing::OtherKey => {
            let pem = if grant.signing == Signing::OtherKey {
                if signer.0 == KEY { OTHER_KEY } else { KEY }.to_owned()
            } else {
                signer.0
            };
            let mut header = Header::new(Algorithm::RS256);
            header.kid = Some(signer.1);
            let key = EncodingKey::from_rsa_pem(pem.as_bytes()).map_err(|_| bad)?;
            jsonwebtoken::encode(&header, &grant.claims, &key).map_err(|_| bad)?
        }
    };
    Ok(axum::Json(
        json!({ "id_token": id_token, "access_token": "at", "token_type": "Bearer" }),
    ))
}

/// What `start` handed the browser.
pub struct Started {
    pub cookie: String,
    pub state: String,
    pub nonce: String,
    pub challenge: String,
    pub redirect_uri: String,
}

/// `GET /api/auth/sso/{id}/start`, read the way a browser would follow it.
pub async fn start(router: &Router, provider_id: &str) -> Res<Started> {
    let reply = call(
        router,
        "GET",
        &format!("/api/auth/sso/{provider_id}/start"),
        &[],
        None,
    )
    .await?;
    if reply.status != 302 {
        return Err(format!("start answered {reply:?}").into());
    }
    let location = reqwest::Url::parse(reply.location.as_deref().ok_or("no location")?)?;
    let param = |k: &str| {
        location
            .query_pairs()
            .find(|(n, _)| n == k)
            .map(|(_, v)| v.into_owned())
            .ok_or_else(|| format!("no {k} in {location}"))
    };
    if param("code_challenge_method")? != "S256" {
        return Err("PKCE is not S256".into());
    }
    let cookie = reply.cookie("rantai.sso-flow").ok_or("no flow cookie")?;
    Ok(Started {
        cookie,
        state: param("state")?,
        nonce: param("nonce")?,
        challenge: param("code_challenge")?,
        redirect_uri: param("redirect_uri")?,
    })
}

/// `GET /api/auth/sso/{id}/callback` with the flow cookie.
pub async fn callback(
    router: &Router,
    provider_id: &str,
    code: &str,
    state: &str,
    cookie: &str,
) -> Res<Reply> {
    call(
        router,
        "GET",
        &format!("/api/auth/sso/{provider_id}/callback?code={code}&state={state}"),
        &[("cookie", cookie)],
        None,
    )
    .await
}

/// A Keycloak-preset provider of `org` at the stub.
pub async fn provider(
    db: &PgPool,
    org: &str,
    stub: &StubIdp,
    domains: &[String],
    jit: bool,
    extra: Value,
) -> Res<String> {
    let mut config = json!({ "preset": "keycloak", "issuer": stub.issuer, "clientId": CLIENT_ID });
    if let (Some(c), Some(e)) = (config.as_object_mut(), extra.as_object()) {
        for (k, v) in e {
            c.insert(k.clone(), v.clone());
        }
    }
    let row = agents_store::identity::create(
        db,
        org,
        None,
        &agents_store::identity::ProviderWrite {
            kind: "oidc",
            name: "Stub IdP",
            enabled: true,
            config: &config,
            email_domains: domains,
            jit_provisioning: jit,
            default_role: "member",
        },
    )
    .await
    .map_err(|e| format!("{e:?}"))?;
    Ok(row.id)
}

/// Runs the whole flow: start, the provider's answer, the callback.
pub async fn sign_in(
    router: &Router,
    stub: &StubIdp,
    provider_id: &str,
    claims: impl FnOnce(&str) -> Value,
    signing: Signing,
) -> Res<Reply> {
    let started = start(router, provider_id).await?;
    let code = new_id();
    stub.grant(&code, claims(&started.nonce), &started.challenge, signing);
    callback(router, provider_id, &code, &started.state, &started.cookie).await
}
