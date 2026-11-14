//! The organisation's identity providers (`org.sso.manage`):
//!
//! - `GET  /api/dashboard/sso/providers`            list
//! - `POST /api/dashboard/sso/providers`            create
//! - `GET|PATCH|DELETE /api/dashboard/sso/providers/{id}`
//! - `POST /api/dashboard/sso/providers/{id}/test`  fetch discovery and the JWKS
//!
//! The client secret is encrypted with the `Credential` encryption and never returned: a view says
//! `hasClientSecret`. Each view carries the `callbackUrl` to register at the provider. Another
//! organisation's provider is 404; a caller without the permission is 403 before any lookup.

use std::collections::BTreeMap;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::{Json, Router, routing::get, routing::post};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use agents_contracts::error_codes::ErrorCode;
use agents_core::authz::{self, Decision, Permission, Resource};
use agents_core::org::OrgRole;
use agents_core::validation::FieldError;
use agents_store::audit::{self, AuditEntry};
use agents_store::identity::{self, ProviderRow, ProviderWrite, WriteError};

use crate::AppState;
use crate::auth::{CurrentUser, active_org};
use crate::http::ApiError;
use crate::http::json::Body;
use crate::http::time::iso;
use crate::signin;
use crate::sso::config::{OidcConfig, Preset, is_guid};
use crate::sso::env::ENV_PROVIDER_ID;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/dashboard/sso/providers", get(list).post(create))
        .route(
            "/api/dashboard/sso/providers/{id}",
            get(read).patch(update).delete(remove),
        )
        .route("/api/dashboard/sso/providers/{id}/test", post(test))
}

fn internal(e: &dyn std::fmt::Display) -> ApiError {
    tracing::error!(error = %e, "identity provider admin failed");
    ApiError::new(ErrorCode::Internal)
}

/// The caller's organisation, once they hold `org.sso.manage` in it.
async fn authorised(
    state: &AppState,
    headers: &HeaderMap,
    user: &CurrentUser,
) -> Result<String, ApiError> {
    let ctx = active_org(state, headers, user).await?;
    let principal = agents_store::access::principal(&state.db, &user.id, &ctx.org_id)
        .await
        .map_err(|e| internal(&e))?
        .ok_or_else(|| ApiError::new(ErrorCode::PermissionDenied))?;
    match authz::authorize(
        &principal,
        Permission::OrgSsoManage,
        &Resource::Org {
            organization_id: &ctx.org_id,
        },
    ) {
        Decision::Allow => Ok(ctx.org_id),
        Decision::Deny => Err(ApiError::new(ErrorCode::PermissionDenied)),
        Decision::NotFound => Err(ApiError::new(ErrorCode::NotFound)),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct View {
    id: String,
    kind: String,
    name: String,
    is_enabled: bool,
    preset: Option<&'static str>,
    issuer: Option<String>,
    discovery_url: Option<String>,
    tenant_id: Option<String>,
    hosted_domain: Option<String>,
    client_id: Option<String>,
    has_client_secret: bool,
    scopes: Vec<String>,
    groups_claim: Option<String>,
    role_mapping: BTreeMap<String, String>,
    email_domains: Vec<String>,
    is_jit_enabled: bool,
    default_role: String,
    /// Register this at the identity provider as the redirect URI.
    callback_url: String,
    /// The provider comes from `AUTH_OIDC_*` and cannot be edited here.
    is_managed_by_env: bool,
    created_at: String,
    updated_at: String,
}

fn view(row: ProviderRow, origin: &str) -> View {
    let config = serde_json::from_value::<OidcConfig>(row.config.clone()).ok();
    let is_managed_by_env = row.id == ENV_PROVIDER_ID;
    View {
        callback_url: super::sso::callback_url(origin, &row.id),
        preset: config.as_ref().map(|c| c.preset.as_str()),
        issuer: config.as_ref().and_then(|c| c.issuer().ok()),
        discovery_url: config.as_ref().and_then(|c| c.discovery_url.clone()),
        tenant_id: config.as_ref().and_then(|c| c.tenant_id.clone()),
        hosted_domain: config.as_ref().and_then(|c| c.hosted_domain.clone()),
        client_id: config.as_ref().map(|c| c.client_id.clone()),
        has_client_secret: config
            .as_ref()
            .is_some_and(|c| c.client_secret_encrypted.is_some()),
        scopes: config
            .as_ref()
            .map(|c| c.scopes.clone())
            .unwrap_or_default(),
        groups_claim: config.as_ref().and_then(|c| c.groups_claim.clone()),
        role_mapping: config.map(|c| c.role_mapping).unwrap_or_default(),
        id: row.id,
        kind: row.kind,
        name: row.name,
        is_enabled: row.enabled,
        email_domains: row.email_domains,
        is_jit_enabled: row.jit_provisioning,
        default_role: row.default_role,
        is_managed_by_env,
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListResponse {
    data: Vec<View>,
    next_cursor: Option<String>,
}

async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<Json<ListResponse>, ApiError> {
    let org = authorised(&state, &headers, &user).await?;
    let origin = state.signin.origin(&headers);
    let rows = identity::list(&state.db, &org)
        .await
        .map_err(|e| internal(&e))?;
    Ok(Json(ListResponse {
        data: rows.into_iter().map(|r| view(r, &origin)).collect(),
        next_cursor: None,
    }))
}

async fn find(state: &AppState, org: &str, id: &str) -> Result<ProviderRow, ApiError> {
    identity::get(&state.db, org, id)
        .await
        .map_err(|e| internal(&e))?
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))
}

async fn read(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<Json<View>, ApiError> {
    let org = authorised(&state, &headers, &user).await?;
    let row = find(&state, &org, &id).await?;
    Ok(Json(view(row, &state.signin.origin(&headers))))
}

/// A field that may be absent (keep), `null` (clear) or a value (set).
fn present<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

/// The create body, and the update body with every field optional.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProviderBody {
    name: Option<String>,
    preset: Option<String>,
    #[serde(default, deserialize_with = "present")]
    issuer: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    discovery_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    tenant_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    hosted_domain: Option<Option<String>>,
    client_id: Option<String>,
    #[serde(default, deserialize_with = "present")]
    client_secret: Option<Option<String>>,
    scopes: Option<Vec<String>>,
    #[serde(default, deserialize_with = "present")]
    groups_claim: Option<Option<String>>,
    role_mapping: Option<BTreeMap<String, String>>,
    email_domains: Option<Vec<String>>,
    is_enabled: Option<bool>,
    is_jit_enabled: Option<bool>,
    default_role: Option<String>,
}

/// The provider as it will be stored, before the secret is sealed.
struct Draft {
    name: String,
    enabled: bool,
    config: OidcConfig,
    new_secret: Option<Option<String>>,
    email_domains: Vec<String>,
    jit_provisioning: bool,
    default_role: String,
}

fn is_domain(d: &str) -> bool {
    d.len() <= 253
        && d.contains('.')
        && d.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                && !label.starts_with('-')
                && !label.ends_with('-')
        })
}

fn assignable_role(r: &str) -> bool {
    matches!(
        OrgRole::parse(r),
        Some(OrgRole::Admin | OrgRole::Member | OrgRole::Viewer)
    )
}

fn url_ok(u: &str) -> bool {
    reqwest::Url::parse(u).is_ok_and(|p| matches!(p.scheme(), "https" | "http"))
}

/// Applies `body` over `base` (the stored provider, or nothing for a create) and checks the
/// result; every bad field is listed.
fn draft(body: ProviderBody, base: Option<&ProviderRow>) -> Result<Draft, ApiError> {
    let mut errors = Vec::new();
    let base_config =
        base.and_then(|r| serde_json::from_value::<OidcConfig>(r.config.clone()).ok());
    let preset = match body.preset.as_deref() {
        Some(p) => Preset::parse(p).unwrap_or_else(|| {
            errors.push(FieldError::new(
                "/preset",
                "invalid",
                "Use keycloak, entra, google or generic.",
            ));
            Preset::Generic
        }),
        None => base_config.as_ref().map_or_else(
            || {
                errors.push(FieldError::new("/preset", "required", "Choose a preset."));
                Preset::Generic
            },
            |c| c.preset,
        ),
    };
    let keep = |new: Option<Option<String>>, old: Option<String>| match new {
        Some(v) => v.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()),
        None => old,
    };
    let bc = base_config.clone();
    let config = OidcConfig {
        preset,
        issuer: keep(body.issuer, bc.as_ref().and_then(|c| c.issuer.clone())),
        discovery_url: keep(
            body.discovery_url,
            bc.as_ref().and_then(|c| c.discovery_url.clone()),
        ),
        tenant_id: keep(
            body.tenant_id,
            bc.as_ref().and_then(|c| c.tenant_id.clone()),
        ),
        hosted_domain: keep(
            body.hosted_domain,
            bc.as_ref().and_then(|c| c.hosted_domain.clone()),
        ),
        client_id: body
            .client_id
            .map(|c| c.trim().to_owned())
            .or_else(|| bc.as_ref().map(|c| c.client_id.clone()))
            .unwrap_or_default(),
        client_secret_encrypted: bc.as_ref().and_then(|c| c.client_secret_encrypted.clone()),
        scopes: body
            .scopes
            .or_else(|| bc.as_ref().map(|c| c.scopes.clone()))
            .unwrap_or_default(),
        groups_claim: keep(
            body.groups_claim,
            bc.as_ref().and_then(|c| c.groups_claim.clone()),
        ),
        role_mapping: body
            .role_mapping
            .or_else(|| bc.as_ref().map(|c| c.role_mapping.clone()))
            .unwrap_or_default(),
        source: None,
    };
    if config.client_id.is_empty() || config.client_id.len() > 500 {
        errors.push(FieldError::new(
            "/clientId",
            "required",
            "Enter the client id the provider gave you.",
        ));
    }
    match preset {
        Preset::Keycloak
            if !config
                .issuer
                .as_deref()
                .is_some_and(|i| url_ok(i) && i.contains("/realms/")) =>
        {
            errors.push(FieldError::new(
                "/issuer",
                "invalid",
                "Enter the realm URL, https://<host>/realms/<realm>.",
            ));
        }
        Preset::Entra if !config.tenant_id.as_deref().is_some_and(is_guid) => {
            errors.push(FieldError::new("/tenantId", "invalid", "Enter the directory (tenant) id, a GUID. Multi-tenant endpoints such as common are not supported."));
        }
        Preset::Generic if !config.issuer.as_deref().is_some_and(url_ok) => {
            errors.push(FieldError::new(
                "/issuer",
                "invalid",
                "Enter the issuer URL.",
            ));
        }
        _ => {}
    }
    if config.discovery_url.as_deref().is_some_and(|u| !url_ok(u)) {
        errors.push(FieldError::new("/discoveryUrl", "invalid", "Enter a URL."));
    }
    if config.scopes.len() > 20
        || config
            .scopes
            .iter()
            .any(|s| s.is_empty() || s.contains(' '))
    {
        errors.push(FieldError::new(
            "/scopes",
            "invalid",
            "Use up to 20 scopes without spaces.",
        ));
    }
    for (group, role) in &config.role_mapping {
        if !assignable_role(role) || group.is_empty() {
            errors.push(FieldError::new(
                format!("/roleMapping/{group}"),
                "invalid",
                "Map a group to admin, member or viewer.",
            ));
        }
    }
    let name = body
        .name
        .map(|n| n.trim().to_owned())
        .or_else(|| base.map(|r| r.name.clone()))
        .unwrap_or_default();
    if name.is_empty() || name.chars().count() > 200 {
        errors.push(FieldError::new(
            "/name",
            "required",
            "Enter a name of at most 200 characters.",
        ));
    }
    let email_domains: Vec<String> = body
        .email_domains
        .map(|d| d.iter().map(|s| s.trim().to_ascii_lowercase()).collect())
        .or_else(|| base.map(|r| r.email_domains.clone()))
        .unwrap_or_default();
    if email_domains.len() > 50 || email_domains.iter().any(|d| !is_domain(d)) {
        errors.push(FieldError::new(
            "/emailDomains",
            "invalid",
            "Use up to 50 domain names such as example.com.",
        ));
    }
    let default_role = body
        .default_role
        .or_else(|| base.map(|r| r.default_role.clone()))
        .unwrap_or_else(|| "member".to_owned());
    if !assignable_role(&default_role) {
        errors.push(FieldError::new(
            "/defaultRole",
            "invalid",
            "Use admin, member or viewer.",
        ));
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(Draft {
        name,
        enabled: body.is_enabled.or(base.map(|r| r.enabled)).unwrap_or(true),
        config,
        new_secret: body.client_secret,
        email_domains,
        jit_provisioning: body
            .is_jit_enabled
            .or(base.map(|r| r.jit_provisioning))
            .unwrap_or(false),
        default_role,
    })
}

/// The stored config of a draft, with the new secret sealed.
fn sealed_config(state: &AppState, mut draft: Draft) -> Result<(Draft, Value), ApiError> {
    match draft.new_secret.take() {
        Some(Some(secret)) if !secret.is_empty() => {
            let key = state.signin.credential_key.as_ref().ok_or_else(|| {
                ApiError::new(ErrorCode::Conflict).message(
                    "This deployment cannot store secrets: set CREDENTIAL_ENCRYPTION_KEY first.",
                )
            })?;
            draft.config.client_secret_encrypted = Some(crate::sso::seal_secret(key, &secret)?);
        }
        Some(_) => draft.config.client_secret_encrypted = None,
        None => {}
    }
    let value = serde_json::to_value(&draft.config).map_err(|e| internal(&e))?;
    Ok((draft, value))
}

fn write_error(e: WriteError) -> ApiError {
    match e {
        WriteError::DomainTaken(domain) => ApiError::new(ErrorCode::Conflict).message(format!(
            "The domain {domain} is already claimed by another organisation's identity provider."
        )),
        WriteError::Store(e) => internal(&e),
    }
}

async fn audit_change(
    state: &AppState,
    headers: &HeaderMap,
    org: &str,
    user: &str,
    action: &str,
    row_id: &str,
    name: &str,
) {
    let entry = AuditEntry {
        organization_id: org,
        user_id: Some(user),
        action,
        resource: &format!("identity_provider:{row_id}"),
        detail: json!({ "providerId": row_id, "name": name }),
        ip_address: Some(&signin::client_address(headers)),
        risk_level: "high",
    };
    if let Err(e) = audit::record(&state.db, &entry).await {
        tracing::warn!(error = %e, "the provider change was not audited");
    }
}

async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Body(body): Body<ProviderBody>,
) -> Result<(StatusCode, Json<View>), ApiError> {
    let org = authorised(&state, &headers, &user).await?;
    let (draft, config) = sealed_config(&state, draft(body, None)?)?;
    let write = ProviderWrite {
        kind: "oidc",
        name: &draft.name,
        enabled: draft.enabled,
        config: &config,
        email_domains: &draft.email_domains,
        jit_provisioning: draft.jit_provisioning,
        default_role: &draft.default_role,
    };
    let row = identity::create(&state.db, &org, None, &write)
        .await
        .map_err(write_error)?;
    audit_change(
        &state,
        &headers,
        &org,
        &user.id,
        "sso.provider.create",
        &row.id,
        &row.name,
    )
    .await;
    Ok((
        StatusCode::CREATED,
        Json(view(row, &state.signin.origin(&headers))),
    ))
}

fn env_managed() -> ApiError {
    ApiError::new(ErrorCode::Conflict).message(
        "This provider comes from the AUTH_OIDC_* environment variables. Change them instead.",
    )
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    user: CurrentUser,
    Body(body): Body<ProviderBody>,
) -> Result<Json<View>, ApiError> {
    let org = authorised(&state, &headers, &user).await?;
    let current = find(&state, &org, &id).await?;
    if current.id == ENV_PROVIDER_ID {
        return Err(env_managed());
    }
    let (draft, config) = sealed_config(&state, draft(body, Some(&current))?)?;
    let write = ProviderWrite {
        kind: "oidc",
        name: &draft.name,
        enabled: draft.enabled,
        config: &config,
        email_domains: &draft.email_domains,
        jit_provisioning: draft.jit_provisioning,
        default_role: &draft.default_role,
    };
    let row = identity::update(&state.db, &org, &id, &write)
        .await
        .map_err(write_error)?
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;
    audit_change(
        &state,
        &headers,
        &org,
        &user.id,
        "sso.provider.update",
        &row.id,
        &row.name,
    )
    .await;
    Ok(Json(view(row, &state.signin.origin(&headers))))
}

async fn remove(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<StatusCode, ApiError> {
    let org = authorised(&state, &headers, &user).await?;
    let current = find(&state, &org, &id).await?;
    if current.id == ENV_PROVIDER_ID {
        return Err(env_managed());
    }
    if !identity::delete(&state.db, &org, &id)
        .await
        .map_err(|e| internal(&e))?
    {
        return Err(ApiError::new(ErrorCode::NotFound));
    }
    audit_change(
        &state,
        &headers,
        &org,
        &user.id,
        "sso.provider.delete",
        &id,
        &current.name,
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TestResult {
    is_reachable: bool,
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    key_count: usize,
}

async fn test(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    user: CurrentUser,
) -> Result<Json<TestResult>, ApiError> {
    let org = authorised(&state, &headers, &user).await?;
    let row = find(&state, &org, &id).await?;
    let config = serde_json::from_value::<OidcConfig>(row.config).map_err(|e| internal(&e))?;
    let failed = |e: &dyn std::fmt::Display| {
        tracing::info!(error = %e, provider_id = %id, "provider test failed");
        ApiError::new(ErrorCode::UpstreamFailed)
    };
    let issuer = config.issuer().map_err(|e| failed(&e))?;
    let url = config.discovery_url().map_err(|e| failed(&e))?;
    let doc = state
        .signin
        .oidc
        .discover(&url, &issuer)
        .await
        .map_err(|e| failed(&e))?;
    let keys = state
        .signin
        .oidc
        .jwks(&doc.jwks_uri, true)
        .await
        .map_err(|e| failed(&e))?;
    Ok(Json(TestResult {
        is_reachable: true,
        issuer: doc.issuer,
        authorization_endpoint: doc.authorization_endpoint,
        token_endpoint: doc.token_endpoint,
        key_count: keys.keys.len(),
    }))
}
