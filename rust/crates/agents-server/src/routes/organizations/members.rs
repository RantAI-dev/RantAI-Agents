//! Members: the list, invitations, roles and removal.
//!
//! Old: `src/app/api/organizations/[id]/members/**` and
//! `src/features/organizations/members/service.ts`.
//!
//! What changed on the way (docs/port/differences.md, rows 110+):
//! - an invitation is always pending until the invitee accepts it (the old route accepted an
//!   existing account immediately);
//! - an address already invited is a 409, not a 400;
//! - the last owner cannot be demoted or removed; the store holds the row lock that makes it
//!   true under two concurrent writers;
//! - making or unmaking an owner asks for `org.manage`, which only an owner holds.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Serialize;
use serde_json::Value;

use agents_contracts::error_codes::ErrorCode;
use agents_core::authz::Permission;
use agents_store::audit::Actor;
use agents_store::org_members::{self, MemberRow, MemberWrite};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::client_ip::ClientIp;
use crate::http::json::Body;

use super::bodies::{parse_invite, parse_role};
use super::{SuccessJson, ensure_org, missing_body, owner_rights, principal, store_error};

/// One unit the member is directly in.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MemberUnitJson {
    unit_id: String,
    role: String,
    source: String,
}

/// One member, as the old route returned it, plus the units they are in.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MemberJson {
    id: String,
    user_id: String,
    email: String,
    name: Option<String>,
    role: String,
    invited_by: Option<String>,
    invited_at: String,
    accepted_at: Option<String>,
    is_pending: bool,
    units: Vec<MemberUnitJson>,
}

fn member_json(member: &MemberRow, units: &[org_members::UnitMembershipRow]) -> MemberJson {
    MemberJson {
        id: member.id.clone(),
        user_id: member.user_id.clone(),
        email: member.email.clone(),
        name: member.name.clone(),
        role: member.role.clone(),
        invited_by: member.invited_by.clone(),
        invited_at: crate::http::time::iso(member.invited_at),
        accepted_at: crate::http::time::iso_opt(member.accepted_at),
        is_pending: member.is_pending(),
        units: units
            .iter()
            .filter(|u| u.user_id == member.user_id)
            .map(|u| MemberUnitJson {
                unit_id: u.unit_id.clone(),
                role: u.role.clone(),
                source: u.source.clone(),
            })
            .collect(),
    }
}

/// `GET /api/organizations/{id}/members` — the members with their direct unit memberships.
pub(super) async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<Vec<MemberJson>>, ApiError> {
    let member = principal(&state, &user, &id).await?;
    ensure_org(&member, Permission::OrgMembersManage, &id)?;
    let rows = org_members::list(&state.db, &id)
        .await
        .map_err(|e| store_error(&e))?;
    let units = org_members::unit_memberships(&state.db, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(
        rows.iter().map(|row| member_json(row, &units)).collect(),
    ))
}

/// `POST /api/organizations/{id}/members` — invite an address as a pending member.
pub(super) async fn invite(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<(StatusCode, Json<MemberJson>), ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let member = principal(&state, &user, &id).await?;
    ensure_org(&member, Permission::OrgMembersManage, &id)?;
    let (email, role) = parse_invite(&body)?;
    let ip = ip.text();
    let actor = Actor {
        user_id: &user.id,
        ip_address: ip.as_deref(),
    };
    let row = org_members::invite(&state.db, &id, &email, &role, &actor)
        .await
        .map_err(|e| store_error(&e))?;
    Ok((StatusCode::CREATED, Json(member_json(&row, &[]))))
}

/// `POST /api/organizations/{id}/members/accept` — the invitee accepts the invite addressed to
/// them. Nobody else can: the row names the caller's user id, or names nobody yet and carries the
/// caller's stored address (`org_members::accept_invite`).
pub(super) async fn accept(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path(id): Path<String>,
) -> Result<Json<MemberJson>, ApiError> {
    let ip = ip.text();
    let actor = Actor {
        user_id: &user.id,
        ip_address: ip.as_deref(),
    };
    let row = org_members::accept_invite(&state.db, &id, &actor)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(member_json(&row, &[])))
}

/// `PATCH /api/organizations/{id}/members/{memberId}` — change a member's role.
///
/// Changing a role to or from `owner` needs `org.manage`: only an owner makes or unmakes one.
/// The store applies that to the target as it locks it, so a promotion committed meanwhile counts.
pub(super) async fn change_role(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path((id, member_id)): Path<(String, String)>,
    body: Option<Body<Value>>,
) -> Result<Json<MemberJson>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let member = principal(&state, &user, &id).await?;
    ensure_org(&member, Permission::OrgMembersManage, &id)?;
    let role = parse_role(&body)?;
    let ip = ip.text();
    let actor = Actor {
        user_id: &user.id,
        ip_address: ip.as_deref(),
    };
    let written = org_members::change_role(
        &state.db,
        &id,
        &member_id,
        &role,
        owner_rights(&member, &id),
        &actor,
    )
    .await
    .map_err(|e| store_error(&e))?;
    let MemberWrite::Done((_, row)) = written else {
        return Err(ApiError::new(ErrorCode::PermissionDenied));
    };
    let units = org_members::unit_memberships(&state.db, &id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(member_json(&row, &units)))
}

/// `DELETE /api/organizations/{id}/members/{memberId}` — remove a member and their unit
/// memberships. Removing an owner needs `org.manage`, and the last owner stays (a 409).
pub(super) async fn remove(
    State(state): State<AppState>,
    user: CurrentUser,
    ip: ClientIp,
    Path((id, member_id)): Path<(String, String)>,
) -> Result<Json<SuccessJson>, ApiError> {
    let member = principal(&state, &user, &id).await?;
    ensure_org(&member, Permission::OrgMembersManage, &id)?;
    let ip = ip.text();
    let actor = Actor {
        user_id: &user.id,
        ip_address: ip.as_deref(),
    };
    let written = org_members::remove(
        &state.db,
        &id,
        &member_id,
        owner_rights(&member, &id),
        &actor,
    )
    .await
    .map_err(|e| store_error(&e))?;
    match written {
        MemberWrite::Done(_) => Ok(Json(SuccessJson { success: true })),
        MemberWrite::OwnersOnly => Err(ApiError::new(ErrorCode::PermissionDenied)),
    }
}
