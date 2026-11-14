//! The pending tool approvals of live chats (`"ChatToolApproval"`).
//!
//! Old: the in-process `Map`s of `src/lib/tools/approval.ts` (`pending` and `early`). The rows
//! live in Postgres so the decision may reach another instance than the stream
//! (docs/port/differences.md, row 2). One row per tool call and user:
//!
//! - the stream writes it `pending` ([`open`]), reads it until it is decided ([`poll`]) and
//!   deletes it ([`close`]);
//! - the decision route sets `approved` or `denied` ([`decide`]). A decision that arrives
//!   before the stream waits is a row of its own, read by [`open`] within [`EARLY_TTL_SECONDS`].
//!
//! Nothing here holds a connection between two calls: the stream polls.

use crate::{StoreError, StoreResult};
use sqlx::PgPool;

/// How long a decision that arrived before the wait counts (`EARLY_TTL_MS`).
pub const EARLY_TTL_SECONDS: i64 = 60;
/// Rows older than this are purged: a stream that died never deleted its row.
pub const PURGE_AFTER_SECONDS: i64 = 3600;

/// The user's answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Approved,
    Denied,
}

impl Decision {
    fn from_status(status: &str) -> Option<Self> {
        match status {
            "approved" => Some(Self::Approved),
            "denied" => Some(Self::Denied),
            _ => None,
        }
    }

    fn status(self) -> &'static str {
        match self {
            Self::Approved => "approved",
            Self::Denied => "denied",
        }
    }
}

/// Starts waiting on a call: writes the pending row, or returns the decision that came first.
///
/// A decision older than [`EARLY_TTL_SECONDS`] does not count, and the row goes back to
/// pending.
pub async fn open(db: &PgPool, tool_call_id: &str, user_id: &str) -> StoreResult<Option<Decision>> {
    let status: String = sqlx::query_scalar(
        r#"INSERT INTO "ChatToolApproval" ("toolCallId","userId","status","createdAt")
           VALUES ($1,$2,'pending',CURRENT_TIMESTAMP)
           ON CONFLICT ("toolCallId","userId") DO UPDATE SET
             "status" = CASE
               WHEN "ChatToolApproval"."status" <> 'pending'
                AND "ChatToolApproval"."createdAt" >= CURRENT_TIMESTAMP - make_interval(secs => $3)
               THEN "ChatToolApproval"."status" ELSE 'pending' END,
             "createdAt" = CURRENT_TIMESTAMP
           RETURNING "status""#,
    )
    .bind(tool_call_id)
    .bind(user_id)
    .bind(EARLY_TTL_SECONDS as f64)
    .fetch_one(db)
    .await?;
    Ok(Decision::from_status(&status))
}

/// The decision on a call, or `None` while it is still pending.
pub async fn poll(db: &PgPool, tool_call_id: &str, user_id: &str) -> StoreResult<Option<Decision>> {
    let status: Option<String> = sqlx::query_scalar(
        r#"SELECT "status" FROM "ChatToolApproval" WHERE "toolCallId" = $1 AND "userId" = $2"#,
    )
    .bind(tool_call_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    Ok(status.as_deref().and_then(Decision::from_status))
}

/// Stops waiting on a call.
pub async fn close(db: &PgPool, tool_call_id: &str, user_id: &str) -> StoreResult<()> {
    sqlx::query(r#"DELETE FROM "ChatToolApproval" WHERE "toolCallId" = $1 AND "userId" = $2"#)
        .bind(tool_call_id)
        .bind(user_id)
        .execute(db)
        .await?;
    Ok(())
}

/// Records the user's decision.
///
/// Only the user whose chat made the call may decide it: when another user's chat is waiting
/// on this call id and this user has none, the answer is [`StoreError::NotFound`], the same as
/// a stale id would get. An id nobody waits on yet is kept as an early decision.
pub async fn decide(
    db: &PgPool,
    tool_call_id: &str,
    user_id: &str,
    decision: Decision,
) -> StoreResult<()> {
    sqlx::query(
        r#"DELETE FROM "ChatToolApproval"
           WHERE ("status" <> 'pending' AND "createdAt" < CURRENT_TIMESTAMP - make_interval(secs => $1))
              OR "createdAt" < CURRENT_TIMESTAMP - make_interval(secs => $2)"#,
    )
    .bind(EARLY_TTL_SECONDS as f64)
    .bind(PURGE_AFTER_SECONDS as f64)
    .execute(db)
    .await?;

    let someone_else_waits: bool = sqlx::query_scalar(
        r#"SELECT EXISTS (SELECT 1 FROM "ChatToolApproval"
                          WHERE "toolCallId" = $1 AND "userId" <> $2 AND "status" = 'pending')
              AND NOT EXISTS (SELECT 1 FROM "ChatToolApproval"
                              WHERE "toolCallId" = $1 AND "userId" = $2)"#,
    )
    .bind(tool_call_id)
    .bind(user_id)
    .fetch_one(db)
    .await?;
    if someone_else_waits {
        return Err(StoreError::NotFound);
    }

    // A waiting row keeps the time its wait began; an early decision is dated now.
    sqlx::query(
        r#"INSERT INTO "ChatToolApproval" ("toolCallId","userId","status","createdAt","decidedAt")
           VALUES ($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
           ON CONFLICT ("toolCallId","userId") DO UPDATE SET
             "status" = EXCLUDED."status",
             "decidedAt" = EXCLUDED."decidedAt",
             "createdAt" = CASE WHEN "ChatToolApproval"."status" = 'pending'
                                THEN "ChatToolApproval"."createdAt" ELSE EXCLUDED."createdAt" END"#,
    )
    .bind(tool_call_id)
    .bind(user_id)
    .bind(decision.status())
    .execute(db)
    .await?;
    Ok(())
}
