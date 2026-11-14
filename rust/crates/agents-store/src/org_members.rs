//! `OrganizationMember`: invited, accepted, promoted and removed members.
//!
//! Two rules need more than one row, so they live in a transaction:
//!
//! - **At least one owner.** Demoting or removing the last owner is [`StoreError::Conflict`].
//!   The transaction locks the organisation's owner rows (`SELECT … FOR UPDATE`, ordered by id)
//!   before it counts them, so two admins demoting the two owners at once leave one owner:
//!   the second transaction waits, then sees one owner and refuses
//!   (`tests/org_members.rs` fires both at once).
//! - **Only owners make or unmake owners.** The caller's permission decides that before it gets
//!   here (`authz::authorize` with `org.manage`); this module cannot see who is calling.
//!
//! Nothing here checks a permission.

use chrono::NaiveDateTime;
use sqlx::{PgPool, Postgres, Transaction};

use crate::{StoreError, StoreResult, new_id, now, orgs};

/// One membership row. A pending invite has an `accepted_at` of `None` and a `user_id` that is
/// either the invitee's real id or a `pending-…` placeholder.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct MemberRow {
    pub id: String,
    #[sqlx(rename = "userId")]
    pub user_id: String,
    #[sqlx(rename = "userEmail")]
    pub email: String,
    #[sqlx(rename = "userName")]
    pub name: Option<String>,
    /// `owner`, `admin`, `member` or `viewer`.
    pub role: String,
    #[sqlx(rename = "invitedBy")]
    pub invited_by: Option<String>,
    #[sqlx(rename = "invitedAt")]
    pub invited_at: NaiveDateTime,
    #[sqlx(rename = "acceptedAt")]
    pub accepted_at: Option<NaiveDateTime>,
}

impl MemberRow {
    /// Whether the invite has not been accepted yet.
    #[must_use]
    pub const fn is_pending(&self) -> bool {
        self.accepted_at.is_none()
    }

    /// Whether this row is one of the organisation's owners.
    #[must_use]
    pub fn is_owner(&self) -> bool {
        self.role == "owner"
    }
}

/// One unit a member is directly in, as the member list shows it.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct UnitMembershipRow {
    #[sqlx(rename = "unitId")]
    pub unit_id: String,
    #[sqlx(rename = "userId")]
    pub user_id: String,
    /// `lead` or `member`.
    pub role: String,
    /// `manual` or `idp`.
    pub source: String,
}

const COLUMNS: &str =
    r#""id","userId","userEmail","userName","role","invitedBy","invitedAt","acceptedAt""#;

/// Every membership, pending ones included, with the accepted roles first.
pub async fn list(db: &PgPool, org_id: &str) -> StoreResult<Vec<MemberRow>> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "OrganizationMember" WHERE "organizationId" = $1
           ORDER BY "acceptedAt" NULLS LAST, "invitedAt" ASC, "id" ASC"#
    );
    Ok(sqlx::query_as::<_, MemberRow>(&sql)
        .bind(org_id)
        .fetch_all(db)
        .await?)
}

/// Every direct unit membership of the organisation, for the member list.
pub async fn unit_memberships(db: &PgPool, org_id: &str) -> StoreResult<Vec<UnitMembershipRow>> {
    Ok(sqlx::query_as::<_, UnitMembershipRow>(
        r#"SELECT "unitId","userId","role","source" FROM "OrgUnitMember"
           WHERE "organizationId" = $1 ORDER BY "unitId" ASC, "userId" ASC"#,
    )
    .bind(org_id)
    .fetch_all(db)
    .await?)
}

pub async fn get(db: &PgPool, org_id: &str, member_id: &str) -> StoreResult<MemberRow> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "OrganizationMember"
           WHERE "id" = $1 AND "organizationId" = $2"#
    );
    sqlx::query_as::<_, MemberRow>(&sql)
        .bind(member_id)
        .bind(org_id)
        .fetch_optional(db)
        .await?
        .ok_or(StoreError::NotFound)
}

/// Creates a pending invite. An address already invited to, or belonging to, this organisation is
/// [`StoreError::Conflict`]. A user who already has an account is named by their real id now; the
/// row still waits for their acceptance.
pub async fn invite(
    db: &PgPool,
    org_id: &str,
    email: &str,
    role: &str,
    invited_by: &str,
) -> StoreResult<MemberRow> {
    let mut tx = db.begin().await?;
    let already = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "OrganizationMember"
             WHERE "organizationId" = $1 AND lower("userEmail") = lower($2))"#,
    )
    .bind(org_id)
    .bind(email)
    .fetch_one(&mut *tx)
    .await?;
    if already {
        return Err(StoreError::Conflict);
    }
    let user = sqlx::query_as::<_, (String, Option<String>)>(
        r#"SELECT "id", "name" FROM "Agent" WHERE lower("email") = lower($1)"#,
    )
    .bind(email)
    .fetch_optional(&mut *tx)
    .await?;
    let (user_id, name) = match user {
        Some((id, name)) => (id, name),
        None => (orgs::pending_id("pending-"), None),
    };
    let ts = now();
    let sql = format!(
        r#"INSERT INTO "OrganizationMember"
             ("id","userId","userEmail","userName","organizationId","role","invitedBy","invitedAt","acceptedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL) RETURNING {COLUMNS}"#
    );
    let row = sqlx::query_as::<_, MemberRow>(&sql)
        .bind(new_id())
        .bind(user_id)
        .bind(email)
        .bind(name)
        .bind(org_id)
        .bind(role)
        .bind(invited_by)
        .bind(ts)
        .fetch_one(&mut *tx)
        .await;
    match row {
        Ok(row) => {
            tx.commit().await?;
            Ok(row)
        }
        Err(e) if orgs::is_unique_violation(&e) => Err(StoreError::Conflict),
        Err(e) => Err(StoreError::Db(e)),
    }
}

/// Accepts the pending invite addressed to `email`, or one already naming this user.
///
/// `None` when this organisation has no pending invite for that address or user; the caller's
/// own address or id, so nobody accepts somebody else's. [`StoreError::Conflict`] when this user
/// is already a member.
pub async fn accept_invite(
    db: &PgPool,
    org_id: &str,
    user_id: &str,
    email: Option<&str>,
) -> StoreResult<MemberRow> {
    let sql = format!(
        r#"UPDATE "OrganizationMember"
           SET "userId" = $3,
               "acceptedAt" = $4,
               "userName" = COALESCE("userName", (SELECT "name" FROM "Agent" WHERE "id" = $3))
           WHERE "organizationId" = $1 AND "acceptedAt" IS NULL
             AND ("userId" = $3 OR ($2::text IS NOT NULL AND lower("userEmail") = lower($2)))
           RETURNING {COLUMNS}"#
    );
    let result = sqlx::query_as::<_, MemberRow>(&sql)
        .bind(org_id)
        .bind(email)
        .bind(user_id)
        .bind(now())
        .fetch_optional(db)
        .await;
    match result {
        Ok(row) => row.ok_or(StoreError::NotFound),
        Err(e) if orgs::is_unique_violation(&e) => Err(StoreError::Conflict),
        Err(e) => Err(StoreError::Db(e)),
    }
}

/// Locks the organisation's owner rows for this transaction and returns their ids.
///
/// The order is fixed so two writers take the same locks in the same order and cannot deadlock.
/// Under READ COMMITTED the select is re-checked after it waits, so a row the other writer has
/// already demoted no longer counts.
async fn lock_owners(tx: &mut Transaction<'_, Postgres>, org_id: &str) -> StoreResult<Vec<String>> {
    Ok(sqlx::query_scalar::<_, String>(
        r#"SELECT "id" FROM "OrganizationMember"
           WHERE "organizationId" = $1 AND "role" = 'owner' ORDER BY "id" FOR UPDATE"#,
    )
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?)
}

async fn in_transaction(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    member_id: &str,
) -> StoreResult<MemberRow> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "OrganizationMember"
           WHERE "id" = $1 AND "organizationId" = $2"#
    );
    sqlx::query_as::<_, MemberRow>(&sql)
        .bind(member_id)
        .bind(org_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::NotFound)
}

/// Sets a member's role. Demoting the last owner is [`StoreError::Conflict`].
pub async fn change_role(
    db: &PgPool,
    org_id: &str,
    member_id: &str,
    role: &str,
) -> StoreResult<MemberRow> {
    let mut tx = db.begin().await?;
    let owners = lock_owners(&mut tx, org_id).await?;
    let target = in_transaction(&mut tx, org_id, member_id).await?;
    if target.is_owner() && role != "owner" && owners.len() <= 1 {
        return Err(StoreError::Conflict);
    }
    let sql = format!(
        r#"UPDATE "OrganizationMember" SET "role" = $3
           WHERE "id" = $1 AND "organizationId" = $2 RETURNING {COLUMNS}"#
    );
    let row = sqlx::query_as::<_, MemberRow>(&sql)
        .bind(member_id)
        .bind(org_id)
        .bind(role)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// Removes a member with their direct unit memberships. Removing the last owner is
/// [`StoreError::Conflict`].
pub async fn remove(db: &PgPool, org_id: &str, member_id: &str) -> StoreResult<MemberRow> {
    let mut tx = db.begin().await?;
    let owners = lock_owners(&mut tx, org_id).await?;
    let target = in_transaction(&mut tx, org_id, member_id).await?;
    if target.is_owner() && owners.len() <= 1 {
        return Err(StoreError::Conflict);
    }
    sqlx::query(r#"DELETE FROM "OrgUnitMember" WHERE "organizationId" = $1 AND "userId" = $2"#)
        .bind(org_id)
        .bind(&target.user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(r#"DELETE FROM "OrganizationMember" WHERE "id" = $1 AND "organizationId" = $2"#)
        .bind(member_id)
        .bind(org_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(target)
}
