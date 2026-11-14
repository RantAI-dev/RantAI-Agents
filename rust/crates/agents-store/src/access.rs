//! What `agents_core::authz` needs from the database, and the list queries that filter by the
//! same rule in SQL.
//!
//! The lists never load broadly and filter in memory: [`visible_assistants`] and
//! [`sessions_shared_with`] apply the §3.3 and §3.4 rules in one query each, with a recursive CTE
//! for unit inheritance. `tests/authz_visibility.rs` checks that they agree with
//! `authz::authorize` over every (user, agent) and (user, session) pair of a generated org.

use agents_core::authz::{
    Permission, Principal, Subject, SubjectType, UnitMembership, UnitTree, is_org_admin, role_has,
};
use agents_core::org::OrgRole;
use sqlx::{PgPool, Postgres, Transaction};

use crate::StoreResult;
use crate::assistants::{AssistantRow, COLUMNS as ASSISTANT_COLUMNS};
use crate::sessions::{SESSION_COLUMNS, SessionRow};
use crate::units::corrupt;

/// Serialises, per organisation, every write that depends on the unit tree: moves (the cycle
/// check), deletes, and new grants and shares naming a unit that a delete could remove.
pub(crate) async fn lock_subjects(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
) -> StoreResult<()> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('org_unit_tree:' || $1, 0))")
        .bind(org_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

/// Whether `subject` is the organisation itself, one of its units, or one of its accepted
/// members.
pub(crate) async fn subject_in_org(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    subject: &Subject,
) -> StoreResult<bool> {
    let sql = match subject.kind {
        SubjectType::Org => return Ok(subject.id == org_id),
        SubjectType::Unit => {
            r#"SELECT EXISTS (SELECT 1 FROM "OrgUnit" WHERE "id" = $2 AND "organizationId" = $1)"#
        }
        SubjectType::User => {
            r#"SELECT EXISTS (SELECT 1 FROM "OrganizationMember"
                 WHERE "userId" = $2 AND "organizationId" = $1 AND "acceptedAt" IS NOT NULL)"#
        }
    };
    Ok(sqlx::query_scalar::<_, bool>(sql)
        .bind(org_id)
        .bind(&subject.id)
        .fetch_one(&mut **tx)
        .await?)
}

/// The caller in `org_id`, with their units resolved against the org's tree. `None` when the
/// user does not exist, is not an accepted member, or holds a role this code does not know.
pub async fn principal(db: &PgPool, user_id: &str, org_id: &str) -> StoreResult<Option<Principal>> {
    let Some((platform_role, org_role)) = sqlx::query_as::<_, (String, String)>(
        r#"SELECT u."role"::text, m."role" FROM "Agent" u
           JOIN "OrganizationMember" m
             ON m."userId" = u."id" AND m."organizationId" = $2 AND m."acceptedAt" IS NOT NULL
           WHERE u."id" = $1"#,
    )
    .bind(user_id)
    .bind(org_id)
    .fetch_optional(db)
    .await?
    else {
        return Ok(None);
    };
    let Some(role) = OrgRole::parse(&org_role) else {
        return Ok(None);
    };
    // Every unit of the org, with the caller's membership role where they have one.
    let rows = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
        r#"SELECT u."id", u."parentId", m."role" FROM "OrgUnit" u
           LEFT JOIN "OrgUnitMember" m
             ON m."unitId" = u."id" AND m."userId" = $2 AND m."organizationId" = $1
           WHERE u."organizationId" = $1"#,
    )
    .bind(org_id)
    .bind(user_id)
    .fetch_all(db)
    .await?;
    let units = rows
        .iter()
        .filter_map(|(id, _, member)| {
            member.as_ref().map(|r| UnitMembership {
                unit_id: id.clone(),
                is_lead: r == "lead",
            })
        })
        .collect();
    let tree =
        UnitTree::new(rows.into_iter().map(|(id, parent, _)| (id, parent))).map_err(corrupt)?;
    Ok(Some(Principal::new(
        user_id,
        org_id,
        role,
        platform_role == "ADMIN",
        units,
        &tree,
    )))
}

/// The units whose grants and shares reach user `$2` in org `$1`: theirs and every unit above.
const REACH: &str = r#"reach("id") AS (
    SELECT m."unitId" FROM "OrgUnitMember" m WHERE m."userId" = $2 AND m."organizationId" = $1
    UNION
    SELECT u."parentId" FROM "OrgUnit" u JOIN reach r ON u."id" = r."id"
    WHERE u."parentId" IS NOT NULL AND u."organizationId" = $1
)"#;

/// A grant or share row `t` reaching user `$2` in org `$1`.
fn subject_matches(t: &str) -> String {
    format!(
        r#"(({t}."subjectType" = 'org' AND {t}."subjectId" = $1)
          OR ({t}."subjectType" = 'user' AND {t}."subjectId" = $2)
          OR ({t}."subjectType" = 'unit' AND {t}."subjectId" IN (SELECT "id" FROM reach)))"#
    )
}

/// The agents the principal may use (§3.3): built-ins, and the org's agents that they
/// administer or that a grant reaches. Built-ins first, then newest first.
pub async fn visible_assistants(db: &PgPool, p: &Principal) -> StoreResult<Vec<AssistantRow>> {
    let sql = format!(
        r#"WITH RECURSIVE {REACH}
           SELECT {ASSISTANT_COLUMNS} FROM "Assistant"
           WHERE {}
           ORDER BY "isBuiltIn" DESC, "createdAt" DESC, "id" ASC"#,
        usable("Assistant"),
    );
    Ok(sqlx::query_as::<_, AssistantRow>(&sql)
        .bind(&p.organization_id)
        .bind(&p.user_id)
        .bind(is_org_admin(p.role))
        .fetch_all(db)
        .await?)
}

/// "This agent is one the principal may use" (§3.3), the SQL twin of
/// `authz::can_use_agent`. `t` is the quoted table name of the agent row.
fn usable(t: &str) -> String {
    format!(
        r#"(("{t}"."isBuiltIn" = true AND ("{t}"."organizationId" IS NULL OR "{t}"."organizationId" = $1))
        OR ("{t}"."isBuiltIn" = false AND "{t}"."organizationId" = $1 AND (
              $3 OR EXISTS (
                SELECT 1 FROM "AssistantGrant" g
                WHERE g."assistantId" = "{t}"."id" AND g."organizationId" = $1
                  AND {}))))"#,
        subject_matches("g"),
    )
}

/// The default assistant of the principal, and where it came from.
///
/// The user's own choice when they may still use it, else the organisation's default when they
/// may use it, else the first built-in (differences rows 41 and 60). A default the caller may
/// not use is skipped rather than answered: §3.3 sends the default resolution through the same
/// check as the list and the chat.
pub async fn resolve_default(
    db: &PgPool,
    p: &Principal,
) -> StoreResult<crate::assistants::ResolvedDefault> {
    use crate::assistants::{DefaultSource, ResolvedDefault};

    let sql = format!(
        r#"WITH RECURSIVE {REACH}
           SELECT
             COALESCE(
               (SELECT p."defaultAssistantId" FROM "UserPreference" p
                  WHERE p."userId" = $2
                    AND EXISTS (SELECT 1 FROM "Assistant" x
                                 WHERE x."id" = p."defaultAssistantId" AND {use_x})),
               (SELECT y."id" FROM "Assistant" y
                  WHERE y."organizationId" = $1 AND y."isSystemDefault" AND {use_y}
                  LIMIT 1),
               (SELECT z."id" FROM "Assistant" z WHERE z."isBuiltIn"
                  ORDER BY z."isSystemDefault" DESC, z."createdAt" ASC, z."id" ASC LIMIT 1)
             ) AS "id",
             CASE
               WHEN EXISTS (SELECT 1 FROM "UserPreference" p JOIN "Assistant" x
                              ON x."id" = p."defaultAssistantId"
                             WHERE p."userId" = $2 AND {use_x}) THEN 'user'
               WHEN EXISTS (SELECT 1 FROM "Assistant" y
                             WHERE y."organizationId" = $1 AND y."isSystemDefault" AND {use_y})
                 THEN 'system'
               WHEN EXISTS (SELECT 1 FROM "Assistant" z WHERE z."isBuiltIn") THEN 'fallback'
               ELSE 'none'
             END AS "source""#,
        use_x = usable("x"),
        use_y = usable("y"),
    );
    let (id, source) = sqlx::query_as::<_, (Option<String>, String)>(&sql)
        .bind(&p.organization_id)
        .bind(&p.user_id)
        .bind(is_org_admin(p.role))
        .fetch_one(db)
        .await?;
    let source = DefaultSource::parse(&source).unwrap_or(DefaultSource::None);
    let Some(id) = id else {
        return Ok(ResolvedDefault {
            assistant: None,
            source,
        });
    };
    let assistant = sqlx::query_as::<_, AssistantRow>(&format!(
        r#"SELECT {ASSISTANT_COLUMNS} FROM "Assistant" WHERE "id" = $1"#,
    ))
    .bind(&id)
    .fetch_optional(db)
    .await?;
    Ok(ResolvedDefault { assistant, source })
}

/// Other users' sessions of the org that an active share reaches the principal through (§3.4),
/// most recently updated first. The caller's own sessions are not listed here.
pub async fn sessions_shared_with(db: &PgPool, p: &Principal) -> StoreResult<Vec<SessionRow>> {
    if !role_has(p.role, Permission::ChatsReadShared) {
        return Ok(Vec::new());
    }
    let sql = format!(
        r#"WITH RECURSIVE {REACH}
           SELECT {SESSION_COLUMNS} FROM "DashboardSession"
           WHERE "organizationId" = $1 AND "userId" <> $2 AND EXISTS (
             SELECT 1 FROM "ChatShare" c
             WHERE c."sessionId" = "DashboardSession"."id" AND c."organizationId" = $1
               AND c."revokedAt" IS NULL AND {share}
           )
           ORDER BY "updatedAt" DESC, "id" ASC"#,
        share = subject_matches("c"),
    );
    Ok(sqlx::query_as::<_, SessionRow>(&sql)
        .bind(&p.organization_id)
        .bind(&p.user_id)
        .fetch_all(db)
        .await?)
}
