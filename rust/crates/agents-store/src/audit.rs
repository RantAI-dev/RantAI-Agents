//! `AuditLog`: every change to members, units, roles, grants, shares, identity providers and
//! keys leaves a row (docs/design/identity-and-access.md §3.7).
//!
//! The row is written after the change it describes, in the same request. It is not in the
//! change's transaction: a rollback of the audit write must not roll back the change, and a
//! change that committed must be visible in the trail even if the request dies before it
//! answers. A missing row is therefore a bug the trail cannot show; see
//! `crates/agents-server/tests/agent_rbac_grants.rs` for the read-back.

use serde_json::Value;
use sqlx::PgPool;

use crate::{StoreResult, new_id, now};

/// One row of the trail.
#[derive(Debug, Clone)]
pub struct Entry<'a> {
    pub organization_id: &'a str,
    /// The actor, when a person made the change.
    pub user_id: Option<&'a str>,
    /// The catalogued action, e.g. `rbac.grant.set`.
    pub action: &'a str,
    /// What it was done to, e.g. `assistant:<id>`.
    pub resource: &'a str,
    /// The change itself, as JSON.
    pub detail: &'a Value,
    pub ip_address: Option<&'a str>,
}

/// Writes one row of the trail.
pub async fn record(db: &PgPool, entry: &Entry<'_>) -> StoreResult<()> {
    sqlx::query(
        r#"INSERT INTO "AuditLog" ("id","organizationId","userId","action","resource","detail",
             "ipAddress","riskLevel","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'low',$8)"#,
    )
    .bind(new_id())
    .bind(entry.organization_id)
    .bind(entry.user_id)
    .bind(entry.action)
    .bind(entry.resource)
    .bind(entry.detail)
    .bind(entry.ip_address)
    .bind(now())
    .execute(db)
    .await?;
    Ok(())
}
