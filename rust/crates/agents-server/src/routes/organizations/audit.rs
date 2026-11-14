//! `GET /api/organizations/{id}/audit` — every change to the organisation, newest first.
//!
//! New in the port (design §3.7). The list is cursor-paginated by the row id, which is opaque to
//! the caller and time-ordered, so no row is skipped when one is written during a page read.

use axum::Json;
use axum::extract::{Path, Query, State};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use agents_core::authz::Permission;
use agents_core::validation::FieldError;
use agents_store::audit::AuditRow;

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::time::iso;

use super::{ensure_org, principal, store_error};

/// How many rows a page returns when the caller names no `limit`.
const DEFAULT_LIMIT: i64 = 50;
/// The most rows one page returns. A larger `limit` is lowered to this.
const MAX_LIMIT: i64 = 100;

#[derive(Debug, Clone, Deserialize)]
pub(super) struct AuditQuery {
    limit: Option<String>,
    cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AuditJson {
    id: String,
    action: String,
    resource: String,
    detail: Value,
    user_id: Option<String>,
    ip_address: Option<String>,
    risk_level: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AuditPageJson {
    data: Vec<AuditJson>,
    next_cursor: Option<String>,
}

fn page_json(row: &AuditRow) -> AuditJson {
    AuditJson {
        id: row.id.clone(),
        action: row.action.clone(),
        resource: row.resource.clone(),
        detail: row.detail.clone(),
        user_id: row.user_id.clone(),
        ip_address: row.ip_address.clone(),
        risk_level: row.risk_level.clone(),
        created_at: iso(row.created_at),
    }
}

fn parse_limit(raw: Option<&str>) -> Result<i64, ApiError> {
    let Some(text) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(DEFAULT_LIMIT);
    };
    let Ok(limit) = text.parse::<i64>() else {
        return Err(ApiError::from(vec![FieldError::new(
            "limit",
            "invalid_format",
            "The limit must be a whole number.",
        )]));
    };
    if limit < 0 {
        return Err(ApiError::from(vec![FieldError::new(
            "limit",
            "out_of_range",
            "The limit must be a positive whole number.",
        )]));
    }
    // The conventions: a larger value is lowered to the maximum, a negative one is a 400.
    if limit == 0 {
        return Ok(DEFAULT_LIMIT);
    }
    Ok(limit.min(MAX_LIMIT))
}

/// `GET /api/organizations/{id}/audit?limit=50&cursor=…`
pub(super) async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<String>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<AuditPageJson>, ApiError> {
    let member = principal(&state, &user, &id).await?;
    ensure_org(&member, Permission::OrgAuditRead, &id)?;
    let limit = parse_limit(query.limit.as_deref())?;
    let cursor = query.cursor.as_deref().filter(|c| !c.is_empty());
    // One more than asked, to know whether another page exists.
    let rows = agents_store::audit::list(&state.db, &id, cursor, limit + 1)
        .await
        .map_err(|e| store_error(&e))?;
    let more = rows.len() > usize::try_from(limit).unwrap_or(usize::MAX);
    let page: Vec<&AuditRow> = rows
        .iter()
        .take(usize::try_from(limit).unwrap_or(0))
        .collect();
    let next_cursor = if more {
        page.last().map(|row| row.id.clone())
    } else {
        None
    };
    Ok(Json(AuditPageJson {
        data: page.iter().map(|row| page_json(row)).collect(),
        next_cursor,
    }))
}
