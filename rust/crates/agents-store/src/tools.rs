//! The tool rows a chat reads, and the execution log it writes.
//!
//! Old: `resolveToolsByNames` and `logToolExecution` in `src/lib/tools/registry.ts`.

use serde_json::Value;
use sqlx::PgPool;

use crate::{StoreResult, new_id};

/// A tool the chat may offer.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct ToolRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
}

/// The enabled tools with these names that the caller may use: the global built-ins, the
/// tools of the active organisation, and the tools of an organisation the user belongs to (the
/// old filter of `resolveToolsByNames`).
pub async fn find_by_names(
    db: &PgPool,
    names: &[String],
    organization_id: Option<&str>,
    user_id: &str,
) -> StoreResult<Vec<ToolRow>> {
    Ok(sqlx::query_as::<_, ToolRow>(
        r#"SELECT t."id", t."name", t."description", t."category" FROM "Tool" t
           WHERE t."name" = ANY($1) AND t."enabled" = true
             AND ((t."organizationId" IS NULL AND t."isBuiltIn" = true)
                  OR t."organizationId" = $2
                  OR t."organizationId" IN (SELECT m."organizationId" FROM "OrganizationMember" m
                                            WHERE m."userId" = $3))
           ORDER BY t."createdAt" ASC, t."id" ASC"#,
    )
    .bind(names)
    .bind(organization_id)
    .bind(user_id)
    .fetch_all(db)
    .await?)
}

/// One run of a tool, as `logToolExecution` wrote it.
#[derive(Debug, Clone, PartialEq)]
pub struct ToolExecution<'a> {
    pub tool_name: &'a str,
    pub tool_id: Option<&'a str>,
    pub assistant_id: Option<&'a str>,
    pub session_id: Option<&'a str>,
    pub organization_id: Option<&'a str>,
    pub user_id: &'a str,
    pub input: &'a Value,
    pub output: Option<&'a Value>,
    pub error: Option<&'a str>,
    pub duration_ms: i32,
}

/// Writes one row of the execution log.
pub async fn log_execution(db: &PgPool, run: &ToolExecution<'_>) -> StoreResult<()> {
    sqlx::query(
        r#"INSERT INTO "ToolExecution" ("id","toolName","toolId","assistantId","sessionId","input",
             "output","error","durationMs","status","organizationId","userId","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)"#,
    )
    .bind(new_id())
    .bind(run.tool_name)
    .bind(run.tool_id)
    .bind(run.assistant_id)
    .bind(run.session_id)
    .bind(sqlx::types::Json(run.input))
    .bind(run.output.map(sqlx::types::Json))
    .bind(run.error)
    .bind(run.duration_ms)
    .bind(if run.error.is_some() {
        "error"
    } else {
        "success"
    })
    .bind(run.organization_id)
    .bind(run.user_id)
    .bind(crate::now())
    .execute(db)
    .await?;
    Ok(())
}
