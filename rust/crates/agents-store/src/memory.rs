//! `UserMemory` rows. The Rust port keeps only the long-term profile (one `LONG_TERM` row per user,
//! id `profile_<userId>`, key `user_profile`, as the TypeScript wrote it); working and semantic
//! memory are not ported (docs/port/differences.md). Listing and deleting still cover every type,
//! so users can see and clear rows the TypeScript left behind.

use chrono::NaiveDateTime;
use serde_json::Value;
use sqlx::PgPool;

use crate::{StoreError, StoreResult, new_id, now};

pub const PROFILE_KEY: &str = "user_profile";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemoryType {
    Working,
    Semantic,
    LongTerm,
}

impl MemoryType {
    #[must_use]
    pub const fn as_db(self) -> &'static str {
        match self {
            Self::Working => "WORKING",
            Self::Semantic => "SEMANTIC",
            Self::LongTerm => "LONG_TERM",
        }
    }

    /// Parses the API and database spelling. Anything else is `None` (a 400, not a 500).
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "WORKING" => Some(Self::Working),
            "SEMANTIC" => Some(Self::Semantic),
            "LONG_TERM" => Some(Self::LongTerm),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct MemoryRow {
    pub id: String,
    pub user_id: String,
    /// `WORKING`, `SEMANTIC` or `LONG_TERM`.
    #[sqlx(rename = "type")]
    pub kind: String,
    pub key: String,
    pub value: Value,
    pub confidence: Option<f64>,
    pub source: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub expires_at: Option<NaiveDateTime>,
}

const COLUMNS: &str = r#""id","userId","type"::text AS "type","key","value","confidence","source","createdAt","updatedAt","expiresAt""#;

#[must_use]
pub fn profile_id(user_id: &str) -> String {
    format!("profile_{user_id}")
}

/// The user's profile row and its version (`updatedAt`), or `None` if they have none yet.
pub async fn load_profile(
    db: &PgPool,
    user_id: &str,
) -> StoreResult<Option<(Value, NaiveDateTime)>> {
    let row: Option<(Value, NaiveDateTime)> = sqlx::query_as(
        r#"SELECT "value","updatedAt" FROM "UserMemory"
           WHERE "userId"=$1 AND "type"='LONG_TERM' AND "key"=$2
           ORDER BY "updatedAt" DESC LIMIT 1"#,
    )
    .bind(user_id)
    .bind(PROFILE_KEY)
    .fetch_optional(db)
    .await?;
    Ok(row)
}

/// Writes the profile if nobody else did since `expected` was read (`None` = "there was no row").
/// Returns [`StoreError::Conflict`] when another writer won; the caller reloads, re-applies its
/// change and retries. This replaces the TypeScript in-process lock, which did not hold across
/// instances.
pub async fn save_profile(
    db: &PgPool,
    user_id: &str,
    value: &Value,
    expected: Option<NaiveDateTime>,
) -> StoreResult<NaiveDateTime> {
    let ts = now();
    let written = match expected {
        None => sqlx::query(
            r#"INSERT INTO "UserMemory" ("id","userId","type","key","value","embedding","createdAt","updatedAt")
               VALUES ($1,$2,'LONG_TERM',$3,$4,'{}',$5,$5)
               ON CONFLICT ("id") DO NOTHING"#,
        )
        .bind(profile_id(user_id))
        .bind(user_id)
        .bind(PROFILE_KEY)
        .bind(value)
        .bind(ts)
        .execute(db)
        .await?
        .rows_affected(),
        Some(version) => sqlx::query(
            r#"UPDATE "UserMemory" SET "value"=$3,"updatedAt"=$4
               WHERE "userId"=$1 AND "type"='LONG_TERM' AND "key"=$2 AND "updatedAt"=$5"#,
        )
        .bind(user_id)
        .bind(PROFILE_KEY)
        .bind(value)
        .bind(ts)
        .bind(version)
        .execute(db)
        .await?
        .rows_affected(),
    };
    if written == 0 {
        return Err(StoreError::Conflict);
    }
    Ok(ts)
}

/// The user's rows, newest first, at most `limit`.
pub async fn list(
    db: &PgPool,
    user_id: &str,
    kind: Option<MemoryType>,
    limit: i64,
) -> StoreResult<Vec<MemoryRow>> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "UserMemory"
           WHERE "userId"=$1 AND ($2::text IS NULL OR "type"::text=$2)
           ORDER BY "updatedAt" DESC LIMIT $3"#
    );
    Ok(sqlx::query_as::<_, MemoryRow>(&sql)
        .bind(user_id)
        .bind(kind.map(MemoryType::as_db))
        .bind(limit)
        .fetch_all(db)
        .await?)
}

/// Row counts per type for the user.
pub async fn counts(db: &PgPool, user_id: &str) -> StoreResult<Vec<(String, i64)>> {
    Ok(sqlx::query_as(
        r#"SELECT "type"::text, COUNT(*) FROM "UserMemory" WHERE "userId"=$1 GROUP BY "type" ORDER BY 1"#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?)
}

/// Deletes one row, only if it belongs to the user. Someone else's id is `NotFound`, not
/// "forbidden": the caller must not learn that the id exists.
pub async fn delete_one(db: &PgPool, user_id: &str, id: &str) -> StoreResult<()> {
    let done = sqlx::query(r#"DELETE FROM "UserMemory" WHERE "id"=$1 AND "userId"=$2"#)
        .bind(id)
        .bind(user_id)
        .execute(db)
        .await?;
    if done.rows_affected() == 0 {
        return Err(StoreError::NotFound);
    }
    Ok(())
}

/// Deletes all of the user's rows of one type (or of every type). Returns how many.
pub async fn delete_all(db: &PgPool, user_id: &str, kind: Option<MemoryType>) -> StoreResult<u64> {
    Ok(sqlx::query(
        r#"DELETE FROM "UserMemory" WHERE "userId"=$1 AND ($2::text IS NULL OR "type"::text=$2)"#,
    )
    .bind(user_id)
    .bind(kind.map(MemoryType::as_db))
    .execute(db)
    .await?
    .rows_affected())
}

/// Not used by the profile path; kept so tests and tools can seed rows of any type.
pub async fn insert_raw(
    db: &PgPool,
    user_id: &str,
    kind: MemoryType,
    key: &str,
    value: &Value,
) -> StoreResult<String> {
    let id = new_id();
    let ts = now();
    sqlx::query(
        r#"INSERT INTO "UserMemory" ("id","userId","type","key","value","embedding","createdAt","updatedAt")
           VALUES ($1,$2,$3::"MemoryType",$4,$5,'{}',$6,$6)"#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(kind.as_db())
    .bind(key)
    .bind(value)
    .bind(ts)
    .execute(db)
    .await?;
    Ok(id)
}
