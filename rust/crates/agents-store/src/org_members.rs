//! `OrganizationMember`: invited, accepted, promoted and removed members.
//!
//! Two rules need more than one row, so they are decided inside the write's transaction, on
//! locked rows:
//!
//! - **At least one owner.** Demoting or removing the last owner is [`StoreError::Conflict`].
//!   The transaction locks the organisation's owner rows (`SELECT … FOR UPDATE`, ordered by id)
//!   before it counts them, so two owners demoting each other at once leave one owner.
//! - **Only owners make or unmake owners.** The caller says what it may do
//!   ([`OwnerRights`], from `authz::authorize` with `org.manage`), and the rule is applied to the
//!   target row as locked here, not as the caller read it earlier: a member promoted to owner
//!   while an admin's request was on its way is refused to that admin
//!   (`agents-server/tests/org_admin_owners.rs` parks the request behind the lock).
//!
//! Every write records its `AuditLog` row in the same transaction.

use chrono::NaiveDateTime;
use sqlx::{PgPool, Postgres, Transaction};

use serde_json::json;

use crate::audit::{self, Actor};
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

/// Creates a pending invite. An address already invited to, or belonging to, this organisation is
/// [`StoreError::Conflict`]. A user who already has an account is named by their real id now; the
/// row still waits for their acceptance.
pub async fn invite(
    db: &PgPool,
    org_id: &str,
    email: &str,
    role: &str,
    actor: &Actor<'_>,
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
        None => (orgs::pending_id(PENDING_PREFIX), None),
    };
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
        .bind(actor.user_id)
        .bind(now())
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_on_unique)?;
    audit::record(
        &mut tx,
        org_id,
        actor,
        "org.member.invite",
        format!("member:{}", row.id),
        json!({ "email": row.email, "role": row.role }),
    )
    .await?;
    tx.commit().await?;
    Ok(row)
}

/// The prefix of the `userId` of an invite sent to an address nobody has an account for yet.
const PENDING_PREFIX: &str = "pending-";

/// Accepts the pending invite of the caller (`actor.user_id`) to this organisation.
///
/// The invite is the caller's when it names their user id, or when it names nobody yet (a
/// `pending-…` placeholder) and its address is the caller's address as stored now. The address in
/// a session token is not used: it is as old as the sign-in. An invite already naming another
/// account stays that account's, whoever holds its address today.
///
/// [`StoreError::NotFound`] when there is no such invite (another organisation's included);
/// [`StoreError::Conflict`] when this user is already a member.
pub async fn accept_invite(db: &PgPool, org_id: &str, actor: &Actor<'_>) -> StoreResult<MemberRow> {
    let mut tx = db.begin().await?;
    let sql = format!(
        r#"UPDATE "OrganizationMember"
           SET "userId" = $2,
               "acceptedAt" = $3,
               "userName" = COALESCE("userName", (SELECT "name" FROM "Agent" WHERE "id" = $2))
           WHERE "id" = (
             SELECT "id" FROM "OrganizationMember"
             WHERE "organizationId" = $1 AND "acceptedAt" IS NULL
               AND ("userId" = $2
                    OR (starts_with("userId", $4)
                        AND lower("userEmail") = (SELECT lower("email") FROM "Agent" WHERE "id" = $2)))
             ORDER BY ("userId" = $2) DESC, "invitedAt" ASC, "id" ASC
             LIMIT 1
           )
           RETURNING {COLUMNS}"#
    );
    let row = sqlx::query_as::<_, MemberRow>(&sql)
        .bind(org_id)
        .bind(actor.user_id)
        .bind(now())
        .bind(PENDING_PREFIX)
        .fetch_optional(&mut *tx)
        .await
        .map_err(conflict_on_unique)?
        .ok_or(StoreError::NotFound)?;
    audit::record(
        &mut tx,
        org_id,
        actor,
        "org.member.accept",
        format!("member:{}", row.id),
        json!({ "email": row.email }),
    )
    .await?;
    tx.commit().await?;
    Ok(row)
}

fn conflict_on_unique(e: sqlx::Error) -> StoreError {
    if orgs::is_unique_violation(&e) {
        StoreError::Conflict
    } else {
        StoreError::Db(e)
    }
}

/// Whether the caller may make, unmake or remove an owner: `org.manage`, which only an owner
/// holds. Decided by `authz::authorize` before the call; applied here to the locked row.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OwnerRights {
    MayTouchOwners,
    MayNotTouchOwners,
}

/// What a role change or a removal did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemberWrite<T> {
    Done(T),
    /// The target is an owner, or would become one, and the caller may not touch owners.
    /// Nothing was written.
    OwnersOnly,
}

/// Locks the organisation's owner rows, then the target row, for this transaction.
///
/// Returns the target as locked and the number of owners. The owner rows are taken in a fixed
/// order, so two writers cannot deadlock; since an organisation always has an owner, every
/// writer in this module queues there, and the target read after it is the role as committed.
/// The target's own lock covers writers outside this module. A target that became an owner
/// after the owner rows were read is counted too.
async fn lock_target(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    member_id: &str,
) -> StoreResult<(MemberRow, usize)> {
    let owners = sqlx::query_scalar::<_, String>(
        r#"SELECT "id" FROM "OrganizationMember"
           WHERE "organizationId" = $1 AND "role" = 'owner' ORDER BY "id" FOR UPDATE"#,
    )
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?;
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "OrganizationMember"
           WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE"#
    );
    let target = sqlx::query_as::<_, MemberRow>(&sql)
        .bind(member_id)
        .bind(org_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::NotFound)?;
    let late_owner = target.is_owner() && !owners.contains(&target.id);
    Ok((target, owners.len() + usize::from(late_owner)))
}

/// Sets a member's role; on success returns the row before and after. Demoting the last owner
/// is [`StoreError::Conflict`].
pub async fn change_role(
    db: &PgPool,
    org_id: &str,
    member_id: &str,
    role: &str,
    rights: OwnerRights,
    actor: &Actor<'_>,
) -> StoreResult<MemberWrite<(MemberRow, MemberRow)>> {
    let mut tx = db.begin().await?;
    let (before, owners) = lock_target(&mut tx, org_id, member_id).await?;
    if (before.is_owner() || role == "owner") && rights == OwnerRights::MayNotTouchOwners {
        return Ok(MemberWrite::OwnersOnly);
    }
    if before.is_owner() && role != "owner" && owners <= 1 {
        return Err(StoreError::Conflict);
    }
    let sql = format!(
        r#"UPDATE "OrganizationMember" SET "role" = $3
           WHERE "id" = $1 AND "organizationId" = $2 RETURNING {COLUMNS}"#
    );
    let after = sqlx::query_as::<_, MemberRow>(&sql)
        .bind(member_id)
        .bind(org_id)
        .bind(role)
        .fetch_one(&mut *tx)
        .await?;
    audit::record(
        &mut tx,
        org_id,
        actor,
        "org.member.role_change",
        format!("member:{}", after.id),
        json!({ "from": before.role, "to": after.role, "email": after.email }),
    )
    .await?;
    tx.commit().await?;
    Ok(MemberWrite::Done((before, after)))
}

/// Removes a member with their direct unit memberships. Removing the last owner is
/// [`StoreError::Conflict`].
pub async fn remove(
    db: &PgPool,
    org_id: &str,
    member_id: &str,
    rights: OwnerRights,
    actor: &Actor<'_>,
) -> StoreResult<MemberWrite<MemberRow>> {
    let mut tx = db.begin().await?;
    let (target, owners) = lock_target(&mut tx, org_id, member_id).await?;
    if target.is_owner() {
        if rights == OwnerRights::MayNotTouchOwners {
            return Ok(MemberWrite::OwnersOnly);
        }
        if owners <= 1 {
            return Err(StoreError::Conflict);
        }
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
    audit::record(
        &mut tx,
        org_id,
        actor,
        "org.member.remove",
        format!("member:{}", target.id),
        json!({ "email": target.email, "role": target.role }),
    )
    .await?;
    tx.commit().await?;
    Ok(MemberWrite::Done(target))
}
