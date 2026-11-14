//! Organisations: the rows themselves and who belongs to which organisation.
//!
//! The member writes that must keep at least one owner live in [`crate::org_members`]; the audit
//! rows they leave behind live in [`crate::audit`]. Nothing here checks a permission: callers do
//! that first with `agents_core::authz::authorize`.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use crate::{StoreError, StoreResult, new_id, now};

/// One organisation, as its settings read it.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct OrgRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub logo_url: Option<String>,
    /// `false`: members sign in only through one of the organisation's identity providers.
    pub password_login_enabled: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// One of the caller's organisations, with the role they hold in it.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct OrgMembershipRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    #[sqlx(rename = "logoUrl")]
    pub logo_url: Option<String>,
    pub role: String,
    #[sqlx(rename = "createdAt")]
    pub created_at: NaiveDateTime,
    #[sqlx(rename = "joinedAt")]
    pub joined_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct Membership {
    #[sqlx(rename = "organizationId")]
    pub organization_id: String,
    /// `owner`, `admin`, `member` or `viewer`.
    pub role: String,
}

/// The caller's accepted membership in `org_id`, if any. Pending invites do not count.
pub async fn membership(
    db: &PgPool,
    user_id: &str,
    org_id: &str,
) -> StoreResult<Option<Membership>> {
    Ok(sqlx::query_as::<_, Membership>(
        r#"SELECT "organizationId", role FROM "OrganizationMember"
           WHERE "userId" = $1 AND "organizationId" = $2 AND "acceptedAt" IS NOT NULL"#,
    )
    .bind(user_id)
    .bind(org_id)
    .fetch_optional(db)
    .await?)
}

/// The organisation used when the caller names none: the earliest accepted membership.
pub async fn default_membership(db: &PgPool, user_id: &str) -> StoreResult<Option<Membership>> {
    Ok(sqlx::query_as::<_, Membership>(
        r#"SELECT "organizationId", role FROM "OrganizationMember"
           WHERE "userId" = $1 AND "acceptedAt" IS NOT NULL
           ORDER BY "acceptedAt" ASC LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?)
}

/// Every organisation the caller has accepted, by name. A pending invite is not listed.
pub async fn list_for_user(db: &PgPool, user_id: &str) -> StoreResult<Vec<OrgMembershipRow>> {
    Ok(sqlx::query_as::<_, OrgMembershipRow>(
        r#"SELECT o."id", o."name", o."slug", o."logoUrl", m."role",
                  o."createdAt", m."acceptedAt" AS "joinedAt"
           FROM "OrganizationMember" m
           JOIN "Organization" o ON o."id" = m."organizationId"
           WHERE m."userId" = $1 AND m."acceptedAt" IS NOT NULL
           ORDER BY o."name" ASC, o."id" ASC"#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?)
}

pub async fn get(db: &PgPool, org_id: &str) -> StoreResult<OrgRow> {
    sqlx::query_as::<_, OrgRow>(
        r#"SELECT "id","name","slug","logoUrl","passwordLoginEnabled","createdAt","updatedAt"
           FROM "Organization" WHERE "id" = $1"#,
    )
    .bind(org_id)
    .fetch_optional(db)
    .await?
    .ok_or(StoreError::NotFound)
}

/// What a settings change asks for. `None` keeps the column as it is.
#[derive(Debug, Clone, Copy, Default)]
pub struct OrgChanges<'a> {
    pub name: Option<&'a str>,
    pub slug: Option<&'a str>,
    pub password_login_enabled: Option<bool>,
}

/// Changes the organisation's settings. A slug another organisation already uses is `Conflict`.
pub async fn update(db: &PgPool, org_id: &str, changes: &OrgChanges<'_>) -> StoreResult<OrgRow> {
    let result = sqlx::query_as::<_, OrgRow>(
        r#"UPDATE "Organization"
           SET "name" = COALESCE($2, "name"),
               "slug" = COALESCE($3, "slug"),
               "passwordLoginEnabled" = COALESCE($4, "passwordLoginEnabled"),
               "updatedAt" = $5
           WHERE "id" = $1
           RETURNING "id","name","slug","logoUrl","passwordLoginEnabled","createdAt","updatedAt""#,
    )
    .bind(org_id)
    .bind(changes.name)
    .bind(changes.slug)
    .bind(changes.password_login_enabled)
    .bind(now())
    .fetch_optional(db)
    .await;
    match result {
        Ok(row) => row.ok_or(StoreError::NotFound),
        // The unique key on the slug. Checking first would still race another writer.
        Err(e) if is_unique_violation(&e) => Err(StoreError::Conflict),
        Err(e) => Err(StoreError::Db(e)),
    }
}

/// Whether the database refused a write because a unique key already holds the value.
pub(crate) fn is_unique_violation(e: &sqlx::Error) -> bool {
    e.as_database_error()
        .is_some_and(|d| d.is_unique_violation())
}

/// A new id for a row that is not tied to a user yet (a pending invite).
pub(crate) fn pending_id(prefix: &str) -> String {
    format!("{prefix}{}", new_id())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pending_id_is_prefixed_and_unique() {
        let a = pending_id("pending-");
        let b = pending_id("pending-");
        assert!(a.starts_with("pending-") && b.starts_with("pending-"));
        assert_ne!(a, b);
    }
}
