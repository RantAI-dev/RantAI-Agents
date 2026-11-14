//! `ChatShare`: a dashboard chat shared read-only with the org, a unit or a user (§3.4).
//!
//! A share lives in the session's organisation and names a subject of that organisation.
//! Revoking keeps the row with `revokedAt` set; sharing again with the same subject revives it.

use agents_core::authz::{ChatRef, Subject, SubjectType};
use chrono::NaiveDateTime;
use serde_json::json;
use sqlx::{PgPool, Postgres, Transaction};

use crate::access::{lock_subjects, subject_in_org};
use crate::audit::{self, Actor};
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

/// Replaces every active share of a session with `wanted`, in one transaction: the shares it
/// does not name are revoked (`revokedAt`), the ones it names are inserted or revived. Each
/// share that went or came leaves an `rbac.share.create` or `rbac.share.revoke` row, in the same
/// transaction (§3.4, §3.7).
///
/// A session of another organisation, or a subject outside the organisation, is `NotFound` and
/// nothing is written. A session with no organisation is attached to `org_id` first, when its
/// assistant belongs to exactly that organisation; when the assistant is global or belongs to
/// another organisation the answer is [`StoreError::Conflict`]: such a chat cannot be shared.
pub async fn replace_all(
    db: &PgPool,
    org_id: &str,
    session_id: &str,
    wanted: &[Subject],
    actor: &Actor<'_>,
) -> StoreResult<Vec<ShareRow>> {
    let mut tx = db.begin().await?;
    lock_subjects(&mut tx, org_id).await?;
    attach_session(&mut tx, org_id, session_id).await?;
    for subject in wanted {
        if !subject_in_org(&mut tx, org_id, subject).await? {
            return Err(StoreError::NotFound);
        }
    }
    // Read under the lock: the audit rows describe the diff this write makes.
    let before = list_in(&mut tx, org_id, session_id).await?;

    let ts = now();
    let upsert = r#"INSERT INTO "ChatShare" ("id","organizationId","sessionId","subjectType","subjectId","level","sharedBy","createdAt","updatedAt","revokedAt")
           VALUES ($1,$2,$3,$4,$5,'view',$6,$7,$7,NULL)
           ON CONFLICT ("sessionId","subjectType","subjectId")
             DO UPDATE SET "sharedBy" = EXCLUDED."sharedBy", "updatedAt" = EXCLUDED."updatedAt", "revokedAt" = NULL"#;
    for subject in wanted {
        sqlx::query(upsert)
            .bind(new_id())
            .bind(org_id)
            .bind(session_id)
            .bind(subject.kind.as_str())
            .bind(&subject.id)
            .bind(actor.user_id)
            .bind(ts)
            .execute(&mut *tx)
            .await?;
    }
    // Everything the body did not name is revoked rather than deleted: sharing it again revives
    // the same row.
    sqlx::query(
        r#"UPDATE "ChatShare" c SET "revokedAt" = $3, "updatedAt" = $3
           WHERE c."organizationId" = $1 AND c."sessionId" = $2 AND c."revokedAt" IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM unnest($4::text[], $5::text[]) AS w("subjectType", "subjectId")
               WHERE w."subjectType" = c."subjectType" AND w."subjectId" = c."subjectId")"#,
    )
    .bind(org_id)
    .bind(session_id)
    .bind(ts)
    .bind(
        wanted
            .iter()
            .map(|s| s.kind.as_str())
            .collect::<Vec<&str>>(),
    )
    .bind(wanted.iter().map(|s| s.id.clone()).collect::<Vec<String>>())
    .execute(&mut *tx)
    .await?;

    let after = list_in(&mut tx, org_id, session_id).await?;
    let same = |a: &ShareRow, b: &ShareRow| {
        a.subject_type == b.subject_type && a.subject_id == b.subject_id
    };
    for share in &after {
        // A row that was not active before was either new or revoked: either way, it is a
        // share that this write brought back.
        if !before.iter().any(|old| same(old, share)) {
            record(&mut tx, actor, "rbac.share.create", session_id, share).await?;
        }
    }
    for share in &before {
        if !after.iter().any(|new| same(new, share)) {
            record(&mut tx, actor, "rbac.share.revoke", session_id, share).await?;
        }
    }
    tx.commit().await?;
    Ok(after)
}

/// Revokes one active share of a session by its row id, and leaves an `rbac.share.revoke` row,
/// in one transaction. Another organisation's session, or a share id that is not this session's
/// or already revoked, is `NotFound`.
pub async fn revoke_by_id(
    db: &PgPool,
    org_id: &str,
    session_id: &str,
    share_id: &str,
    actor: &Actor<'_>,
) -> StoreResult<()> {
    let mut tx = db.begin().await?;
    lock_subjects(&mut tx, org_id).await?;
    ensure_session_in_org(&mut tx, org_id, session_id).await?;
    let sql = format!(
        r#"UPDATE "ChatShare" SET "revokedAt" = $4, "updatedAt" = $4
           WHERE "id" = $1 AND "organizationId" = $2 AND "sessionId" = $3 AND "revokedAt" IS NULL
           RETURNING {COLUMNS}"#
    );
    let share = sqlx::query_as::<_, ShareRow>(&sql)
        .bind(share_id)
        .bind(org_id)
        .bind(session_id)
        .bind(now())
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::NotFound)?;
    record(&mut tx, actor, "rbac.share.revoke", session_id, &share).await?;
    tx.commit().await?;
    Ok(())
}

/// Where a session with no organisation would live, seen from `org_id` (differences row 130).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrglessHome {
    /// Its agent is `org_id`'s and its owner an accepted member of `org_id`: the first share
    /// attaches it here.
    Here,
    /// Its agent belongs to no organisation (or is gone): no tenant can claim it.
    Global,
    /// Anything else: another organisation's agent, or an owner outside `org_id`.
    Elsewhere,
}

/// The one rule that lets `org_id` claim an org-less session `s` whose agent is `a`. `$2` is
/// `org_id`. The owner must be a member too: an admin may not pull in the old chat of somebody
/// who never belonged, or has left.
const ATTACHABLE: &str = r#"a."organizationId" = $2 AND EXISTS (
    SELECT 1 FROM "OrganizationMember" m
    WHERE m."userId" = s."userId" AND m."organizationId" = $2 AND m."acceptedAt" IS NOT NULL)"#;

/// [`OrglessHome`] of a session, `NotFound` when it is unknown or already has an organisation.
pub async fn orgless_home(db: &PgPool, org_id: &str, session_id: &str) -> StoreResult<OrglessHome> {
    let sql = format!(
        r#"SELECT a."organizationId" IS NULL, COALESCE({ATTACHABLE}, false)
           FROM "DashboardSession" s LEFT JOIN "Assistant" a ON a."id" = s."assistantId"
           WHERE s."id" = $1 AND s."organizationId" IS NULL"#
    );
    let (global, here) = sqlx::query_as::<_, (bool, bool)>(&sql)
        .bind(session_id)
        .bind(org_id)
        .fetch_optional(db)
        .await?
        .ok_or(StoreError::NotFound)?;
    Ok(if here {
        OrglessHome::Here
    } else if global {
        OrglessHome::Global
    } else {
        OrglessHome::Elsewhere
    })
}

/// Makes sure the session belongs to `org_id`, attaching it when it has no organisation yet and
/// [`OrglessHome::Here`] holds. A global agent is [`StoreError::Conflict`]; anything else is
/// `NotFound`.
///
/// The backfill is the one migration the sharing slice makes for rows written before sessions
/// carried an organisation (differences row 130). It runs inside the first share's transaction,
/// and the rule is re-checked by the `UPDATE` itself, so a concurrent attach or a membership
/// removed since the route's check cannot slip through.
async fn attach_session(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    session_id: &str,
) -> StoreResult<()> {
    let row = sqlx::query_as::<_, (Option<String>, Option<String>)>(
        r#"SELECT s."organizationId", a."organizationId"
           FROM "DashboardSession" s LEFT JOIN "Assistant" a ON a."id" = s."assistantId"
           WHERE s."id" = $1"#,
    )
    .bind(session_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(StoreError::NotFound)?;
    match row {
        (Some(org), _) if org == org_id => Ok(()),
        (Some(_), _) => Err(StoreError::NotFound),
        (None, None) => Err(StoreError::Conflict),
        (None, Some(_)) => {
            let sql = format!(
                r#"UPDATE "DashboardSession" s SET "organizationId" = $2
                   FROM "Assistant" a
                   WHERE s."id" = $1 AND s."organizationId" IS NULL AND a."id" = s."assistantId"
                     AND {ATTACHABLE}"#
            );
            let done = sqlx::query(&sql)
                .bind(session_id)
                .bind(org_id)
                .execute(&mut **tx)
                .await?;
            if done.rows_affected() == 0 {
                return Err(StoreError::NotFound);
            }
            Ok(())
        }
    }
}

/// The session must be this organisation's; nothing about the assistant can recover it.
async fn ensure_session_in_org(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    session_id: &str,
) -> StoreResult<()> {
    let here = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "DashboardSession"
             WHERE "id" = $1 AND "organizationId" = $2)"#,
    )
    .bind(session_id)
    .bind(org_id)
    .fetch_one(&mut **tx)
    .await?;
    if here {
        Ok(())
    } else {
        Err(StoreError::NotFound)
    }
}

async fn list_in(
    tx: &mut Transaction<'_, Postgres>,
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
        .fetch_all(&mut **tx)
        .await?)
}

async fn record(
    tx: &mut Transaction<'_, Postgres>,
    actor: &Actor<'_>,
    action: &str,
    session_id: &str,
    share: &ShareRow,
) -> StoreResult<()> {
    audit::record(
        tx,
        &share.organization_id,
        actor,
        action,
        format!("session:{session_id}"),
        json!({
            "sessionId": session_id,
            "subjectType": share.subject_type,
            "subjectId": share.subject_id,
            "level": share.level,
        }),
    )
    .await
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
