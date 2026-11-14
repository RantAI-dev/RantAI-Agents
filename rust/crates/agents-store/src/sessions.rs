//! `DashboardSession` and `DashboardMessage`: the dashboard chat sessions and the messages in
//! them.
//!
//! Every function that takes a session id also takes the user id and filters on it. A session
//! that belongs to somebody else is [`StoreError::NotFound`], never a row and never a
//! "forbidden": a caller must not learn that an id exists.
//!
//! Messages come back in `seq` order. `seq` is the monotonic per-row insert order; `createdAt`
//! is transaction-scoped in Postgres, so a batched insert gives every row the same timestamp and
//! the order would be arbitrary on reload.

use chrono::NaiveDateTime;
use serde_json::Value;
use sqlx::{Executor, PgPool, Postgres};

use crate::orgs;
use crate::{StoreError, StoreResult, new_id, now};

/// One dashboard chat session.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct SessionRow {
    pub id: String,
    pub user_id: String,
    pub title: String,
    pub assistant_id: String,
    pub organization_id: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// One message in a session.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct MessageRow {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub reply_to: Option<String>,
    /// The edit history: every earlier version of the message with the assistant reply it got.
    pub edit_history: Option<Value>,
    /// The retrieval sources of an assistant message.
    pub sources: Option<Value>,
    pub metadata: Option<Value>,
    /// Monotonic insert order.
    pub seq: i64,
    pub created_at: NaiveDateTime,
}

/// An artifact created in a session: a `Document` row with an artifact type.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct ArtifactRow {
    pub id: String,
    pub title: String,
    pub content: String,
    pub artifact_type: Option<String>,
    pub metadata: Option<Value>,
}

/// A session as the sidebar shows it.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub assistant_id: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    /// How many messages the session holds.
    pub message_count: i64,
    /// The content of the newest message, whole: the caller trims it for the preview.
    pub last_message: Option<String>,
}

/// A session with its messages and its artifacts.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionDetail {
    pub session: SessionRow,
    pub messages: Vec<MessageRow>,
    pub artifacts: Vec<ArtifactRow>,
}

/// A message to write. `id` is the id the client already has, so a retry updates the same row;
/// `None` makes a new one.
#[derive(Debug, Clone, PartialEq)]
pub struct NewMessage {
    pub id: Option<String>,
    pub role: String,
    pub content: String,
    pub reply_to: Option<String>,
    pub edit_history: Option<Value>,
    pub sources: Option<Value>,
    pub metadata: Option<Value>,
}

/// What to write in a JSON column: leave it alone, clear it, or set it.
#[derive(Debug, Clone, PartialEq, Default)]
pub enum JsonWrite {
    /// The caller did not mention the column: it keeps its value.
    #[default]
    Keep,
    /// The caller sent `null`: the column becomes null.
    Clear,
    /// The caller sent a value: the column becomes it.
    Set(Value),
}

/// The columns a message update may write. Every field that is not set keeps its value, the way
/// the TypeScript left a field alone when the client did not send it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct MessageChanges {
    pub content: Option<String>,
    pub edit_history: JsonWrite,
    pub sources: JsonWrite,
    pub metadata: JsonWrite,
}

const SESSION_COLUMNS: &str =
    r#""id","userId","title","assistantId","organizationId","createdAt","updatedAt""#;

const MESSAGE_COLUMNS: &str = r#""id","sessionId","role","content","replyTo","editHistory","sources","metadata","seq","createdAt""#;

const ARTIFACT_COLUMNS: &str = r#""id","title","content","artifactType","metadata""#;

/// The user's sessions, the one used last first.
pub async fn list_sessions(db: &PgPool, user_id: &str) -> StoreResult<Vec<SessionSummary>> {
    let sql = r#"SELECT s."id", s."title", s."assistantId", s."createdAt", s."updatedAt",
                  (SELECT COUNT(*) FROM "DashboardMessage" m WHERE m."sessionId" = s."id") AS "messageCount",
                  (SELECT m."content" FROM "DashboardMessage" m WHERE m."sessionId" = s."id"
                     ORDER BY m."createdAt" DESC, m."seq" DESC LIMIT 1) AS "lastMessage"
           FROM "DashboardSession" s
           WHERE s."userId" = $1
           ORDER BY s."updatedAt" DESC, s."id" DESC"#;
    Ok(sqlx::query_as::<_, SessionSummary>(sql)
        .bind(user_id)
        .fetch_all(db)
        .await?)
}

/// The session row, or [`StoreError::NotFound`] when it belongs to somebody else.
pub async fn get_session(db: &PgPool, user_id: &str, session_id: &str) -> StoreResult<SessionRow> {
    let sql = format!(
        r#"SELECT {SESSION_COLUMNS} FROM "DashboardSession" WHERE "id" = $1 AND "userId" = $2"#
    );
    sqlx::query_as::<_, SessionRow>(&sql)
        .bind(session_id)
        .bind(user_id)
        .fetch_optional(db)
        .await?
        .ok_or(StoreError::NotFound)
}

/// The session with its messages (in `seq` order) and its artifacts.
pub async fn get_session_detail(
    db: &PgPool,
    user_id: &str,
    session_id: &str,
) -> StoreResult<SessionDetail> {
    let session = get_session(db, user_id, session_id).await?;
    let messages = fetch_messages(db, session_id).await?;
    let artifacts = fetch_artifacts(db, session_id).await?;
    Ok(SessionDetail {
        session,
        messages,
        artifacts,
    })
}

/// Creates a session. The id is new; the title and the assistant are the caller's.
pub async fn create_session(
    db: &PgPool,
    user_id: &str,
    assistant_id: &str,
    title: &str,
) -> StoreResult<SessionRow> {
    let ts = now();
    let sql = format!(
        r#"INSERT INTO "DashboardSession" ("id","userId","title","assistantId","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$5)
           RETURNING {SESSION_COLUMNS}"#
    );
    Ok(sqlx::query_as::<_, SessionRow>(&sql)
        .bind(new_id())
        .bind(user_id)
        .bind(title)
        .bind(assistant_id)
        .bind(ts)
        .fetch_one(db)
        .await?)
}

/// Renames a session. Somebody else's session is [`StoreError::NotFound`].
pub async fn update_title(
    db: &PgPool,
    user_id: &str,
    session_id: &str,
    title: &str,
) -> StoreResult<SessionRow> {
    let sql = format!(
        r#"UPDATE "DashboardSession" SET "title"=$3,"updatedAt"=$4
           WHERE "id"=$1 AND "userId"=$2
           RETURNING {SESSION_COLUMNS}"#
    );
    sqlx::query_as::<_, SessionRow>(&sql)
        .bind(session_id)
        .bind(user_id)
        .bind(title)
        .bind(now())
        .fetch_optional(db)
        .await?
        .ok_or(StoreError::NotFound)
}

/// Deletes a session, its messages (the foreign key cascades) and its artifact rows.
pub async fn delete_session(db: &PgPool, user_id: &str, session_id: &str) -> StoreResult<()> {
    let mut tx = db.begin().await?;
    // The ownership check comes first: the artifact rows of a session the caller does not own
    // must survive.
    ensure_session(&mut *tx, user_id, session_id).await?;
    sqlx::query(r#"DELETE FROM "Document" WHERE "sessionId"=$1 AND "artifactType" IS NOT NULL"#)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;
    let done = sqlx::query(r#"DELETE FROM "DashboardSession" WHERE "id"=$1 AND "userId"=$2"#)
        .bind(session_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    if done.rows_affected() == 0 {
        return Err(StoreError::NotFound);
    }
    tx.commit().await?;
    Ok(())
}

/// The messages of a session, in `seq` order. Somebody else's session is
/// [`StoreError::NotFound`], not an empty list.
pub async fn list_messages(
    db: &PgPool,
    user_id: &str,
    session_id: &str,
) -> StoreResult<Vec<MessageRow>> {
    ensure_session(db, user_id, session_id).await?;
    fetch_messages(db, session_id).await
}

/// Writes messages into a session. A message that already exists (the client retries with the
/// same id) is updated instead of duplicated.
///
/// An id that already lives in another session is [`StoreError::Conflict`]: the upsert keys on
/// the id alone, so writing it here would move a message across sessions.
pub async fn add_messages(
    db: &PgPool,
    user_id: &str,
    session_id: &str,
    messages: &[NewMessage],
) -> StoreResult<Vec<MessageRow>> {
    ensure_session(db, user_id, session_id).await?;
    for message in messages {
        let Some(id) = message.id.as_deref() else {
            continue;
        };
        let owner: Option<String> =
            sqlx::query_scalar(r#"SELECT "sessionId" FROM "DashboardMessage" WHERE "id"=$1"#)
                .bind(id)
                .fetch_optional(db)
                .await?;
        if let Some(owner) = owner
            && owner != session_id
        {
            return Err(StoreError::Conflict);
        }
    }

    let mut tx = db.begin().await?;
    let mut rows = Vec::with_capacity(messages.len());
    for message in messages {
        let id = message.id.clone().unwrap_or_else(new_id);
        // `COALESCE` keeps a column the client did not send, the way the TypeScript left it
        // alone when the field was undefined.
        let sql = format!(
            r#"INSERT INTO "DashboardMessage"
                 ("id","sessionId","role","content","replyTo","editHistory","sources","metadata","createdAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT ("id") DO UPDATE SET
                 "sessionId" = EXCLUDED."sessionId",
                 "role" = EXCLUDED."role",
                 "content" = EXCLUDED."content",
                 "replyTo" = COALESCE(EXCLUDED."replyTo", "DashboardMessage"."replyTo"),
                 "editHistory" = COALESCE(EXCLUDED."editHistory", "DashboardMessage"."editHistory"),
                 "sources" = COALESCE(EXCLUDED."sources", "DashboardMessage"."sources"),
                 "metadata" = COALESCE(EXCLUDED."metadata", "DashboardMessage"."metadata")
               RETURNING {MESSAGE_COLUMNS}"#
        );
        let row = sqlx::query_as::<_, MessageRow>(&sql)
            .bind(&id)
            .bind(session_id)
            .bind(&message.role)
            .bind(&message.content)
            .bind(&message.reply_to)
            .bind(&message.edit_history)
            .bind(&message.sources)
            .bind(&message.metadata)
            .bind(now())
            .fetch_one(&mut *tx)
            .await?;
        rows.push(row);
    }
    // The sidebar orders by `updatedAt`, and writing a message is activity: without this the
    // chat you just talked in stays below older ones until its title changes.
    sqlx::query(r#"UPDATE "DashboardSession" SET "updatedAt"=$2 WHERE "id"=$1"#)
        .bind(session_id)
        .bind(now())
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(rows)
}

/// Writes one message of a session. Somebody else's session, or a message that is not in it, is
/// [`StoreError::NotFound`].
pub async fn update_message(
    db: &PgPool,
    user_id: &str,
    session_id: &str,
    message_id: &str,
    changes: &MessageChanges,
) -> StoreResult<MessageRow> {
    ensure_session(db, user_id, session_id).await?;
    let sql = format!(
        r#"UPDATE "DashboardMessage" SET
             "content" = CASE WHEN $3 THEN $4 ELSE "content" END,
             "editHistory" = CASE WHEN $5 THEN $6 ELSE "editHistory" END,
             "sources" = CASE WHEN $7 THEN $8 ELSE "sources" END,
             "metadata" = CASE WHEN $9 THEN $10 ELSE "metadata" END
           WHERE "id" = $1 AND "sessionId" = $2
           RETURNING {MESSAGE_COLUMNS}"#
    );
    let row = sqlx::query_as::<_, MessageRow>(&sql)
        .bind(message_id)
        .bind(session_id)
        .bind(changes.content.is_some())
        .bind(changes.content.as_deref().unwrap_or(""))
        .bind(!matches!(changes.edit_history, JsonWrite::Keep))
        .bind(json_value(&changes.edit_history))
        .bind(!matches!(changes.sources, JsonWrite::Keep))
        .bind(json_value(&changes.sources))
        .bind(!matches!(changes.metadata, JsonWrite::Keep))
        .bind(json_value(&changes.metadata))
        .fetch_optional(db)
        .await?;
    row.ok_or(StoreError::NotFound)
}

/// Deletes the given messages of a session, and only those: another session's message with the
/// same id is never touched. Returns how many rows went.
pub async fn delete_messages(
    db: &PgPool,
    user_id: &str,
    session_id: &str,
    message_ids: &[String],
) -> StoreResult<u64> {
    ensure_session(db, user_id, session_id).await?;
    if message_ids.is_empty() {
        return Ok(0);
    }
    let done =
        sqlx::query(r#"DELETE FROM "DashboardMessage" WHERE "sessionId"=$1 AND "id" = ANY($2)"#)
            .bind(session_id)
            .bind(message_ids.to_vec())
            .execute(db)
            .await?;
    Ok(done.rows_affected())
}

/// Whether the caller may start a chat with this assistant: the assistant must exist, and when
/// it belongs to an organisation the caller must be a member of it. A system-global assistant
/// (no organisation) is open to everybody.
pub async fn may_use_assistant(
    db: &PgPool,
    user_id: &str,
    assistant_id: &str,
) -> StoreResult<bool> {
    let organization: Option<Option<String>> =
        sqlx::query_scalar(r#"SELECT "organizationId" FROM "Assistant" WHERE "id"=$1"#)
            .bind(assistant_id)
            .fetch_optional(db)
            .await?;
    match organization {
        None => Ok(false),
        Some(None) => Ok(true),
        Some(Some(org_id)) => Ok(orgs::membership(db, user_id, &org_id).await?.is_some()),
    }
}

async fn ensure_session<'q, E>(executor: E, user_id: &str, session_id: &str) -> StoreResult<()>
where
    E: Executor<'q, Database = Postgres>,
{
    let found: Option<(String,)> =
        sqlx::query_as(r#"SELECT "id" FROM "DashboardSession" WHERE "id"=$1 AND "userId"=$2"#)
            .bind(session_id)
            .bind(user_id)
            .fetch_optional(executor)
            .await?;
    found.map(|_| ()).ok_or(StoreError::NotFound)
}

async fn fetch_messages(db: &PgPool, session_id: &str) -> StoreResult<Vec<MessageRow>> {
    let sql = format!(
        r#"SELECT {MESSAGE_COLUMNS} FROM "DashboardMessage" WHERE "sessionId"=$1 ORDER BY "seq" ASC"#
    );
    Ok(sqlx::query_as::<_, MessageRow>(&sql)
        .bind(session_id)
        .fetch_all(db)
        .await?)
}

async fn fetch_artifacts(db: &PgPool, session_id: &str) -> StoreResult<Vec<ArtifactRow>> {
    let sql = format!(
        r#"SELECT {ARTIFACT_COLUMNS} FROM "Document"
           WHERE "sessionId"=$1 AND "artifactType" IS NOT NULL
           ORDER BY "createdAt" ASC"#
    );
    Ok(sqlx::query_as::<_, ArtifactRow>(&sql)
        .bind(session_id)
        .fetch_all(db)
        .await?)
}

/// The value a JSON column gets: nothing to write, null, or the value.
fn json_value(write: &JsonWrite) -> Option<Value> {
    match write {
        JsonWrite::Keep | JsonWrite::Clear => None,
        JsonWrite::Set(value) => Some(value.clone()),
    }
}
