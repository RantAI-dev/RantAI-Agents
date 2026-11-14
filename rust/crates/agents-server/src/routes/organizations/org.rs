//! The organisations the caller belongs to, and one organisation's settings.
//!
//! Old: `src/app/api/organizations/route.ts` (GET), `src/app/api/organizations/[id]/route.ts`
//! (GET, PATCH) and `src/features/organizations/{core,detail}/service.ts`.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use serde::Serialize;
use serde_json::{Value, json};

use agents_core::authz::Permission;
use agents_store::{audit, orgs};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::json::Body;
use crate::http::time::iso;

use super::bodies::parse_org_update;
use super::{ensure_org, ip_address, missing_body, permits, principal, store_error};

use agents_core::authz::Resource;

/// One organisation in the caller's list, as the old route returned it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OrgListItemJson {
    id: String,
    name: String,
    slug: String,
    logo_url: Option<String>,
    role: String,
    created_at: String,
    joined_at: Option<String>,
}

/// One organisation's settings. `passwordLoginEnabled` is the field the design adds.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OrgDetailJson {
    id: String,
    name: String,
    slug: String,
    logo_url: Option<String>,
    password_login_enabled: bool,
    role: String,
    created_at: String,
    updated_at: String,
}

/// `GET /api/organizations` — every organisation the caller has accepted, by name.
pub(super) async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<OrgListItemJson>>, ApiError> {
    let rows = orgs::list_for_user(&state.db, &user.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(
        rows.iter()
            .map(|row| OrgListItemJson {
                id: row.id.clone(),
                name: row.name.clone(),
                slug: row.slug.clone(),
                logo_url: row.logo_url.clone(),
                role: row.role.clone(),
                created_at: iso(row.created_at),
                joined_at: row.joined_at.map(iso),
            })
            .collect(),
    ))
}

/// `GET /api/organizations/{id}` — one organisation the caller is an accepted member of.
pub(super) async fn get_one(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<OrgDetailJson>, ApiError> {
    // Another organisation is a 404 here: the caller is not an accepted member of it.
    let member = principal(&state, &user, &id).await?;
    let org = orgs::get(&state.db, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(OrgDetailJson {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo_url: org.logo_url,
        password_login_enabled: org.password_login_enabled,
        role: member.role.as_str().to_owned(),
        created_at: iso(org.created_at),
        updated_at: iso(org.updated_at),
    }))
}

/// `PATCH /api/organizations/{id}` — name, slug and the password sign-in switch.
///
/// Needs `org.manage` or `org.members.manage`: an owner may always change them, an admin may
/// too (the design table gives both `org.members.manage`, and the settings screen is theirs).
pub(super) async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<OrgDetailJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let member = principal(&state, &user, &id).await?;
    let org_resource = Resource::Org {
        organization_id: &id,
    };
    if !permits(&member, Permission::OrgManage, &org_resource) {
        ensure_org(&member, Permission::OrgMembersManage, &id)?;
    }
    let changes = parse_org_update(&body)?;
    let org = orgs::update(
        &state.db,
        &id,
        &orgs::OrgChanges {
            name: changes.name.as_deref(),
            slug: changes.slug.as_deref(),
            password_login_enabled: changes.password_login_enabled,
        },
    )
    .await
    .map_err(|e| store_error(&e))?;
    let mut detail = serde_json::Map::new();
    if let Some(name) = &changes.name {
        detail.insert("name".to_owned(), json!(name));
    }
    if let Some(slug) = &changes.slug {
        detail.insert("slug".to_owned(), json!(slug));
    }
    if let Some(enabled) = changes.password_login_enabled {
        detail.insert("passwordLoginEnabled".to_owned(), json!(enabled));
    }
    write_audit(
        &state,
        &headers,
        &user,
        &id,
        "org.update",
        format!("org:{id}"),
        Value::Object(detail),
    )
    .await?;
    Ok(Json(OrgDetailJson {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo_url: org.logo_url,
        password_login_enabled: org.password_login_enabled,
        role: member.role.as_str().to_owned(),
        created_at: iso(org.created_at),
        updated_at: iso(org.updated_at),
    }))
}

/// Writes the audit row of a change, with the actor and the caller's address.
pub(crate) async fn write_audit(
    state: &AppState,
    headers: &HeaderMap,
    user: &CurrentUser,
    org_id: &str,
    action: &str,
    resource: String,
    detail: Value,
) -> Result<(), ApiError> {
    let ip = ip_address(headers);
    audit::write(
        &state.db,
        org_id,
        &audit::NewAudit {
            action,
            resource,
            detail,
            user_id: Some(&user.id),
            ip_address: ip.as_deref(),
        },
    )
    .await
    .map_err(|e| store_error(&e))
}
