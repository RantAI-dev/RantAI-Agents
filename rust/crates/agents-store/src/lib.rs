//! Postgres access with `sqlx`. Prisma owns the schema and migrations (`prisma/schema.prisma`);
//! this crate reads and writes the same tables and never migrates.
//!
//! Prisma conventions this crate must reproduce by hand:
//! - Table and column names are the model and field names, quoted (`"Assistant"."organizationId"`).
//! - `@default(cuid())` and `@updatedAt` are set by the Prisma client, not the database, so every
//!   insert passes an id ([`new_id`]) and every update sets `"updatedAt"`.
//! - `DateTime` is `timestamp(3) without time zone`, holding UTC.
//!
//! Queries are checked at runtime, not compile time (no `DATABASE_URL` needed to build). Every
//! query has an integration test against a migrated database: set `TEST_DATABASE_URL`.

pub mod assistants;
pub mod catalog;
pub mod memory;
pub mod orgs;
pub mod sessions;
pub mod users;

use chrono::{NaiveDateTime, Utc};

pub use sqlx::PgPool;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("not found")]
    NotFound,
    /// A concurrent writer changed the row first. The caller retries with fresh data.
    #[error("conflict")]
    Conflict,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

pub type StoreResult<T> = Result<T, StoreError>;

/// A new row id. Time-ordered, so inserts stay index-friendly.
#[must_use]
pub fn new_id() -> String {
    uuid::Uuid::now_v7().simple().to_string()
}

/// "Now" as Prisma stores it: UTC, millisecond precision.
#[must_use]
pub fn now() -> NaiveDateTime {
    let n = Utc::now().naive_utc();
    n.with_nanosecond_millis()
}

trait Millis {
    fn with_nanosecond_millis(self) -> Self;
}

impl Millis for NaiveDateTime {
    fn with_nanosecond_millis(self) -> Self {
        use chrono::Timelike;
        let ns = self.nanosecond() / 1_000_000 * 1_000_000;
        self.with_nanosecond(ns).unwrap_or(self)
    }
}
