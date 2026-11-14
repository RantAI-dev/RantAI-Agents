//! `AuditLog`: who changed what, when and from where (§3.7).
//!
//! Every change to members, units, roles, grants, shares, identity providers and keys leaves a
//! row, written by [`record`] inside the transaction of the change itself: a change never
//! commits without its row, and a row never outlives a change that rolled back. The action names
//! the change and the resource names the row it touched (`unit:<id>`), so a reader never has to
//! parse `detail` to know what happened.
//!
//! The list is newest first by `createdAt`, then by id. The id alone would not do: the
//! TypeScript writes rows too, with cuid ids that sort after every UUIDv7 whatever their age.

use chrono::{DateTime, NaiveDateTime};
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};

use crate::{StoreResult, new_id, now};

/// Who made a change, and from which address.
#[derive(Debug, Clone, Copy)]
pub struct Actor<'a> {
    pub user_id: &'a str,
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

/// Writes one row in the caller's transaction. `action` is `org.member.role_change`,
/// `org.unit.create`, …; `resource` is `org:<id>`, `member:<id>`, `unit:<id>`; `detail` is a JSON
/// object with the facts a reader needs, never a secret (anything else is stored as `{}`).
pub(crate) async fn record(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    actor: &Actor<'_>,
    action: &str,
    resource: String,
    detail: Value,
) -> StoreResult<()> {
    let detail = if detail.is_object() {
        detail
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
    .bind(action)
    .bind(resource)
    .bind(detail)
    .bind(actor.user_id)
    .bind(actor.ip_address)
    .bind(now())
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Where a page starts: strictly after this row in the list's order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cursor {
    pub created_at: NaiveDateTime,
    pub id: String,
}

impl Cursor {
    /// The row a page ended on, as the cursor of the next page.
    #[must_use]
    pub fn after(row: &AuditRow) -> Self {
        Self {
            created_at: row.created_at,
            id: row.id.clone(),
        }
    }

    /// `<milliseconds since the epoch>.<id>`. Opaque to clients; only [`Cursor::parse`] reads it.
    #[must_use]
    pub fn encode(&self) -> String {
        format!(
            "{}.{}",
            self.created_at.and_utc().timestamp_millis(),
            self.id
        )
    }

    /// `None` for anything [`Cursor::encode`] did not produce.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let (millis, id) = text.split_once('.')?;
        let created_at = DateTime::from_timestamp_millis(millis.parse().ok()?)?.naive_utc();
        let valid = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric());
        valid.then(|| Self {
            created_at,
            id: id.to_owned(),
        })
    }
}

/// The newest rows first, at most `limit`, after `cursor` when one is given.
pub async fn list(
    db: &PgPool,
    org_id: &str,
    cursor: Option<&Cursor>,
    limit: i64,
) -> StoreResult<Vec<AuditRow>> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "AuditLog"
           WHERE "organizationId" = $1
             AND ($2::timestamp IS NULL OR ("createdAt", "id") < ($2, $3))
           ORDER BY "createdAt" DESC, "id" DESC
           LIMIT $4"#
    );
    Ok(sqlx::query_as::<_, AuditRow>(&sql)
        .bind(org_id)
        .bind(cursor.map(|c| c.created_at))
        .bind(cursor.map(|c| c.id.as_str()))
        .bind(limit)
        .fetch_all(db)
        .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cursor_reads_back_what_it_wrote_and_nothing_else() {
        let cursor = Cursor {
            created_at: now(),
            id: new_id(),
        };
        assert_eq!(Cursor::parse(&cursor.encode()), Some(cursor));
        for bad in [
            "",
            "x",
            "1.",
            ".abc",
            "abc.def",
            "1.a'b",
            "99999999999999999999.a",
        ] {
            assert_eq!(Cursor::parse(bad), None, "{bad}");
        }
    }
}
