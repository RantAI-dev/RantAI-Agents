//! `AuditLog` rows (docs/design/identity-and-access.md §3.7): who did what, from which address.
//!
//! The detail never holds a secret or a token; callers pass ids and flags only.

use serde_json::Value;
use sqlx::{Executor, Postgres};

use crate::{StoreResult, new_id, now};

#[derive(Debug, Clone)]
pub struct AuditEntry<'a> {
    pub organization_id: &'a str,
    pub user_id: Option<&'a str>,
    /// `sso.login`, `auth.login`, `sso.provider.create`, …
    pub action: &'a str,
    /// `user:<id>`, `identity_provider:<id>`, …
    pub resource: &'a str,
    pub detail: Value,
    pub ip_address: Option<&'a str>,
    /// `low`, `medium`, `high` or `critical`.
    pub risk_level: &'a str,
}

/// Writes one row, inside the caller's transaction when it passes one.
pub async fn record<'e, E>(exec: E, entry: &AuditEntry<'_>) -> StoreResult<()>
where
    E: Executor<'e, Database = Postgres>,
{
    sqlx::query(
        r#"INSERT INTO "AuditLog" ("id","organizationId","userId","action","resource","detail","ipAddress","riskLevel","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"#,
    )
    .bind(new_id())
    .bind(entry.organization_id)
    .bind(entry.user_id)
    .bind(entry.action)
    .bind(entry.resource)
    .bind(&entry.detail)
    .bind(entry.ip_address)
    .bind(entry.risk_level)
    .bind(now())
    .execute(exec)
    .await?;
    Ok(())
}
