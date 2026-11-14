//! The catalogues the agent-builder wizard offers: the tools, skills, MCP servers and
//! knowledge base groups an organisation may use.
//!
//! Old: the `listTools`, `listSkills`, `listMcpServers` and `listKnowledgeGroups` closures
//! of `src/features/assistants/wizard/service.ts`. The tools, skills and MCP servers are the
//! organisation's own rows together with the global ones (`organizationId` null); the
//! knowledge base groups are the organisation's own only, as the old query had them.

use sqlx::PgPool;

use crate::StoreResult;

/// A tool the wizard may offer.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct ToolEntry {
    pub id: String,
    /// The name the wizard shows: the display name, or the machine name when there is none.
    pub name: String,
    pub description: String,
    pub category: String,
}

/// A skill the wizard may offer.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct SkillEntry {
    pub id: String,
    /// The name the wizard shows: the display name, or the machine name when there is none.
    pub name: String,
    /// The skill's description.
    pub summary: String,
}

/// An MCP server the wizard may offer.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct McpServerEntry {
    pub id: String,
    pub name: String,
    /// What the server does, in one line.
    pub tool_summary: String,
}

/// A knowledge base group the wizard may offer.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct KnowledgeGroupEntry {
    pub id: String,
    pub name: String,
    /// The group this one sits in, when it is nested.
    pub parent_id: Option<String>,
    /// How many documents the group holds.
    pub doc_count: i64,
}

/// The organisation's tools and the global ones.
pub async fn list_tools(db: &PgPool, org_id: &str) -> StoreResult<Vec<ToolEntry>> {
    Ok(sqlx::query_as::<_, ToolEntry>(
        r#"SELECT "id", COALESCE(NULLIF("displayName", ''), "name") AS "name",
                  "description", "category"
           FROM "Tool"
           WHERE "organizationId" = $1 OR "organizationId" IS NULL"#,
    )
    .bind(org_id)
    .fetch_all(db)
    .await?)
}

/// The organisation's skills and the global ones.
pub async fn list_skills(db: &PgPool, org_id: &str) -> StoreResult<Vec<SkillEntry>> {
    Ok(sqlx::query_as::<_, SkillEntry>(
        r#"SELECT "id", COALESCE(NULLIF("displayName", ''), "name") AS "name",
                  "description" AS "summary"
           FROM "Skill"
           WHERE "organizationId" = $1 OR "organizationId" IS NULL"#,
    )
    .bind(org_id)
    .fetch_all(db)
    .await?)
}

/// The organisation's MCP servers and the global ones.
pub async fn list_mcp_servers(db: &PgPool, org_id: &str) -> StoreResult<Vec<McpServerEntry>> {
    Ok(sqlx::query_as::<_, McpServerEntry>(
        r#"SELECT "id", "name", COALESCE("description", '') AS "toolSummary"
           FROM "McpServerConfig"
           WHERE "organizationId" = $1 OR "organizationId" IS NULL"#,
    )
    .bind(org_id)
    .fetch_all(db)
    .await?)
}

/// The organisation's own knowledge base groups, with how many live documents each holds.
///
/// Only the organisation's: unlike the other catalogues, the old wizard read the groups with
/// `where: { organizationId }` (`findKnowledgeGroupSummaries`), so a global group was never
/// offered. A soft-deleted document is not counted (`aliveDocumentRelation`).
pub async fn list_knowledge_groups(
    db: &PgPool,
    org_id: &str,
) -> StoreResult<Vec<KnowledgeGroupEntry>> {
    Ok(sqlx::query_as::<_, KnowledgeGroupEntry>(
        r#"SELECT g."id", g."name", g."parentId", COUNT(doc."id") AS "docCount"
           FROM "KnowledgeBaseGroup" g
           LEFT JOIN "DocumentGroup" d ON d."groupId" = g."id"
           LEFT JOIN "Document" doc ON doc."id" = d."documentId" AND doc."deletedAt" IS NULL
           WHERE g."organizationId" = $1
           GROUP BY g."id", g."name", g."parentId""#,
    )
    .bind(org_id)
    .fetch_all(db)
    .await?)
}

/// How many assistants the organisation has. The wizard's prompt says the number.
pub async fn count_assistants(db: &PgPool, org_id: &str) -> StoreResult<i64> {
    Ok(
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "Assistant" WHERE "organizationId" = $1"#)
            .bind(org_id)
            .fetch_one(db)
            .await?,
    )
}
