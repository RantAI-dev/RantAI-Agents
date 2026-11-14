//! The unit tree: departments and teams, their moves, and who is in them.
//!
//! New in the port: the design adds units (docs/design/identity-and-access.md §3.1). The store
//! (`agents_store::units`) owns the tree rules — a cycle or a slug clash is a 409, another
//! organisation's unit a 404 — and this module decides who may write.
//!
//! A team lead holds `org.units.manage` inside their own unit and everything below it, never on
//! a sibling and never on the organisation itself. Creating, deleting and moving a unit are
//! decided on its parent (a move on both parents), so a lead cannot create or delete a top-level
//! unit, delete the unit they lead, or carry a unit out of their subtree.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Serialize;
use serde_json::Value;

use agents_core::authz::{MemberSource, UnitKind};
use agents_store::audit::Actor;
use agents_store::units::{self, MemberRow, NewUnit, UnitRow};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::client_ip::ClientIp;
use crate::http::json::Body;
use crate::http::time::iso;

use super::bodies::{parse_unit_create, parse_unit_member, parse_unit_update, parse_user_id};
use super::{SuccessJson, ensure_parent, ensure_unit, missing_body, principal, store_error};

/// One unit with the units below it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UnitJson {
    id: String,
    parent_id: Option<String>,
    kind: String,
    name: String,
    slug: String,
    external_id: Option<String>,
    created_at: String,
    updated_at: String,
    children: Vec<UnitJson>,
}

/// A list answer. A tree has no cursor: the whole tree comes back in one answer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UnitTreeJson {
    data: Vec<UnitJson>,
    next_cursor: Option<String>,
}

/// One direct member of a unit.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UnitMemberJson {
    user_id: String,
    role: String,
    source: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UnitMembersJson {
    data: Vec<UnitMemberJson>,
    next_cursor: Option<String>,
}

fn unit_json(row: &UnitRow, rows: &[UnitRow]) -> UnitJson {
    UnitJson {
        id: row.id.clone(),
        parent_id: row.parent_id.clone(),
        kind: row.kind.clone(),
        name: row.name.clone(),
        slug: row.slug.clone(),
        external_id: row.external_id.clone(),
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
        children: rows
            .iter()
            .filter(|child| child.parent_id.as_deref() == Some(row.id.as_str()))
            .map(|child| unit_json(child, rows))
            .collect(),
    }
}

fn actor<'a>(user: &'a CurrentUser, ip_address: Option<&'a str>) -> Actor<'a> {
    Actor {
        user_id: &user.id,
        ip_address,
    }
}

fn member_json(row: &MemberRow) -> UnitMemberJson {
    UnitMemberJson {
        user_id: row.user_id.clone(),
        role: row.role.clone(),
        source: row.source.clone(),
        created_at: iso(row.created_at),
    }
}

/// `GET /api/organizations/{id}/units` — the tree. Every accepted member may read it.
pub(super) async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<UnitTreeJson>, ApiError> {
    principal(&state, &user, &id).await?;
    let rows = units::list(&state.db, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(UnitTreeJson {
        data: rows
            .iter()
            .filter(|row| row.parent_id.is_none())
            .map(|row| unit_json(row, &rows))
            .collect(),
        next_cursor: None,
    }))
}

/// `POST /api/organizations/{id}/units` — a department or team under a parent, or at the top.
pub(super) async fn create(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<(StatusCode, Json<UnitJson>), ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let member = principal(&state, &user, &id).await?;
    let input = parse_unit_create(&body)?;
    // A child needs the permission on its parent; a top-level unit needs it on the organisation,
    // which no lead holds.
    if let Some(parent) = input.parent_id.as_deref() {
        units::get(&state.db, &id, parent)
            .await
            .map_err(|e| store_error(&e))?;
    }
    ensure_parent(&member, &id, input.parent_id.as_deref())?;
    let ip = ip.text();
    let kind = UnitKind::parse(&input.kind).ok_or_else(|| {
        ApiError::from(vec![agents_core::validation::FieldError::new(
            "/kind",
            "invalid_enum",
            "The kind must be department or team.",
        )])
    })?;
    let row = units::create(
        &state.db,
        &id,
        &NewUnit {
            parent_id: input.parent_id.as_deref(),
            kind,
            name: &input.name,
            slug: &input.slug,
            external_id: None,
        },
        Some(&actor(&user, ip.as_deref())),
    )
    .await
    .map_err(|e| store_error(&e))?;
    Ok((StatusCode::CREATED, Json(unit_json(&row, &[]))))
}

/// `PATCH /api/organizations/{id}/units/{unitId}` — rename, move, or both.
pub(super) async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path((id, unit_id)): Path<(String, String)>,
    body: Option<Body<Value>>,
) -> Result<Json<UnitJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let member = principal(&state, &user, &id).await?;
    let existing = units::get(&state.db, &id, &unit_id)
        .await
        .map_err(|e| store_error(&e))?;
    ensure_unit(&member, &id, &unit_id)?;
    let change = parse_unit_update(&body)?;
    let ip = ip.text();
    let actor = actor(&user, ip.as_deref());
    let mut row = existing.clone();
    if let Some(parent) = &change.parent_id {
        // Both ends: where the unit hangs now, and where it is going.
        ensure_parent(&member, &id, existing.parent_id.as_deref())?;
        if let Some(new_parent) = parent {
            units::get(&state.db, &id, new_parent)
                .await
                .map_err(|e| store_error(&e))?;
        }
        ensure_parent(&member, &id, parent.as_deref())?;
        row = units::move_to(&state.db, &id, &unit_id, parent.as_deref(), Some(&actor))
            .await
            .map_err(|e| store_error(&e))?;
    }
    if change.name.is_some() || change.external_id.is_some() {
        let name = change.name.as_deref().unwrap_or(&existing.name);
        let external = match &change.external_id {
            Some(value) => value.as_deref(),
            None => existing.external_id.as_deref(),
        };
        row = units::rename(&state.db, &id, &unit_id, name, external, Some(&actor))
            .await
            .map_err(|e| store_error(&e))?;
    }
    Ok(Json(unit_json(&row, &[])))
}

/// `DELETE /api/organizations/{id}/units/{unitId}` — a unit with children is a 409.
pub(super) async fn delete(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path((id, unit_id)): Path<(String, String)>,
) -> Result<Json<SuccessJson>, ApiError> {
    let member = principal(&state, &user, &id).await?;
    let existing = units::get(&state.db, &id, &unit_id)
        .await
        .map_err(|e| store_error(&e))?;
    // Like creating it: the unit's parent decides, so a lead keeps the unit they lead.
    ensure_parent(&member, &id, existing.parent_id.as_deref())?;
    let ip = ip.text();
    units::delete(&state.db, &id, &unit_id, Some(&actor(&user, ip.as_deref())))
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SuccessJson { success: true }))
}

/// `GET /api/organizations/{id}/units/{unitId}/members` — the direct members of one unit.
pub(super) async fn members(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((id, unit_id)): Path<(String, String)>,
) -> Result<Json<UnitMembersJson>, ApiError> {
    let member = principal(&state, &user, &id).await?;
    units::get(&state.db, &id, &unit_id)
        .await
        .map_err(|e| store_error(&e))?;
    ensure_unit(&member, &id, &unit_id)?;
    let rows = units::members(&state.db, &id, &unit_id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(UnitMembersJson {
        data: rows.iter().map(member_json).collect(),
        next_cursor: None,
    }))
}

/// `POST /api/organizations/{id}/units/{unitId}/members` — add a member, optionally as lead.
pub(super) async fn add_member(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path((id, unit_id)): Path<(String, String)>,
    body: Option<Body<Value>>,
) -> Result<(StatusCode, Json<UnitMemberJson>), ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let member = principal(&state, &user, &id).await?;
    units::get(&state.db, &id, &unit_id)
        .await
        .map_err(|e| store_error(&e))?;
    ensure_unit(&member, &id, &unit_id)?;
    let (user_id, is_lead) = parse_unit_member(&body)?;
    let ip = ip.text();
    // The store refuses a user who is not an accepted member of the organisation: a 404.
    let row = units::add_member(
        &state.db,
        &id,
        &unit_id,
        &user_id,
        is_lead,
        MemberSource::Manual,
        Some(&actor(&user, ip.as_deref())),
    )
    .await
    .map_err(|e| store_error(&e))?;
    Ok((StatusCode::CREATED, Json(member_json(&row))))
}

/// `DELETE /api/organizations/{id}/units/{unitId}/members` — remove a member from one unit.
pub(super) async fn remove_member(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path((id, unit_id)): Path<(String, String)>,
    body: Option<Body<Value>>,
) -> Result<Json<SuccessJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let member = principal(&state, &user, &id).await?;
    units::get(&state.db, &id, &unit_id)
        .await
        .map_err(|e| store_error(&e))?;
    ensure_unit(&member, &id, &unit_id)?;
    let user_id = parse_user_id(&body)?;
    let ip = ip.text();
    let actor = actor(&user, ip.as_deref());
    units::remove_member(&state.db, &id, &unit_id, &user_id, Some(&actor))
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(SuccessJson { success: true }))
}
