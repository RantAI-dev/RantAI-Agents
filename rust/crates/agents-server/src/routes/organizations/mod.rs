//! The organisation admin API: `/api/organizations/**`.
//!
//! Old: `src/app/api/organizations/**`, `src/features/organizations/{core,detail,members}/*`.
//!
//! The success bodies are the ones the TypeScript returned wherever a route existed before, so
//! the current UI keeps working. What changed on the way (docs/port/differences.md, rows 110+):
//! - every decision goes through `agents_core::authz::authorize`; a route never compares roles;
//! - another organisation's organisation, member, unit or audit row is a 404, never a 403;
//! - errors use the standard body and a bad body is a 400 listing every bad field;
//! - the last owner cannot be demoted or removed (a 409), also under two concurrent writers;
//! - every change writes an `AuditLog` row;
//! - an invitation is pending until the invitee accepts it, and only the invitee can.

mod audit;
mod bodies;
mod members;
mod org;
mod units;

use axum::Router;
use axum::http::HeaderMap;
use axum::routing::{get, patch, post};
use serde::Serialize;

use agents_contracts::error_codes::ErrorCode;
use agents_core::authz::{Decision, Permission, Principal, Resource, authorize};
use agents_core::validation::FieldError;
use agents_store::StoreError;
use agents_store::access;
use agents_store::org_members::OwnerRights;

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/organizations", get(org::list))
        .route(
            "/api/organizations/{id}",
            get(org::get_one).patch(org::update),
        )
        .route(
            "/api/organizations/{id}/members",
            get(members::list).post(members::invite),
        )
        .route(
            "/api/organizations/{id}/members/accept",
            post(members::accept),
        )
        .route(
            "/api/organizations/{id}/members/{memberId}",
            patch(members::change_role).delete(members::remove),
        )
        .route(
            "/api/organizations/{id}/units",
            get(units::list).post(units::create),
        )
        .route(
            "/api/organizations/{id}/units/{unitId}",
            patch(units::update).delete(units::delete),
        )
        .route(
            "/api/organizations/{id}/units/{unitId}/members",
            get(units::members)
                .post(units::add_member)
                .delete(units::remove_member),
        )
        .route("/api/organizations/{id}/audit", get(audit::list))
}

/// The caller as authorisation sees them in this organisation. Not an accepted member is a 404:
/// the caller must not learn that the organisation exists.
pub(crate) async fn principal(
    state: &AppState,
    user: &CurrentUser,
    org_id: &str,
) -> Result<Principal, ApiError> {
    access::principal(&state.db, &user.id, org_id)
        .await
        .map_err(|e| store_error(&e))?
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))
}

/// The one decision. `Deny` is a 403 `permission_denied`; `NotFound` is a 404.
pub(crate) fn ensure(
    principal: &Principal,
    permission: Permission,
    resource: &Resource<'_>,
) -> Result<(), ApiError> {
    match authorize(principal, permission, resource) {
        Decision::Allow => Ok(()),
        Decision::Deny => Err(ApiError::new(ErrorCode::PermissionDenied)),
        Decision::NotFound => Err(ApiError::new(ErrorCode::NotFound)),
    }
}

/// `org.units.manage` on one unit: an owner, an admin, or the lead of that unit or one above it.
pub(crate) fn ensure_unit(
    principal: &Principal,
    org_id: &str,
    unit_id: &str,
) -> Result<(), ApiError> {
    ensure(
        principal,
        Permission::OrgUnitsManage,
        &Resource::Unit {
            organization_id: org_id,
            unit_id,
        },
    )
}

/// `org.units.manage` on the organisation itself: creating a top-level unit, moving one to the
/// top level. A team lead never holds it.
pub(crate) fn ensure_org(
    principal: &Principal,
    permission: Permission,
    org_id: &str,
) -> Result<(), ApiError> {
    ensure(
        principal,
        permission,
        &Resource::Org {
            organization_id: org_id,
        },
    )
}

/// `org.units.manage` where a unit hangs: on its parent, or on the organisation for a top-level
/// unit. Creating, deleting and moving a unit need it (a move at both ends), so a lead never
/// adds, removes or carries a unit outside their own subtree.
pub(crate) fn ensure_parent(
    principal: &Principal,
    org_id: &str,
    parent_id: Option<&str>,
) -> Result<(), ApiError> {
    match parent_id {
        Some(parent) => ensure_unit(principal, org_id, parent),
        None => ensure_org(principal, Permission::OrgUnitsManage, org_id),
    }
}

/// Whether the principal holds the permission on the resource. The two answers that are not
/// `Allow` are left to [`ensure`], which says which status they become.
pub(crate) fn permits(
    principal: &Principal,
    permission: Permission,
    resource: &Resource<'_>,
) -> bool {
    matches!(authorize(principal, permission, resource), Decision::Allow)
}

/// Whether the principal may make, unmake or remove an owner (`org.manage`). The store applies
/// it to the target row under its lock, not to a row read here.
pub(crate) fn owner_rights(principal: &Principal, org_id: &str) -> OwnerRights {
    let resource = Resource::Org {
        organization_id: org_id,
    };
    if permits(principal, Permission::OrgManage, &resource) {
        OwnerRights::MayTouchOwners
    } else {
        OwnerRights::MayNotTouchOwners
    }
}

/// The store's failure, as the answer the caller sees.
pub(crate) fn store_error(e: &StoreError) -> ApiError {
    match e {
        StoreError::NotFound => ApiError::new(ErrorCode::NotFound),
        StoreError::Conflict => ApiError::new(ErrorCode::Conflict),
        StoreError::Db(err) => {
            tracing::error!(error = %err, "organizations store");
            ApiError::new(ErrorCode::Internal)
        }
    }
}

/// The caller's address for the audit row. The proxy sets `X-Forwarded-For`; the first entry is
/// the client. A test or a direct call may send neither, and the row keeps no address.
///
/// Not proof of anything: nothing here knows which proxies to trust, so a client that reaches the
/// server directly, or through a proxy that appends instead of overwriting, chooses this value.
pub(crate) fn ip_address(headers: &HeaderMap) -> Option<String> {
    for name in ["x-forwarded-for", "x-real-ip"] {
        if let Some(value) = headers.get(name).and_then(|v| v.to_str().ok()) {
            let first = value.split(',').next().unwrap_or_default().trim();
            if !first.is_empty() {
                return Some(first.to_owned());
            }
        }
    }
    None
}

/// The body a request needs and did not send.
pub(crate) fn missing_body() -> ApiError {
    ApiError::from(vec![FieldError::new(
        "",
        "required",
        "A JSON body is required.",
    )])
}

/// The answer to a delete.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct SuccessJson {
    pub success: bool,
}
