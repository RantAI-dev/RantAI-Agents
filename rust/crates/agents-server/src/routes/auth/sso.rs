//! OIDC sign-in: discovery by email, the start of the authorisation-code flow, and the callback.
//!
//! - `GET /api/auth/sso/discover?email=` → the provider for the email's domain, or password.
//! - `GET /api/auth/sso/{providerId}/start` → 302 to the provider, with PKCE (`S256`), `state`
//!   and `nonce`; the flow is sealed into a short-lived cookie, never kept in server memory.
//! - `GET /api/auth/sso/{providerId}/callback` → checks the flow, trades the code, verifies the
//!   ID token, signs the user in (linking and provisioning in `agents_store::sso_login`) and 303s
//!   to where the user was going, with the NextAuth session cookie.
//!
//! The callback is a browser navigation, so a failure is a 303 to `/login?error=<code>` (the
//! sign-in page NextAuth already uses), with the code from `.agents/error-codes.tsv`; the reason
//! is logged, never shown.

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::{Json, Router, routing::get};
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;

use agents_auth::oidc::{self, FLOW_TTL_SECONDS, FlowState, id_token::Expected};
use agents_contracts::error_codes::ErrorCode;
use agents_core::validation::FieldError;
use agents_store::identity;
use agents_store::sso_login::{self, SsoLogin, SsoOutcome};

use super::password::{issue_session, with_cookies};
use crate::AppState;
use crate::http::ApiError;
use crate::signin::{self, cookies};
use crate::sso::{self, Provider, client::CodeExchange};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/sso/discover", get(discover))
        .route("/api/auth/sso/{provider_id}/start", get(start))
        .route("/api/auth/sso/{provider_id}/callback", get(callback))
}

/// Where the browser registers the provider's redirect: shown to admins (`callbackUrl`).
#[must_use]
pub fn callback_url(origin: &str, provider_id: &str) -> String {
    format!("{origin}/api/auth/sso/{provider_id}/callback")
}

#[derive(Deserialize)]
struct DiscoverQuery {
    email: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoverResponse {
    /// `sso` or `password`.
    method: &'static str,
    provider_id: Option<String>,
    provider_name: Option<String>,
    start_url: Option<String>,
}

async fn discover(
    State(state): State<AppState>,
    Query(q): Query<DiscoverQuery>,
) -> Result<Json<DiscoverResponse>, ApiError> {
    let email = q.email.unwrap_or_default();
    let email = email.trim();
    if !email.contains('@') || email.len() > 320 {
        return Err(ApiError::from(vec![FieldError::new(
            "email",
            "invalid",
            "Enter an email address.",
        )]));
    }
    Ok(Json(match sso::for_email(&state, email).await? {
        Some(p) => DiscoverResponse {
            method: "sso",
            start_url: Some(format!("/api/auth/sso/{}/start", p.id)),
            provider_id: Some(p.id),
            provider_name: Some(p.name),
        },
        None => DiscoverResponse {
            method: "password",
            provider_id: None,
            provider_name: None,
            start_url: None,
        },
    }))
}

fn upstream(provider_id: &str, e: &dyn std::fmt::Display) -> ApiError {
    tracing::warn!(error = %e, provider_id, "identity provider call failed");
    ApiError::new(ErrorCode::UpstreamFailed)
}

fn internal(e: &dyn std::fmt::Display) -> ApiError {
    tracing::error!(error = %e, "sso failed");
    ApiError::new(ErrorCode::Internal)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartQuery {
    callback_url: Option<String>,
}

async fn start(
    State(state): State<AppState>,
    Path(provider_id): Path<String>,
    Query(q): Query<StartQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let provider = sso::resolve(&state, &provider_id)
        .await?
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;
    let issuer = provider
        .config
        .issuer()
        .map_err(|e| upstream(&provider.id, &e))?;
    let discovery_url = provider
        .config
        .discovery_url()
        .map_err(|e| upstream(&provider.id, &e))?;
    let doc = state
        .signin
        .oidc_for(&provider.id)
        .discover(&discovery_url, &issuer)
        .await
        .map_err(|e| upstream(&provider.id, &e))?;
    let started_at = identity::db_now(&state.db)
        .await
        .map_err(|e| internal(&e))?;
    let token = || signin::random::<32>().map(|b| oidc::random_token(&b));
    let flow = FlowState {
        provider_id: provider.id.clone(),
        state: token().map_err(|e| internal(&e))?,
        nonce: token().map_err(|e| internal(&e))?,
        verifier: token().map_err(|e| internal(&e))?,
        return_to: signin::safe_return_to(q.callback_url.as_deref()),
        started_at_ms: started_at.and_utc().timestamp_millis(),
        expires_at: chrono::Utc::now().timestamp() + FLOW_TTL_SECONDS,
    };
    let secret = state
        .auth
        .secrets
        .first()
        .ok_or_else(|| internal(&"no secret"))?;
    let sealed = oidc::seal_flow(
        &flow,
        secret,
        &signin::random_iv().map_err(|e| internal(&e))?,
    )
    .map_err(|e| internal(&e))?;
    let origin = state.signin.origin(&headers);
    let mut url =
        reqwest::Url::parse(&doc.authorization_endpoint).map_err(|e| upstream(&provider.id, &e))?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("response_type", "code")
            .append_pair("client_id", &provider.config.client_id)
            .append_pair("redirect_uri", &callback_url(&origin, &provider.id))
            .append_pair("scope", &provider.config.scope())
            .append_pair("state", &flow.state)
            .append_pair("nonce", &flow.nonce)
            .append_pair("code_challenge", &oidc::pkce_challenge(&flow.verifier))
            .append_pair("code_challenge_method", "S256");
        for (k, v) in provider.config.extra_auth_params() {
            query.append_pair(k, &v);
        }
    }
    let secure = state.signin.secure_cookies(&headers);
    let mut response = StatusCode::FOUND.into_response();
    if let Ok(location) = HeaderValue::from_str(url.as_str()) {
        response.headers_mut().insert(header::LOCATION, location);
    }
    Ok(with_cookies(
        response,
        &[cookies::flow_cookie(&sealed, secure, FLOW_TTL_SECONDS)],
    ))
}

#[derive(Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

/// A failed callback: the reason for the log, the code for the login page.
struct Refusal {
    code: ErrorCode,
    reason: String,
}

fn refuse(code: ErrorCode, reason: impl Into<String>) -> Refusal {
    Refusal {
        code,
        reason: reason.into(),
    }
}

fn sso_failed(reason: impl Into<String>) -> Refusal {
    refuse(ErrorCode::SsoFailed, reason)
}

fn see_other(location: &str, set: &[String]) -> Response {
    let mut response = StatusCode::SEE_OTHER.into_response();
    if let Ok(v) = HeaderValue::from_str(location) {
        response.headers_mut().insert(header::LOCATION, v);
    }
    with_cookies(response, set)
}

async fn callback(
    State(state): State<AppState>,
    Path(provider_id): Path<String>,
    Query(q): Query<CallbackQuery>,
    headers: HeaderMap,
) -> Response {
    let origin = state.signin.origin(&headers);
    let secure = state.signin.secure_cookies(&headers);
    let clear_flow = cookies::clear_flow_cookie(secure);
    match finish(&state, &provider_id, q, &headers).await {
        Ok((return_to, mut set)) => {
            set.push(clear_flow);
            see_other(&format!("{origin}{return_to}"), &set)
        }
        Err(refusal) => {
            tracing::info!(
                provider_id,
                code = refusal.code.as_str(),
                reason = %refusal.reason,
                "sso sign-in refused"
            );
            see_other(
                &format!("{origin}/login?error={}", refusal.code.as_str()),
                &[clear_flow],
            )
        }
    }
}

async fn finish(
    state: &AppState,
    provider_id: &str,
    q: CallbackQuery,
    headers: &HeaderMap,
) -> Result<(String, Vec<String>), Refusal> {
    let secure = state.signin.secure_cookies(headers);
    let sealed = cookies::cookie(headers, cookies::flow_cookie_name(secure))
        .ok_or_else(|| sso_failed("no flow cookie"))?;
    let secrets: Vec<&str> = state.auth.secrets.iter().map(String::as_str).collect();
    let now = chrono::Utc::now().timestamp();
    let flow =
        oidc::open_flow(&sealed, &secrets, now).map_err(|e| sso_failed(format!("flow: {e}")))?;
    if flow.provider_id != provider_id {
        return Err(sso_failed("the flow is for another provider"));
    }
    let sent_state = q.state.unwrap_or_default();
    if sent_state
        .as_bytes()
        .ct_eq(flow.state.as_bytes())
        .unwrap_u8()
        != 1
    {
        return Err(sso_failed("state does not match"));
    }
    if let Some(error) = q.error {
        return Err(sso_failed(format!("the provider answered {error}")));
    }
    let code = q
        .code
        .filter(|c| !c.is_empty())
        .ok_or_else(|| sso_failed("no code"))?;
    let provider = sso::resolve(state, provider_id)
        .await
        .map_err(|_| sso_failed("provider lookup failed"))?
        .ok_or_else(|| sso_failed("the provider is gone or disabled"))?;
    let claims = verified_claims(state, &provider, &flow, &code, headers, now).await?;
    let (email, email_verified) = provider.config.email(&claims);
    let email = email.ok_or_else(|| sso_failed("the token has no email"))?;
    let groups = claims.strings(provider.config.groups_claim());
    let mapped_role = groups
        .as_deref()
        .and_then(|g| provider.config.mapped_role(g));
    let started = chrono::DateTime::from_timestamp_millis(flow.started_at_ms)
        .ok_or_else(|| sso_failed("bad flow start"))?
        .naive_utc();
    let address = signin::client_address(headers);
    let outcome = sso_login::complete(
        &state.db,
        &SsoLogin {
            provider_id: &provider.id,
            organization_id: &provider.organization_id,
            email_domains: &provider.email_domains,
            jit_provisioning: provider.jit_provisioning,
            default_role: &provider.default_role,
            subject: &claims.subject,
            email: &email,
            email_verified,
            name: claims.name.as_deref(),
            groups: groups.as_deref(),
            mapped_role: mapped_role.map(|r| r.as_str()),
            flow_started_at: started,
            ip_address: Some(&address),
        },
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "sso login transaction failed");
        sso_failed("store")
    })?;
    match outcome {
        SsoOutcome::SignedIn { user, .. } => {
            let set = issue_session(
                state,
                headers,
                &user.id,
                &user.name,
                &user.email,
                &user.role,
            )
            .map_err(|_| sso_failed("session"))?;
            Ok((flow.return_to, set))
        }
        SsoOutcome::Replayed => Err(sso_failed("the flow was already used")),
        SsoOutcome::LinkRefused => Err(refuse(ErrorCode::AccountLinkRefused, "link refused")),
        SsoOutcome::NotProvisioned => Err(refuse(
            ErrorCode::AccountNotProvisioned,
            "no account and no JIT",
        )),
        SsoOutcome::Suspended => Err(refuse(ErrorCode::PermissionDenied, "suspended")),
    }
}

async fn verified_claims(
    state: &AppState,
    provider: &Provider,
    flow: &FlowState,
    code: &str,
    headers: &HeaderMap,
    now: i64,
) -> Result<agents_auth::oidc::id_token::IdTokenClaims, Refusal> {
    let issuer = provider
        .config
        .issuer()
        .map_err(|e| sso_failed(e.to_string()))?;
    let discovery_url = provider
        .config
        .discovery_url()
        .map_err(|e| sso_failed(e.to_string()))?;
    let client = state.signin.oidc_for(&provider.id);
    let doc = client
        .discover(&discovery_url, &issuer)
        .await
        .map_err(|e| sso_failed(e.to_string()))?;
    let redirect_uri = callback_url(&state.signin.origin(headers), &provider.id);
    let id_token = client
        .exchange_code(
            &doc,
            &CodeExchange {
                code,
                redirect_uri: &redirect_uri,
                verifier: &flow.verifier,
                client_id: &provider.config.client_id,
                client_secret: provider.client_secret.as_deref(),
            },
        )
        .await
        .map_err(|e| sso_failed(e.to_string()))?;
    let claims = client
        .verify(
            &doc,
            &id_token,
            &Expected {
                issuer: &doc.issuer,
                client_id: &provider.config.client_id,
                nonce: &flow.nonce,
                now_unix: now,
            },
        )
        .await
        .map_err(|e| sso_failed(e.to_string()))?;
    if !provider.config.claims_fit(&claims) {
        return Err(sso_failed("the preset's claim check failed (hd)"));
    }
    Ok(claims)
}
