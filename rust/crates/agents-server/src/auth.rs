//! Who is calling, and in which organisation.
//!
//! Accepts what the Next.js app issues: the NextAuth session cookie first, then the mobile
//! Bearer token (`getRequestUserId` in `src/lib/mobile-auth.ts`). Unlike the TypeScript, a
//! suspended user is refused on every request, not only at login (QA TC-1269), so an old token
//! stops working the moment a platform admin suspends the account.

use axum::extract::FromRequestParts;
use axum::http::HeaderMap;
use axum::http::request::Parts;

use agents_auth::{mobile, session};
use agents_contracts::error_codes::ErrorCode;
use agents_core::org::OrgRole;
use agents_store::{orgs, users};

use crate::AppState;
use crate::http::ApiError;

/// Secrets that sign sessions and mobile tokens. The first one signs; all of them verify, so a
/// secret can be rotated.
#[derive(Clone)]
pub struct AuthConfig {
    pub secrets: Vec<String>,
}

impl std::fmt::Debug for AuthConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthConfig")
            .field("secrets", &self.secrets.len())
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurrentUser {
    pub id: String,
    pub email: Option<String>,
    /// A platform admin (`User.role = ADMIN`), not an organisation role.
    pub is_platform_admin: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrgContext {
    pub org_id: String,
    pub role: OrgRole,
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn unauthenticated() -> ApiError {
    ApiError::new(ErrorCode::Unauthenticated)
}

fn internal(e: &agents_store::StoreError) -> ApiError {
    tracing::error!(error = %e, "auth lookup failed");
    ApiError::new(ErrorCode::Internal)
}

fn identify(headers: &HeaderMap, cfg: &AuthConfig) -> Option<(String, Option<String>)> {
    let secrets: Vec<&str> = cfg.secrets.iter().map(String::as_str).collect();
    let now = now_unix();
    if let Some(cookie) = headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())
        && let Ok(claims) =
            session::decode_session_from_cookie_header_with_secrets(cookie, &secrets, now)
    {
        return Some((claims.id, claims.email));
    }
    let bearer = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))?;
    secrets.iter().find_map(|secret| {
        mobile::verify_mobile_token(bearer, secret, now)
            .ok()
            .map(|c| (c.user_id, c.email))
    })
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let (id, email) = identify(&parts.headers, &state.auth).ok_or_else(unauthenticated)?;
        let status = users::status(&state.db, &id)
            .await
            .map_err(|e| internal(&e))?;
        match status {
            Some(s) if !s.suspended => Ok(Self {
                id,
                email,
                is_platform_admin: s.role == "ADMIN",
            }),
            _ => Err(unauthenticated()),
        }
    }
}

const ACTIVE_ORG_COOKIE: &str = "rantai-active-org";

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let header = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;
    header.split(';').find_map(|pair| {
        let (k, v) = pair.trim().split_once('=')?;
        (k == name && !v.is_empty()).then(|| v.to_owned())
    })
}

fn to_context(m: orgs::Membership) -> Option<OrgContext> {
    Some(OrgContext {
        role: OrgRole::parse(&m.role)?,
        org_id: m.organization_id,
    })
}

/// The organisation the request acts in, as `resolveActiveOrg` decides it: an explicit
/// `X-Organization-Id` the caller must belong to (no fallback if not), else the active-org
/// cookie if still valid, else the caller's earliest accepted membership.
pub async fn active_org(
    state: &AppState,
    headers: &HeaderMap,
    user: &CurrentUser,
) -> Result<OrgContext, ApiError> {
    let header = headers
        .get("x-organization-id")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    if let Some(org) = header {
        let m = orgs::membership(&state.db, &user.id, org)
            .await
            .map_err(|e| internal(&e))?;
        return m
            .and_then(to_context)
            .ok_or_else(|| ApiError::new(ErrorCode::PermissionDenied));
    }
    if let Some(org) = cookie_value(headers, ACTIVE_ORG_COOKIE)
        && let Some(ctx) = orgs::membership(&state.db, &user.id, &org)
            .await
            .map_err(|e| internal(&e))?
            .and_then(to_context)
    {
        return Ok(ctx);
    }
    orgs::default_membership(&state.db, &user.id)
        .await
        .map_err(|e| internal(&e))?
        .and_then(to_context)
        .ok_or_else(|| {
            ApiError::new(ErrorCode::PermissionDenied)
                .message("You do not belong to an organisation.")
        })
}

/// [`active_org`] for a route a caller without an organisation may still use, such as starting a
/// chat with a built-in assistant: the answer is `None` instead of a 403. A caller who names an
/// organisation they do not belong to is still refused.
pub async fn active_org_opt(
    state: &AppState,
    headers: &HeaderMap,
    user: &CurrentUser,
) -> Result<Option<OrgContext>, ApiError> {
    match active_org(state, headers, user).await {
        Ok(org) => Ok(Some(org)),
        Err(e) if e.code == ErrorCode::PermissionDenied && !names_an_organisation(headers) => {
            Ok(None)
        }
        Err(e) => Err(e),
    }
}

fn names_an_organisation(headers: &HeaderMap) -> bool {
    headers
        .get("x-organization-id")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .is_some_and(|v| !v.is_empty())
}
