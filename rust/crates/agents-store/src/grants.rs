//! `AssistantGrant`: who may use or manage one agent (docs/design/identity-and-access.md §3.3).
//!
//! A grant lives in the agent's organisation and names a subject of that same organisation: the
//! organisation itself, one of its units, or one of its accepted members. Anything else is
//! [`StoreError::NotFound`], so a grant can never reach across tenants.

use agents_core::authz::{AgentRef, Grant, GrantLevel, Subject, SubjectType};
use chrono::NaiveDateTime;
use sqlx::PgPool;

use crate::access::{lock_subjects, subject_in_org};
use crate::{StoreError, StoreResult, new_id, now};

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct GrantRow {
    pub id: String,
    pub organization_id: String,
    pub assistant_id: String,
    /// `org`, `unit` or `user`.
    pub subject_type: String,
    pub subject_id: String,
    /// `use` or `manage`.
    pub level: String,
    pub granted_by: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl GrantRow {
    /// The grant as `authz` sees it; `None` for a row with an unknown type or level.
    #[must_use]
    pub fn to_grant(&self) -> Option<Grant> {
        Some(Grant {
            subject: Subject {
                kind: SubjectType::parse(&self.subject_type)?,
                id: self.subject_id.clone(),
            },
            level: GrantLevel::parse(&self.level)?,
        })
    }
}

const COLUMNS: &str = r#""id","organizationId","assistantId","subjectType","subjectId","level","grantedBy","createdAt","updatedAt""#;

/// Grants `subject` the `level` on an agent of the organisation, or changes the level of an
/// existing grant. A built-in agent, another organisation's agent, or a subject outside the
/// organisation is `NotFound`.
pub async fn set(
    db: &PgPool,
    org_id: &str,
    assistant_id: &str,
    subject: &Subject,
    level: GrantLevel,
    granted_by: &str,
) -> StoreResult<GrantRow> {
    let mut tx = db.begin().await?;
    lock_subjects(&mut tx, org_id).await?;
    let agent_here = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "Assistant"
             WHERE "id" = $1 AND "organizationId" = $2 AND "isBuiltIn" = false)"#,
    )
    .bind(assistant_id)
    .bind(org_id)
    .fetch_one(&mut *tx)
    .await?;
    if !agent_here || !subject_in_org(&mut tx, org_id, subject).await? {
        return Err(StoreError::NotFound);
    }
    let ts = now();
    let sql = format!(
        r#"INSERT INTO "AssistantGrant" ("id","organizationId","assistantId","subjectType","subjectId","level","grantedBy","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
           ON CONFLICT ("assistantId","subjectType","subjectId")
             DO UPDATE SET "level" = EXCLUDED."level", "grantedBy" = EXCLUDED."grantedBy", "updatedAt" = EXCLUDED."updatedAt"
           RETURNING {COLUMNS}"#
    );
    let row = sqlx::query_as::<_, GrantRow>(&sql)
        .bind(new_id())
        .bind(org_id)
        .bind(assistant_id)
        .bind(subject.kind.as_str())
        .bind(&subject.id)
        .bind(level.as_str())
        .bind(granted_by)
        .bind(ts)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// Removes a grant. No such grant in the organisation is `NotFound`.
pub async fn revoke(
    db: &PgPool,
    org_id: &str,
    assistant_id: &str,
    subject: &Subject,
) -> StoreResult<()> {
    let done = sqlx::query(
        r#"DELETE FROM "AssistantGrant"
           WHERE "organizationId" = $1 AND "assistantId" = $2 AND "subjectType" = $3 AND "subjectId" = $4"#,
    )
    .bind(org_id)
    .bind(assistant_id)
    .bind(subject.kind.as_str())
    .bind(&subject.id)
    .execute(db)
    .await?;
    if done.rows_affected() == 0 {
        return Err(StoreError::NotFound);
    }
    Ok(())
}

/// The grants on one agent, as stored in the organisation.
pub async fn list(db: &PgPool, org_id: &str, assistant_id: &str) -> StoreResult<Vec<GrantRow>> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "AssistantGrant"
           WHERE "organizationId" = $1 AND "assistantId" = $2
           ORDER BY "createdAt" ASC, "id" ASC"#
    );
    Ok(sqlx::query_as::<_, GrantRow>(&sql)
        .bind(org_id)
        .bind(assistant_id)
        .fetch_all(db)
        .await?)
}

/// The name of what a unit or user grant names, for the access panel. `None` when the subject
/// no longer exists or is another organisation's, which a grant cannot name anyway.
pub async fn subject_name(
    db: &PgPool,
    org_id: &str,
    subject: &Subject,
) -> StoreResult<Option<String>> {
    let sql = match subject.kind {
        SubjectType::Org => {
            return Ok(sqlx::query_scalar::<_, String>(
                r#"SELECT "name" FROM "Organization" WHERE "id" = $1"#,
            )
            .bind(&subject.id)
            .fetch_optional(db)
            .await?);
        }
        SubjectType::Unit => {
            r#"SELECT "name" FROM "OrgUnit" WHERE "id" = $1 AND "organizationId" = $2"#
        }
        SubjectType::User => {
            r#"SELECT a."name" FROM "Agent" a
               JOIN "OrganizationMember" m ON m."userId" = a."id" AND m."organizationId" = $2
               WHERE a."id" = $1 AND m."acceptedAt" IS NOT NULL"#
        }
    };
    Ok(sqlx::query_scalar::<_, String>(sql)
        .bind(&subject.id)
        .bind(org_id)
        .fetch_optional(db)
        .await?)
}

/// Replaces every grant of an agent with `wanted`, in one transaction: the grants it does not
/// name are removed, the ones it names are inserted or have their level changed.
///
/// A built-in agent, another organisation's agent, or a subject outside the organisation is
/// `NotFound`, and nothing is written: a body that names a stranger does not half-apply.
pub async fn replace_all(
    db: &PgPool,
    org_id: &str,
    assistant_id: &str,
    wanted: &[(Subject, GrantLevel)],
    granted_by: &str,
) -> StoreResult<Vec<GrantRow>> {
    let mut tx = db.begin().await?;
    lock_subjects(&mut tx, org_id).await?;
    let agent_here = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "Assistant"
             WHERE "id" = $1 AND "organizationId" = $2 AND "isBuiltIn" = false)"#,
    )
    .bind(assistant_id)
    .bind(org_id)
    .fetch_one(&mut *tx)
    .await?;
    if !agent_here {
        return Err(StoreError::NotFound);
    }
    for (subject, _) in wanted {
        if !subject_in_org(&mut tx, org_id, subject).await? {
            return Err(StoreError::NotFound);
        }
    }

    let ts = now();
    let upsert = format!(
        r#"INSERT INTO "AssistantGrant" ("id","organizationId","assistantId","subjectType","subjectId","level","grantedBy","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
           ON CONFLICT ("assistantId","subjectType","subjectId")
             DO UPDATE SET "level" = EXCLUDED."level", "grantedBy" = EXCLUDED."grantedBy", "updatedAt" = EXCLUDED."updatedAt""#
    );
    for (subject, level) in wanted {
        sqlx::query(&upsert)
            .bind(new_id())
            .bind(org_id)
            .bind(assistant_id)
            .bind(subject.kind.as_str())
            .bind(&subject.id)
            .bind(level.as_str())
            .bind(granted_by)
            .bind(ts)
            .execute(&mut *tx)
            .await?;
    }

    // Everything the body did not name goes. Deleting by (type, id) rather than by row id
    // keeps a grant that stays at the same level with its id and its `createdAt`.
    sqlx::query(
        r#"DELETE FROM "AssistantGrant" g
           WHERE g."organizationId" = $1 AND g."assistantId" = $2
             AND NOT EXISTS (
               SELECT 1 FROM unnest($3::text[], $4::text[]) AS w("subjectType", "subjectId")
               WHERE w."subjectType" = g."subjectType" AND w."subjectId" = g."subjectId")"#,
    )
    .bind(org_id)
    .bind(assistant_id)
    .bind(
        wanted
            .iter()
            .map(|(s, _)| s.kind.as_str())
            .collect::<Vec<&str>>(),
    )
    .bind(
        wanted
            .iter()
            .map(|(s, _)| s.id.clone())
            .collect::<Vec<String>>(),
    )
    .execute(&mut *tx)
    .await?;

    let sql = format!(
        r#"SELECT {COLUMNS} FROM "AssistantGrant"
           WHERE "organizationId" = $1 AND "assistantId" = $2
           ORDER BY "createdAt" ASC, "id" ASC"#
    );
    let rows = sqlx::query_as::<_, GrantRow>(&sql)
        .bind(org_id)
        .bind(assistant_id)
        .fetch_all(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(rows)
}

/// An agent as `authz::authorize` needs it, for a caller acting in `org_id`. The agent itself is
/// loaded whatever its organisation, so `authorize` can answer `NotFound` for another tenant's;
/// only grants stored in `org_id` are attached. An unknown id is `NotFound`.
pub async fn agent_ref(db: &PgPool, org_id: &str, assistant_id: &str) -> StoreResult<AgentRef> {
    let (organization_id, is_built_in) = sqlx::query_as::<_, (Option<String>, bool)>(
        r#"SELECT "organizationId", "isBuiltIn" FROM "Assistant" WHERE "id" = $1"#,
    )
    .bind(assistant_id)
    .fetch_optional(db)
    .await?
    .ok_or(StoreError::NotFound)?;
    let grants = if organization_id.as_deref() == Some(org_id) {
        list(db, org_id, assistant_id)
            .await?
            .iter()
            .filter_map(GrantRow::to_grant)
            .collect()
    } else {
        Vec::new()
    };
    Ok(AgentRef {
        organization_id,
        is_built_in,
        grants,
    })
}
