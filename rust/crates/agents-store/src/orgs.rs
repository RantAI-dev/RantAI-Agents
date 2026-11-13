//! Organisation membership: who belongs to which organisation, with which role.

use sqlx::PgPool;

use crate::StoreResult;

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
