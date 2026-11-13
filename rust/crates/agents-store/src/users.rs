//! The `User` model (table `"Agent"`): only what request authentication needs.

use sqlx::PgPool;

use crate::StoreResult;

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct UserStatus {
    /// `USER` or `ADMIN` (the platform role, not the organisation role).
    pub role: String,
    pub suspended: bool,
}

/// The user's platform role and whether a platform admin suspended them. `None` if the user
/// no longer exists.
pub async fn status(db: &PgPool, user_id: &str) -> StoreResult<Option<UserStatus>> {
    Ok(sqlx::query_as::<_, UserStatus>(
        r#"SELECT "role"::text AS role, ("suspendedAt" IS NOT NULL) AS suspended FROM "Agent" WHERE "id" = $1"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?)
}
