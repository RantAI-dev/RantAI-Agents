//! `ChatShare`: a dashboard chat shared read-only with the org, a unit or a user (§3.4).
//!
//! A share lives in the session's organisation and names a subject of that organisation.
//! Revoking keeps the row with `revokedAt` set; sharing again with the same subject revives it.

use agents_core::authz::{ChatRef, Subject, SubjectType};
use chrono::NaiveDateTime;
use sqlx::PgPool;

use crate::access::{lock_subjects, subject_in_org};
use crate::{StoreError, StoreResult, new_id, now};

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct ShareRow {
    pub id: String,
    pub organization_id: String,
    pub session_id: String,
    /// `org`, `unit` or `user`.
    pub subject_type: String,
    pub subject_id: String,
    /// `view`.
    pub level: String,
    pub shared_by: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub revoked_at: Option<NaiveDateTime>,
}

impl ShareRow {
    #[must_use]
    pub fn subject(&self) -> Option<Subject> {
        Some(Subject {
            kind: SubjectType::parse(&self.subject_type)?,
            id: self.subject_id.clone(),
        })
    }
}

const COLUMNS: &str = r#""id","organizationId","sessionId","subjectType","subjectId","level","sharedBy","createdAt","updatedAt","revokedAt""#;

/// Shares a session of the organisation with `subject`. A session of another organisation (or
/// with none), or a subject outside the organisation, is `NotFound`.
pub async fn create(
    db: &PgPool,
    org_id: &str,
    session_id: &str,
    subject: &Subject,
    shared_by: &str,
) -> StoreResult<ShareRow> {
    let mut tx = db.begin().await?;
    lock_subjects(&mut tx, org_id).await?;
    let session_here = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "DashboardSession" WHERE "id" = $1 AND "organizationId" = $2)"#,
    )
    .bind(session_id)
    .bind(org_id)
    .fetch_one(&mut *tx)
    .await?;
    if !session_here || !subject_in_org(&mut tx, org_id, subject).await? {
        return Err(StoreError::NotFound);
    }
    let ts = now();
    let sql = format!(
        r#"INSERT INTO "ChatShare" ("id","organizationId","sessionId","subjectType","subjectId","level","sharedBy","createdAt","updatedAt","revokedAt")
           VALUES ($1,$2,$3,$4,$5,'view',$6,$7,$7,NULL)
           ON CONFLICT ("sessionId","subjectType","subjectId")
             DO UPDATE SET "sharedBy" = EXCLUDED."sharedBy", "updatedAt" = EXCLUDED."updatedAt", "revokedAt" = NULL
           RETURNING {COLUMNS}"#
    );
    let row = sqlx::query_as::<_, ShareRow>(&sql)
        .bind(new_id())
        .bind(org_id)
        .bind(session_id)
        .bind(subject.kind.as_str())
        .bind(&subject.id)
        .bind(shared_by)
        .bind(ts)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// Revokes an active share. No active share for that subject is `NotFound`.
pub async fn revoke(
    db: &PgPool,
    org_id: &str,
    session_id: &str,
    subject: &Subject,
) -> StoreResult<()> {
    let done = sqlx::query(
        r#"UPDATE "ChatShare" SET "revokedAt" = $5, "updatedAt" = $5
           WHERE "organizationId" = $1 AND "sessionId" = $2 AND "subjectType" = $3 AND "subjectId" = $4
             AND "revokedAt" IS NULL"#,
    )
    .bind(org_id)
    .bind(session_id)
    .bind(subject.kind.as_str())
    .bind(&subject.id)
    .bind(now())
    .execute(db)
    .await?;
    if done.rows_affected() == 0 {
        return Err(StoreError::NotFound);
    }
    Ok(())
}

/// The active shares of one session.
pub async fn list_for_session(
    db: &PgPool,
    org_id: &str,
    session_id: &str,
) -> StoreResult<Vec<ShareRow>> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "ChatShare"
           WHERE "organizationId" = $1 AND "sessionId" = $2 AND "revokedAt" IS NULL
           ORDER BY "createdAt" ASC, "id" ASC"#
    );
    Ok(sqlx::query_as::<_, ShareRow>(&sql)
        .bind(org_id)
        .bind(session_id)
        .fetch_all(db)
        .await?)
}

/// A session as `authz::authorize` needs it, for a caller acting in `org_id`: its organisation,
/// owner, and the active shares stored in `org_id`. An unknown id, or a session with no
/// organisation, is `NotFound`.
pub async fn chat_ref(db: &PgPool, org_id: &str, session_id: &str) -> StoreResult<ChatRef> {
    let (organization_id, owner_id) = sqlx::query_as::<_, (Option<String>, String)>(
        r#"SELECT "organizationId", "userId" FROM "DashboardSession" WHERE "id" = $1"#,
    )
    .bind(session_id)
    .fetch_optional(db)
    .await?
    .ok_or(StoreError::NotFound)?;
    let organization_id = organization_id.ok_or(StoreError::NotFound)?;
    let shares = if organization_id == org_id {
        list_for_session(db, org_id, session_id)
            .await?
            .iter()
            .filter_map(ShareRow::subject)
            .collect()
    } else {
        Vec::new()
    };
    Ok(ChatRef {
        organization_id,
        owner_id,
        shares,
    })
}
