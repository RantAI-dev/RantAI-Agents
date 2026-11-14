//! The organisations the caller belongs to, and one organisation's settings.
//!
//! Old: `src/app/api/organizations/route.ts` (GET), `src/app/api/organizations/[id]/route.ts`
//! (GET, PATCH) and `src/features/organizations/{core,detail}/service.ts`.

use axum::Json;
use axum::extract::{Path, State};
use serde::Serialize;
use serde_json::Value;

use agents_core::authz::Permission;
use agents_store::audit::Actor;
use agents_store::orgs;

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::client_ip::ClientIp;
use crate::http::json::Body;
use crate::http::time::iso;

use super::bodies::parse_org_update;
use super::{ensure_org, missing_body, principal, store_error};

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
/// The name and slug need `org.manage` (owners only, design §3.2); the password sign-in switch
/// is sign-in policy and needs `org.sso.manage` (owners and admins).
pub(super) async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<OrgDetailJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let member = principal(&state, &user, &id).await?;
    let changes = parse_org_update(&body)?;
    if changes.name.is_some() || changes.slug.is_some() {
        ensure_org(&member, Permission::OrgManage, &id)?;
    }
    if changes.password_login_enabled.is_some() {
        ensure_org(&member, Permission::OrgSsoManage, &id)?;
    }
    let ip = ip.text();
    let actor = Actor {
        user_id: &user.id,
        ip_address: ip.as_deref(),
    };
    let org = orgs::update(
        &state.db,
        &id,
        &orgs::OrgChanges {
            name: changes.name.as_deref(),
            slug: changes.slug.as_deref(),
            password_login_enabled: changes.password_login_enabled,
        },
        &actor,
    )
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
