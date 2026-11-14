//! `AuditLog`: who changed what, when and from where (§3.7).
//!
//! Every change to members, units, roles, grants, shares, identity providers and keys leaves a
//! row. The row is written after the change in the same request; the action names the change and
//! the resource names the row it touched (`unit:<id>`), so a reader never has to parse `detail`
//! to know what happened.
//!
//! The list is newest first by id. Ids are time-ordered (UUIDv7 here, cuid from the TypeScript),
//! so the id is also the cursor: it is opaque to clients and cannot skip a row.

use chrono::NaiveDateTime;
use serde_json::{Value, json};
use sqlx::PgPool;

use crate::{StoreResult, new_id, now};

/// One change to write. `detail` is a JSON object with the facts a reader needs, never a secret.
#[derive(Debug, Clone)]
pub struct NewAudit<'a> {
    /// `org.member.role_change`, `org.unit.create`, …
    pub action: &'a str,
    /// `org:<id>`, `member:<id>`, `unit:<id>`, `user:<id>`.
    pub resource: String,
    pub detail: Value,
    pub user_id: Option<&'a str>,
    pub ip_address: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct AuditRow {
    pub id: String,
    pub action: String,
    pub resource: String,
    pub detail: Value,
    pub user_id: Option<String>,
    pub ip_address: Option<String>,
    pub risk_level: String,
    pub created_at: NaiveDateTime,
}

const COLUMNS: &str =
    r#""id","action","resource","detail","userId","ipAddress","riskLevel","createdAt""#;

/// Writes one row. A missing `detail` is an empty object, as the column's default.
pub async fn write(db: &PgPool, org_id: &str, entry: &NewAudit<'_>) -> StoreResult<()> {
    let detail = if entry.detail.is_object() {
        entry.detail.clone()
    } else {
        json!({})
    };
    sqlx::query(
        r#"INSERT INTO "AuditLog"
             ("id","organizationId","action","resource","detail","userId","ipAddress","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"#,
    )
    .bind(new_id())
    .bind(org_id)
    .bind(entry.action)
    .bind(&entry.resource)
    .bind(&detail)
    .bind(entry.user_id)
    .bind(entry.ip_address)
    .bind(now())
    .execute(db)
    .await?;
    Ok(())
}

/// The newest rows first, at most `limit`, before the row `before` when one is given.
pub async fn list(
    db: &PgPool,
    org_id: &str,
    before: Option<&str>,
    limit: i64,
) -> StoreResult<Vec<AuditRow>> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "AuditLog"
           WHERE "organizationId" = $1
             AND ($2::text IS NULL OR "id" < $2)
           ORDER BY "id" DESC
           LIMIT $3"#
    );
    Ok(sqlx::query_as::<_, AuditRow>(&sql)
        .bind(org_id)
        .bind(before)
        .bind(limit)
        .fetch_all(db)
        .await?)
}
