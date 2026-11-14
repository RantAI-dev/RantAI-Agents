//! The `User` model (table `"Agent"`): only what request authentication needs.

use sqlx::PgPool;

use crate::StoreResult;

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct UserStatus {
    /// `USER` or `ADMIN` (the platform role, not the organisation role).
    pub role: String,
    pub suspended: bool,
    /// The name the user is shown under. The `{{user_name}}` prompt variable resolves to it.
    pub name: Option<String>,
}

/// The user's platform role and whether a platform admin suspended them. `None` if the user
/// no longer exists.
pub async fn status(db: &PgPool, user_id: &str) -> StoreResult<Option<UserStatus>> {
    Ok(sqlx::query_as::<_, UserStatus>(
        r#"SELECT "role"::text AS role, ("suspendedAt" IS NOT NULL) AS suspended, "name"
           FROM "Agent" WHERE "id" = $1"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?)
}

/// What a password sign-in needs to know about the user with this email.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct LoginUser {
    pub id: String,
    pub email: String,
    pub name: String,
    /// `USER` or `ADMIN`.
    pub role: String,
    /// `None` for a user who signs in only through an identity provider.
    pub password_hash: Option<String>,
    pub suspended: bool,
}

/// The user with exactly this email, as `prisma.user.findUnique({ where: { email } })` finds it.
pub async fn for_login(db: &PgPool, email: &str) -> StoreResult<Option<LoginUser>> {
    Ok(sqlx::query_as::<_, LoginUser>(
        r#"SELECT "id", "email", "name", "role"::text AS role, "passwordHash" AS password_hash,
                  ("suspendedAt" IS NOT NULL) AS suspended
           FROM "Agent" WHERE "email" = $1"#,
    )
    .bind(email)
    .fetch_optional(db)
    .await?)
}

/// Marks the user active now, as both TypeScript login paths do.
pub async fn touch_last_active(db: &PgPool, user_id: &str) -> StoreResult<()> {
    sqlx::query(r#"UPDATE "Agent" SET "lastActiveAt" = $2 WHERE "id" = $1"#)
        .bind(user_id)
        .bind(crate::now())
        .execute(db)
        .await?;
    Ok(())
}
