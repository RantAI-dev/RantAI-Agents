//! `OrgUnit` and `OrgUnitMember`: departments and teams, and who is in them.
//!
//! Every function takes the organisation id and scopes by it; a unit of another organisation is
//! [`StoreError::NotFound`]. Access rules live in `agents_core::authz`: callers check first.
//!
//! Every write to the tree takes a per-organisation advisory lock for its transaction. Under
//! READ COMMITTED two concurrent moves (A under B, B under A) would each check a snapshot without
//! the other's write and together make a cycle; the lock makes the second one check after the
//! first has committed (`tests/authz_units.rs` fires them at once).

use agents_core::authz::{MemberSource, TreeError, UnitKind, UnitTree};
use chrono::NaiveDateTime;
use sqlx::{PgPool, Postgres, Transaction};

use crate::access::lock_subjects as lock_tree;
use crate::{StoreError, StoreResult, new_id, now};

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct UnitRow {
    pub id: String,
    pub organization_id: String,
    pub parent_id: Option<String>,
    /// `department` or `team`.
    pub kind: String,
    pub name: String,
    pub slug: String,
    pub external_id: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewUnit<'a> {
    pub parent_id: Option<&'a str>,
    pub kind: UnitKind,
    pub name: &'a str,
    pub slug: &'a str,
    pub external_id: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct MemberRow {
    pub organization_id: String,
    pub unit_id: String,
    pub user_id: String,
    /// `lead` or `member`.
    pub role: String,
    /// `manual` or `idp`.
    pub source: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl MemberRow {
    #[must_use]
    pub fn is_lead(&self) -> bool {
        self.role == "lead"
    }
}

const UNIT_COLUMNS: &str =
    r#""id","organizationId","parentId","kind","name","slug","externalId","createdAt","updatedAt""#;
const MEMBER_COLUMNS: &str =
    r#""organizationId","unitId","userId","role","source","createdAt","updatedAt""#;

async fn unit_exists(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    unit_id: &str,
) -> StoreResult<bool> {
    Ok(sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "OrgUnit" WHERE "id" = $1 AND "organizationId" = $2)"#,
    )
    .bind(unit_id)
    .bind(org_id)
    .fetch_one(&mut **tx)
    .await?)
}

/// Whether a sibling under `parent_id` (top level when `None`) already uses `slug`. The unique
/// index treats NULL parents as distinct, so top-level slugs are checked here, under the lock.
async fn slug_taken(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    parent_id: Option<&str>,
    slug: &str,
    except: Option<&str>,
) -> StoreResult<bool> {
    Ok(sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "OrgUnit"
             WHERE "organizationId" = $1 AND "parentId" IS NOT DISTINCT FROM $2 AND "slug" = $3
               AND "id" IS DISTINCT FROM $4)"#,
    )
    .bind(org_id)
    .bind(parent_id)
    .bind(slug)
    .bind(except)
    .fetch_one(&mut **tx)
    .await?)
}

/// Creates a unit. An unknown parent (or another organisation's) is `NotFound`; a slug already
/// used by a sibling is `Conflict`.
pub async fn create(db: &PgPool, org_id: &str, unit: &NewUnit<'_>) -> StoreResult<UnitRow> {
    let mut tx = db.begin().await?;
    lock_tree(&mut tx, org_id).await?;
    if let Some(parent) = unit.parent_id
        && !unit_exists(&mut tx, org_id, parent).await?
    {
        return Err(StoreError::NotFound);
    }
    if slug_taken(&mut tx, org_id, unit.parent_id, unit.slug, None).await? {
        return Err(StoreError::Conflict);
    }
    let ts = now();
    let sql = format!(
        r#"INSERT INTO "OrgUnit" ("id","organizationId","parentId","kind","name","slug","externalId","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING {UNIT_COLUMNS}"#
    );
    let row = sqlx::query_as::<_, UnitRow>(&sql)
        .bind(new_id())
        .bind(org_id)
        .bind(unit.parent_id)
        .bind(unit.kind.as_str())
        .bind(unit.name)
        .bind(unit.slug)
        .bind(unit.external_id)
        .bind(ts)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// Hangs `unit_id` under `new_parent` (top level when `None`). A move under the unit itself or
/// one of its descendants is `Conflict`, as is a slug clash at the destination.
pub async fn move_to(
    db: &PgPool,
    org_id: &str,
    unit_id: &str,
    new_parent: Option<&str>,
) -> StoreResult<UnitRow> {
    let mut tx = db.begin().await?;
    lock_tree(&mut tx, org_id).await?;
    let slug = sqlx::query_scalar::<_, String>(
        r#"SELECT "slug" FROM "OrgUnit" WHERE "id" = $1 AND "organizationId" = $2"#,
    )
    .bind(unit_id)
    .bind(org_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(StoreError::NotFound)?;
    if let Some(parent) = new_parent {
        if !unit_exists(&mut tx, org_id, parent).await? {
            return Err(StoreError::NotFound);
        }
        // The new parent, or any unit above it, is the moved unit: the move would close a loop.
        let cycle = sqlx::query_scalar::<_, bool>(
            r#"WITH RECURSIVE up("id") AS (
                 SELECT "id" FROM "OrgUnit" WHERE "id" = $1 AND "organizationId" = $3
                 UNION
                 SELECT u."parentId" FROM "OrgUnit" u JOIN up ON u."id" = up."id"
                 WHERE u."parentId" IS NOT NULL AND u."organizationId" = $3
               )
               SELECT EXISTS (SELECT 1 FROM up WHERE "id" = $2)"#,
        )
        .bind(parent)
        .bind(unit_id)
        .bind(org_id)
        .fetch_one(&mut *tx)
        .await?;
        if cycle {
            return Err(StoreError::Conflict);
        }
    }
    if slug_taken(&mut tx, org_id, new_parent, &slug, Some(unit_id)).await? {
        return Err(StoreError::Conflict);
    }
    let sql = format!(
        r#"UPDATE "OrgUnit" SET "parentId" = $3, "updatedAt" = $4
           WHERE "id" = $1 AND "organizationId" = $2 RETURNING {UNIT_COLUMNS}"#
    );
    let row = sqlx::query_as::<_, UnitRow>(&sql)
        .bind(unit_id)
        .bind(org_id)
        .bind(new_parent)
        .bind(now())
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// Renames a unit or changes its external id. The slug and the parent stay.
pub async fn rename(
    db: &PgPool,
    org_id: &str,
    unit_id: &str,
    name: &str,
    external_id: Option<&str>,
) -> StoreResult<UnitRow> {
    let sql = format!(
        r#"UPDATE "OrgUnit" SET "name" = $3, "externalId" = $4, "updatedAt" = $5
           WHERE "id" = $1 AND "organizationId" = $2 RETURNING {UNIT_COLUMNS}"#
    );
    sqlx::query_as::<_, UnitRow>(&sql)
        .bind(unit_id)
        .bind(org_id)
        .bind(name)
        .bind(external_id)
        .bind(now())
        .fetch_optional(db)
        .await?
        .ok_or(StoreError::NotFound)
}

/// Deletes a unit with its memberships, and the grants and shares that name it. A unit that
/// still has children is `Conflict`: they are moved or deleted first.
pub async fn delete(db: &PgPool, org_id: &str, unit_id: &str) -> StoreResult<()> {
    let mut tx = db.begin().await?;
    lock_tree(&mut tx, org_id).await?;
    if !unit_exists(&mut tx, org_id, unit_id).await? {
        return Err(StoreError::NotFound);
    }
    let has_children = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "OrgUnit" WHERE "parentId" = $1 AND "organizationId" = $2)"#,
    )
    .bind(unit_id)
    .bind(org_id)
    .fetch_one(&mut *tx)
    .await?;
    if has_children {
        return Err(StoreError::Conflict);
    }
    for table in [r#""AssistantGrant""#, r#""ChatShare""#] {
        sqlx::query(&format!(
            r#"DELETE FROM {table} WHERE "organizationId" = $1 AND "subjectType" = 'unit' AND "subjectId" = $2"#
        ))
        .bind(org_id)
        .bind(unit_id)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(r#"DELETE FROM "OrgUnit" WHERE "id" = $1 AND "organizationId" = $2"#)
        .bind(unit_id)
        .bind(org_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn get(db: &PgPool, org_id: &str, unit_id: &str) -> StoreResult<UnitRow> {
    let sql = format!(
        r#"SELECT {UNIT_COLUMNS} FROM "OrgUnit" WHERE "id" = $1 AND "organizationId" = $2"#
    );
    sqlx::query_as::<_, UnitRow>(&sql)
        .bind(unit_id)
        .bind(org_id)
        .fetch_optional(db)
        .await?
        .ok_or(StoreError::NotFound)
}

/// Every unit of the organisation, oldest first; the caller builds the tree from `parent_id`.
pub async fn list(db: &PgPool, org_id: &str) -> StoreResult<Vec<UnitRow>> {
    let sql = format!(
        r#"SELECT {UNIT_COLUMNS} FROM "OrgUnit" WHERE "organizationId" = $1
           ORDER BY "createdAt" ASC, "id" ASC"#
    );
    Ok(sqlx::query_as::<_, UnitRow>(&sql)
        .bind(org_id)
        .fetch_all(db)
        .await?)
}

/// The organisation's unit tree.
pub async fn tree(db: &PgPool, org_id: &str) -> StoreResult<UnitTree> {
    let pairs = sqlx::query_as::<_, (String, Option<String>)>(
        r#"SELECT "id", "parentId" FROM "OrgUnit" WHERE "organizationId" = $1"#,
    )
    .bind(org_id)
    .fetch_all(db)
    .await?;
    UnitTree::new(pairs).map_err(corrupt)
}

/// A stored tree that is not a tree. The writes in this module cannot produce one.
pub(crate) fn corrupt(e: TreeError) -> StoreError {
    StoreError::Db(sqlx::Error::Protocol(format!("corrupt unit tree: {e}")))
}

/// Puts a user in a unit, or changes their role or source there. The user must be an accepted
/// member of the organisation and the unit one of its units, else `NotFound`.
pub async fn add_member(
    db: &PgPool,
    org_id: &str,
    unit_id: &str,
    user_id: &str,
    is_lead: bool,
    source: MemberSource,
) -> StoreResult<MemberRow> {
    let ts = now();
    let sql = format!(
        r#"INSERT INTO "OrgUnitMember" ("organizationId","unitId","userId","role","source","createdAt","updatedAt")
           SELECT $1, u."id", m."userId", $4, $5, $6, $6
           FROM "OrgUnit" u
           JOIN "OrganizationMember" m
             ON m."organizationId" = u."organizationId" AND m."userId" = $3 AND m."acceptedAt" IS NOT NULL
           WHERE u."id" = $2 AND u."organizationId" = $1
           ON CONFLICT ("unitId","userId")
             DO UPDATE SET "role" = EXCLUDED."role", "source" = EXCLUDED."source", "updatedAt" = EXCLUDED."updatedAt"
           RETURNING {MEMBER_COLUMNS}"#
    );
    sqlx::query_as::<_, MemberRow>(&sql)
        .bind(org_id)
        .bind(unit_id)
        .bind(user_id)
        .bind(if is_lead { "lead" } else { "member" })
        .bind(source.as_str())
        .bind(ts)
        .fetch_optional(db)
        .await?
        .ok_or(StoreError::NotFound)
}

pub async fn remove_member(
    db: &PgPool,
    org_id: &str,
    unit_id: &str,
    user_id: &str,
) -> StoreResult<()> {
    let done = sqlx::query(
        r#"DELETE FROM "OrgUnitMember" WHERE "organizationId" = $1 AND "unitId" = $2 AND "userId" = $3"#,
    )
    .bind(org_id)
    .bind(unit_id)
    .bind(user_id)
    .execute(db)
    .await?;
    if done.rows_affected() == 0 {
        return Err(StoreError::NotFound);
    }
    Ok(())
}

/// The direct members of one unit (not of the units below it).
pub async fn members(db: &PgPool, org_id: &str, unit_id: &str) -> StoreResult<Vec<MemberRow>> {
    let sql = format!(
        r#"SELECT {MEMBER_COLUMNS} FROM "OrgUnitMember"
           WHERE "organizationId" = $1 AND "unitId" = $2 ORDER BY "createdAt" ASC, "userId" ASC"#
    );
    Ok(sqlx::query_as::<_, MemberRow>(&sql)
        .bind(org_id)
        .bind(unit_id)
        .fetch_all(db)
        .await?)
}

/// The units one user is directly in.
pub async fn memberships_of(
    db: &PgPool,
    org_id: &str,
    user_id: &str,
) -> StoreResult<Vec<MemberRow>> {
    let sql = format!(
        r#"SELECT {MEMBER_COLUMNS} FROM "OrgUnitMember"
           WHERE "organizationId" = $1 AND "userId" = $2 ORDER BY "createdAt" ASC, "unitId" ASC"#
    );
    Ok(sqlx::query_as::<_, MemberRow>(&sql)
        .bind(org_id)
        .bind(user_id)
        .fetch_all(db)
        .await?)
}
