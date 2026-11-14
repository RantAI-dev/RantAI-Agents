//! Password sign-in for the browser (`POST /api/auth/login`, sets the NextAuth session cookie),
//! sign-out (`POST /api/auth/logout`) and the mobile sign-in (`POST /api/mobile/login`, returns
//! the mobile token). Old: the credentials provider in `src/lib/auth.ts`, `src/lib/mobile-auth.ts`.
//!
//! - The answer never says whether the email exists: an unknown email, a wrong password and an
//!   account without a password are the same 401, and an unknown email still runs bcrypt against
//!   a dummy hash so the timing matches. bcrypt compares in constant time.
//! - What only the owner of the password may learn (suspended, password sign-in turned off) is
//!   said only after the password matched.
//! - Attempts are throttled per email and per address ([`crate::signin::throttle`]).

use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::{Json, Router, routing::post};
use serde::{Deserialize, Serialize};
use serde_json::json;

use agents_auth::session_issue::{NewSession, encode_session_token, session_cookie_name, uuid_v4};
use agents_contracts::error_codes::ErrorCode;
use agents_core::validation::FieldError;
use agents_store::audit::{self, AuditEntry};
use agents_store::users::LoginUser;
use agents_store::{orgs, users};

use crate::AppState;
use crate::http::ApiError;
use crate::http::client_ip::ClientIp;
use crate::http::json::Body;
use crate::signin::{self, cookies};

/// bcryptjs, cost 10, of a password nobody has: what an unknown email is checked against.
const DUMMY_HASH: &str = "$2b$10$9HTiK/7luq5DuMFnQzEb.u3EC.2Nrtz0a0UrotF/rkQyKG4wZR2aC";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/mobile/login", post(mobile_login))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LoginBody {
    email: Option<String>,
    password: Option<String>,
    callback_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserView {
    id: String,
    email: String,
    name: String,
    role: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    user: UserView,
    redirect_to: String,
}

#[derive(Serialize)]
struct MobileLoginResponse {
    token: String,
    user: UserView,
}

fn internal(what: &str, e: &dyn std::fmt::Display) -> ApiError {
    tracing::error!(error = %e, what, "password sign-in failed");
    ApiError::new(ErrorCode::Internal)
}

fn wrong_credentials() -> ApiError {
    ApiError::new(ErrorCode::Unauthenticated).message("The email or password is not correct.")
}

/// Both fields are present and not empty; every missing one is listed.
fn credentials(
    email: Option<String>,
    password: Option<String>,
) -> Result<(String, String), ApiError> {
    let email = email.map(|e| e.trim().to_owned()).filter(|e| !e.is_empty());
    let password = password.filter(|p| !p.is_empty());
    let mut errors = Vec::new();
    if email.is_none() {
        errors.push(FieldError::new("/email", "required", "Enter your email."));
    }
    if password.is_none() {
        errors.push(FieldError::new(
            "/password",
            "required",
            "Enter your password.",
        ));
    }
    match (email, password) {
        (Some(e), Some(p)) => Ok((e, p)),
        _ => Err(ApiError::from(errors)),
    }
}

/// The checks both sign-ins share. Returns the user once the password matched and the account
/// may sign in with it.
async fn check_password(
    state: &AppState,
    ip: ClientIp,
    email: &str,
    password: String,
) -> Result<LoginUser, ApiError> {
    let address = ip.key();
    let attempt = state
        .signin
        .throttle
        .begin(email, &address)
        .map_err(|seconds| ApiError::new(ErrorCode::RateLimited).retry_after(seconds))?;
    let user = users::for_login(&state.db, email)
        .await
        .map_err(|e| internal("lookup", &e))?;
    let hash = user
        .as_ref()
        .and_then(|u| u.password_hash.clone())
        .unwrap_or_else(|| DUMMY_HASH.to_owned());
    // bcrypt is slow on purpose: keep it off the async workers.
    let matched =
        tokio::task::spawn_blocking(move || bcrypt::verify(password, &hash).unwrap_or(false))
            .await
            .map_err(|e| internal("bcrypt", &e))?;
    let user = match user {
        Some(u) if matched && u.password_hash.is_some() => u,
        _ => return Err(wrong_credentials()),
    };
    if user.suspended {
        return Err(ApiError::new(ErrorCode::PermissionDenied)
            .message("This account is suspended. Contact an administrator."));
    }
    let allowed = orgs::password_login_allowed(&state.db, &user.id)
        .await
        .map_err(|e| internal("orgs", &e))?;
    if !allowed {
        return Err(ApiError::new(ErrorCode::PasswordLoginDisabled));
    }
    state.signin.throttle.succeeded(attempt);
    if let Err(e) = users::touch_last_active(&state.db, &user.id).await {
        tracing::warn!(error = %e, "lastActiveAt was not updated");
    }
    if let Ok(Some(m)) = orgs::default_membership(&state.db, &user.id).await {
        let ip_text = ip.text();
        let entry = AuditEntry {
            organization_id: &m.organization_id,
            user_id: Some(&user.id),
            action: "auth.login",
            resource: &format!("user:{}", user.id),
            detail: json!({ "method": "password" }),
            ip_address: ip_text.as_deref(),
            risk_level: "low",
        };
        if let Err(e) = audit::record_entry(&state.db, &entry).await {
            tracing::warn!(error = %e, "the login was not audited");
        }
    }
    Ok(user)
}

/// The session cookies for a user who just signed in, as `Set-Cookie` header values.
pub(crate) fn issue_session(
    state: &AppState,
    headers: &HeaderMap,
    user_id: &str,
    name: &str,
    email: &str,
    role: &str,
) -> Result<Vec<String>, ApiError> {
    let secret = state
        .auth
        .secrets
        .first()
        .ok_or_else(|| internal("session", &"no secret"))?;
    let secure = state.signin.secure_cookies(headers);
    let cookie_name = session_cookie_name(secure);
    let now = chrono::Utc::now().timestamp();
    let iv = signin::random_iv().map_err(|e| internal("random", &e))?;
    let jti = uuid_v4(signin::random::<16>().map_err(|e| internal("random", &e))?);
    let token = encode_session_token(
        &NewSession {
            user_id,
            name: Some(name),
            email: Some(email),
            role: Some(role),
        },
        secret,
        cookie_name,
        now,
        &iv,
        &jti,
    )
    .map_err(|e| internal("session", &e))?;
    Ok(cookies::session_cookies(cookie_name, &token, secure, now))
}

pub(crate) fn with_cookies(mut response: Response, set: &[String]) -> Response {
    for value in set {
        if let Ok(v) = HeaderValue::from_str(value) {
            response.headers_mut().append(header::SET_COOKIE, v);
        }
    }
    response
}

fn cross_site() -> ApiError {
    ApiError::new(ErrorCode::PermissionDenied).message("This request must come from this site.")
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    ip: ClientIp,
    Body(body): Body<LoginBody>,
) -> Result<Response, ApiError> {
    if !state.signin.same_origin(&headers) {
        return Err(cross_site());
    }
    let (email, password) = credentials(body.email, body.password)?;
    let user = check_password(&state, ip, &email, password).await?;
    let set = issue_session(
        &state,
        &headers,
        &user.id,
        &user.name,
        &user.email,
        &user.role,
    )?;
    let response = Json(LoginResponse {
        redirect_to: signin::safe_return_to(body.callback_url.as_deref()),
        user: UserView {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        },
    })
    .into_response();
    Ok(with_cookies(response, &set))
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    if !state.signin.same_origin(&headers) {
        return Err(cross_site());
    }
    let secure = state.signin.secure_cookies(&headers);
    let set = cookies::clear_session_cookies(&headers, secure);
    Ok(with_cookies(StatusCode::NO_CONTENT.into_response(), &set))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MobileLoginBody {
    email: Option<String>,
    password: Option<String>,
}

async fn mobile_login(
    State(state): State<AppState>,
    ip: ClientIp,
    Body(body): Body<MobileLoginBody>,
) -> Result<Json<MobileLoginResponse>, ApiError> {
    let (email, password) = credentials(body.email, body.password)?;
    let user = check_password(&state, ip, &email, password).await?;
    let secret = state
        .auth
        .secrets
        .first()
        .ok_or_else(|| internal("mobile", &"no secret"))?;
    let token = agents_auth::mobile::sign_mobile_token(
        &user.id,
        &user.email,
        Some(&user.role),
        secret,
        chrono::Utc::now().timestamp(),
    )
    .map_err(|e| internal("mobile", &e))?;
    Ok(Json(MobileLoginResponse {
        token,
        user: UserView {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        },
    }))
}
