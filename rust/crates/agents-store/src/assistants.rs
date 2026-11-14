//! `Assistant` rows and their bindings (`AssistantTool`, `AssistantSkill`, `AssistantMcpServer`,
//! `AssistantWorkflow`). Access rules live in `agents_core::assistant`, not here: these functions
//! do exactly what they are asked, and callers check first.

use chrono::NaiveDateTime;
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};

use crate::{StoreError, StoreResult, new_id, now};

#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct AssistantRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub emoji: String,
    pub system_prompt: String,
    pub model: String,
    pub use_knowledge_base: bool,
    pub knowledge_base_group_ids: Vec<String>,
    pub is_system_default: bool,
    pub is_built_in: bool,
    pub organization_id: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub live_chat_enabled: bool,
    pub avatar_s3_key: Option<String>,
    pub model_config: Option<Value>,
    pub opening_message: Option<String>,
    pub opening_questions: Vec<String>,
    pub guard_rails: Option<Value>,
    pub chat_config: Option<Value>,
    pub memory_config: Option<Value>,
    pub tags: Vec<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Every writable column. Create sets all of them; update writes the whole row back, so the
/// caller merges a partial update onto the current row first (read, merge, write).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct AssistantFields {
    pub name: String,
    pub description: Option<String>,
    pub emoji: String,
    pub system_prompt: String,
    pub model: String,
    pub use_knowledge_base: bool,
    pub knowledge_base_group_ids: Vec<String>,
    pub live_chat_enabled: bool,
    pub avatar_s3_key: Option<String>,
    pub model_config: Option<Value>,
    pub opening_message: Option<String>,
    pub opening_questions: Vec<String>,
    pub guard_rails: Option<Value>,
    pub chat_config: Option<Value>,
    pub memory_config: Option<Value>,
    pub tags: Vec<String>,
}

impl From<&AssistantRow> for AssistantFields {
    fn from(r: &AssistantRow) -> Self {
        Self {
            name: r.name.clone(),
            description: r.description.clone(),
            emoji: r.emoji.clone(),
            system_prompt: r.system_prompt.clone(),
            model: r.model.clone(),
            use_knowledge_base: r.use_knowledge_base,
            knowledge_base_group_ids: r.knowledge_base_group_ids.clone(),
            live_chat_enabled: r.live_chat_enabled,
            avatar_s3_key: r.avatar_s3_key.clone(),
            model_config: r.model_config.clone(),
            opening_message: r.opening_message.clone(),
            opening_questions: r.opening_questions.clone(),
            guard_rails: r.guard_rails.clone(),
            chat_config: r.chat_config.clone(),
            memory_config: r.memory_config.clone(),
            tags: r.tags.clone(),
        }
    }
}

pub(crate) const COLUMNS: &str = r#""id","name","description","emoji","systemPrompt","model","useKnowledgeBase",
"knowledgeBaseGroupIds","isSystemDefault","isBuiltIn","organizationId","createdBy","updatedBy",
"liveChatEnabled","avatarS3Key","modelConfig","openingMessage","openingQuestions","guardRails",
"chatConfig","memoryConfig","tags","createdAt","updatedAt""#;

/// Built-ins plus the organisation's own assistants, built-ins first, then newest first.
pub async fn list_visible(db: &PgPool, org_id: &str) -> StoreResult<Vec<AssistantRow>> {
    let sql = format!(
        r#"SELECT {COLUMNS} FROM "Assistant"
           WHERE "isBuiltIn" = true OR "organizationId" = $1
           ORDER BY "isBuiltIn" ASC, "createdAt" DESC"#
    );
    Ok(sqlx::query_as::<_, AssistantRow>(&sql)
        .bind(org_id)
        .fetch_all(db)
        .await?)
}

pub async fn get(db: &PgPool, id: &str) -> StoreResult<AssistantRow> {
    let sql = format!(r#"SELECT {COLUMNS} FROM "Assistant" WHERE "id" = $1"#);
    sqlx::query_as::<_, AssistantRow>(&sql)
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(StoreError::NotFound)
}

pub async fn create(
    db: &PgPool,
    org_id: &str,
    user_id: &str,
    f: &AssistantFields,
) -> StoreResult<AssistantRow> {
    let ts = now();
    let sql = format!(
        r#"INSERT INTO "Assistant" ("id","name","description","emoji","systemPrompt","model",
             "useKnowledgeBase","knowledgeBaseGroupIds","isSystemDefault","isBuiltIn","organizationId",
             "createdBy","updatedBy","liveChatEnabled","avatarS3Key","modelConfig","openingMessage",
             "openingQuestions","guardRails","chatConfig","memoryConfig","tags","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,false,$9,$10,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)
           RETURNING {COLUMNS}"#
    );
    Ok(sqlx::query_as::<_, AssistantRow>(&sql)
        .bind(new_id())
        .bind(&f.name)
        .bind(&f.description)
        .bind(&f.emoji)
        .bind(&f.system_prompt)
        .bind(&f.model)
        .bind(f.use_knowledge_base)
        .bind(&f.knowledge_base_group_ids)
        .bind(org_id)
        .bind(user_id)
        .bind(f.live_chat_enabled)
        .bind(&f.avatar_s3_key)
        .bind(&f.model_config)
        .bind(&f.opening_message)
        .bind(&f.opening_questions)
        .bind(&f.guard_rails)
        .bind(&f.chat_config)
        .bind(&f.memory_config)
        .bind(&f.tags)
        .bind(ts)
        .fetch_one(db)
        .await?)
}

/// Writes every field. `expected_updated_at` makes it a compare-and-swap: if someone else saved
/// since the caller read the row, nothing is written and the result is [`StoreError::Conflict`].
pub async fn update(
    db: &PgPool,
    id: &str,
    user_id: &str,
    f: &AssistantFields,
    expected_updated_at: NaiveDateTime,
) -> StoreResult<AssistantRow> {
    let sql = format!(
        r#"UPDATE "Assistant" SET "name"=$2,"description"=$3,"emoji"=$4,"systemPrompt"=$5,"model"=$6,
             "useKnowledgeBase"=$7,"knowledgeBaseGroupIds"=$8,"liveChatEnabled"=$9,"avatarS3Key"=$10,
             "modelConfig"=$11,"openingMessage"=$12,"openingQuestions"=$13,"guardRails"=$14,
             "chatConfig"=$15,"memoryConfig"=$16,"tags"=$17,"updatedBy"=$18,"updatedAt"=$19
           WHERE "id"=$1 AND "updatedAt"=$20
           RETURNING {COLUMNS}"#
    );
    let row = sqlx::query_as::<_, AssistantRow>(&sql)
        .bind(id)
        .bind(&f.name)
        .bind(&f.description)
        .bind(&f.emoji)
        .bind(&f.system_prompt)
        .bind(&f.model)
        .bind(f.use_knowledge_base)
        .bind(&f.knowledge_base_group_ids)
        .bind(f.live_chat_enabled)
        .bind(&f.avatar_s3_key)
        .bind(&f.model_config)
        .bind(&f.opening_message)
        .bind(&f.opening_questions)
        .bind(&f.guard_rails)
        .bind(&f.chat_config)
        .bind(&f.memory_config)
        .bind(&f.tags)
        .bind(user_id)
        .bind(now())
        .bind(expected_updated_at)
        .fetch_optional(db)
        .await?;
    match row {
        Some(r) => Ok(r),
        None => match get(db, id).await {
            Ok(_) => Err(StoreError::Conflict),
            Err(e) => Err(e),
        },
    }
}

/// Deletes the assistant; bindings go with it (`ON DELETE CASCADE`).
pub async fn delete(db: &PgPool, id: &str) -> StoreResult<()> {
    let done = sqlx::query(r#"DELETE FROM "Assistant" WHERE "id" = $1"#)
        .bind(id)
        .execute(db)
        .await?;
    if done.rows_affected() == 0 {
        return Err(StoreError::NotFound);
    }
    Ok(())
}

/// The four binding tables. Each row is `(assistantId, <target>Id, enabled)`; skills add `priority`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Binding {
    Tool,
    Skill,
    McpServer,
    Workflow,
}

impl Binding {
    const fn table(self) -> &'static str {
        match self {
            Self::Tool => r#""AssistantTool""#,
            Self::Skill => r#""AssistantSkill""#,
            Self::McpServer => r#""AssistantMcpServer""#,
            Self::Workflow => r#""AssistantWorkflow""#,
        }
    }

    const fn target_column(self) -> &'static str {
        match self {
            Self::Tool => r#""toolId""#,
            Self::Skill => r#""skillId""#,
            Self::McpServer => r#""mcpServerId""#,
            Self::Workflow => r#""workflowId""#,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BindingRow {
    pub target_id: String,
    pub enabled: bool,
}

/// Bound ids in a stable order: skills by priority, the rest by when they were bound.
pub async fn list_bindings(
    db: &PgPool,
    assistant_id: &str,
    kind: Binding,
) -> StoreResult<Vec<BindingRow>> {
    let order = if kind == Binding::Skill {
        r#""priority" ASC, "createdAt" ASC"#
    } else {
        r#""createdAt" ASC"#
    };
    let sql = format!(
        r#"SELECT {target} AS target_id, "enabled" FROM {table} WHERE "assistantId" = $1 ORDER BY {order}"#,
        target = kind.target_column(),
        table = kind.table(),
    );
    let rows: Vec<(String, bool)> = sqlx::query_as(&sql)
        .bind(assistant_id)
        .fetch_all(db)
        .await?;
    Ok(rows
        .into_iter()
        .map(|(target_id, enabled)| BindingRow { target_id, enabled })
        .collect())
}

/// Replaces every binding of one kind in one transaction. For skills, the position in
/// `target_ids` becomes the priority. Duplicates keep their first position.
pub async fn replace_bindings(
    db: &PgPool,
    assistant_id: &str,
    kind: Binding,
    target_ids: &[String],
) -> StoreResult<()> {
    let mut tx: Transaction<'_, Postgres> = db.begin().await?;
    let del = format!(r#"DELETE FROM {} WHERE "assistantId" = $1"#, kind.table());
    sqlx::query(&del)
        .bind(assistant_id)
        .execute(&mut *tx)
        .await?;
    let ts = now();
    let mut seen = std::collections::HashSet::new();
    for (pos, target) in target_ids.iter().enumerate() {
        if !seen.insert(target) {
            continue;
        }
        if kind == Binding::Skill {
            let priority = i32::try_from(pos).unwrap_or(i32::MAX);
            sqlx::query(
                r#"INSERT INTO "AssistantSkill" ("id","assistantId","skillId","enabled","priority","createdAt")
                   VALUES ($1,$2,$3,true,$4,$5)"#,
            )
            .bind(new_id())
            .bind(assistant_id)
            .bind(target)
            .bind(priority)
            .bind(ts)
            .execute(&mut *tx)
            .await?;
        } else {
            let ins = format!(
                r#"INSERT INTO {table} ("id","assistantId",{target},"enabled","createdAt") VALUES ($1,$2,$3,true,$4)"#,
                table = kind.table(),
                target = kind.target_column(),
            );
            sqlx::query(&ins)
                .bind(new_id())
                .bind(assistant_id)
                .bind(target)
                .bind(ts)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    Ok(())
}

/// Makes `assistant_id` the default for its organisation only. The TypeScript cleared
/// `isSystemDefault` across every organisation (docs/port/differences.md).
pub async fn set_org_default(db: &PgPool, org_id: &str, assistant_id: &str) -> StoreResult<()> {
    let mut tx = db.begin().await?;
    sqlx::query(r#"UPDATE "Assistant" SET "isSystemDefault"=false, "updatedAt"=$2 WHERE "organizationId"=$1 AND "isSystemDefault"=true"#)
        .bind(org_id)
        .bind(now())
        .execute(&mut *tx)
        .await?;
    let done = sqlx::query(r#"UPDATE "Assistant" SET "isSystemDefault"=true, "updatedAt"=$3 WHERE "id"=$1 AND "organizationId"=$2"#)
        .bind(assistant_id)
        .bind(org_id)
        .bind(now())
        .execute(&mut *tx)
        .await?;
    if done.rows_affected() == 0 {
        return Err(StoreError::NotFound);
    }
    tx.commit().await?;
    Ok(())
}

pub async fn clear_org_default(db: &PgPool, org_id: &str) -> StoreResult<()> {
    sqlx::query(r#"UPDATE "Assistant" SET "isSystemDefault"=false, "updatedAt"=$2 WHERE "organizationId"=$1 AND "isSystemDefault"=true"#)
        .bind(org_id)
        .bind(now())
        .execute(db)
        .await?;
    Ok(())
}

/// The assistant a new chat uses: the user's own choice if it is still visible to the
/// organisation, else the organisation's default, else the first built-in default.
pub async fn resolve_default(
    db: &PgPool,
    user_id: &str,
    org_id: &str,
) -> StoreResult<Option<AssistantRow>> {
    let sql = format!(
        r#"WITH pick AS (SELECT COALESCE(
               (SELECT p."defaultAssistantId" FROM "UserPreference" p
                  JOIN "Assistant" x ON x."id" = p."defaultAssistantId"
                  WHERE p."userId" = $1 AND (x."isBuiltIn" OR x."organizationId" = $2)),
               (SELECT y."id" FROM "Assistant" y WHERE y."organizationId" = $2 AND y."isSystemDefault" LIMIT 1),
               (SELECT z."id" FROM "Assistant" z WHERE z."isBuiltIn"
                  ORDER BY z."isSystemDefault" DESC, z."createdAt" ASC LIMIT 1)
             ) AS id)
           SELECT {COLUMNS} FROM "Assistant" WHERE "id" = (SELECT id FROM pick)"#
    );
    Ok(sqlx::query_as::<_, AssistantRow>(&sql)
        .bind(user_id)
        .bind(org_id)
        .fetch_optional(db)
        .await?)
}

/// The user's preference row: the assistant they chose and their sidebar settings.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct UserPreference {
    pub default_assistant_id: Option<String>,
    pub sidebar_config: Option<Value>,
}

/// The user's preference row, if they have one.
pub async fn user_preference(db: &PgPool, user_id: &str) -> StoreResult<Option<UserPreference>> {
    Ok(sqlx::query_as::<_, UserPreference>(
        r#"SELECT "defaultAssistantId", "sidebarConfig" FROM "UserPreference" WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?)
}

/// Sets the user's preferred assistant (one `UserPreference` row per user).
pub async fn set_user_default(
    db: &PgPool,
    user_id: &str,
    assistant_id: Option<&str>,
) -> StoreResult<()> {
    let ts = now();
    sqlx::query(
        r#"INSERT INTO "UserPreference" ("id","userId","defaultAssistantId","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$4)
           ON CONFLICT ("userId") DO UPDATE SET "defaultAssistantId"=EXCLUDED."defaultAssistantId","updatedAt"=EXCLUDED."updatedAt""#,
    )
    .bind(new_id())
    .bind(user_id)
    .bind(assistant_id)
    .bind(ts)
    .execute(db)
    .await?;
    Ok(())
}

/// Sets the user's sidebar settings (one `UserPreference` row per user).
///
/// The old route stored the sidebar settings next to the chosen assistant, so the row is
/// the same one: the settings are written on their own and the assistant is left as it is.
pub async fn set_user_sidebar_config(
    db: &PgPool,
    user_id: &str,
    config: Option<&Value>,
) -> StoreResult<()> {
    let ts = now();
    sqlx::query(
        r#"INSERT INTO "UserPreference" ("id","userId","sidebarConfig","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$4)
           ON CONFLICT ("userId") DO UPDATE SET "sidebarConfig"=EXCLUDED."sidebarConfig","updatedAt"=EXCLUDED."updatedAt""#,
    )
    .bind(new_id())
    .bind(user_id)
    .bind(config)
    .bind(ts)
    .execute(db)
    .await?;
    Ok(())
}

/// Where the default assistant came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DefaultSource {
    /// The user chose it.
    User,
    /// The organisation's default.
    System,
    /// The first built-in, because the organisation has no default.
    Fallback,
    /// There is no assistant at all.
    None,
}

impl DefaultSource {
    /// The name the API sends.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::System => "system",
            Self::Fallback => "fallback",
            Self::None => "none",
        }
    }
}

/// The default assistant and where it came from.
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedDefault {
    pub assistant: Option<AssistantRow>,
    pub source: DefaultSource,
}

/// The default assistant of a user in an organisation, and where it came from.
///
/// The same order as [`resolve_default`]: the user's own choice (when the organisation may see
/// it), then the organisation's default, then the first built-in.
pub async fn resolve_default_with_source(
    db: &PgPool,
    user_id: &str,
    org_id: &str,
) -> StoreResult<ResolvedDefault> {
    let assistant = resolve_default(db, user_id, org_id).await?;
    let source = default_source(db, user_id, org_id).await?;
    Ok(ResolvedDefault { assistant, source })
}

/// Which of the three candidates the default comes from.
async fn default_source(db: &PgPool, user_id: &str, org_id: &str) -> StoreResult<DefaultSource> {
    let sql = r#"SELECT CASE
        WHEN EXISTS (SELECT 1 FROM "UserPreference" p JOIN "Assistant" x ON x."id" = p."defaultAssistantId"
                      WHERE p."userId" = $1 AND (x."isBuiltIn" OR x."organizationId" = $2)) THEN 'user'
        WHEN EXISTS (SELECT 1 FROM "Assistant" y WHERE y."organizationId" = $2 AND y."isSystemDefault") THEN 'system'
        WHEN EXISTS (SELECT 1 FROM "Assistant" z WHERE z."isBuiltIn") THEN 'fallback'
        ELSE 'none' END AS source"#;
    let source: String = sqlx::query_scalar(sql)
        .bind(user_id)
        .bind(org_id)
        .fetch_one(db)
        .await?;
    Ok(match source.as_str() {
        "user" => DefaultSource::User,
        "system" => DefaultSource::System,
        "fallback" => DefaultSource::Fallback,
        _ => DefaultSource::None,
    })
}

/// A tool bound to an assistant, with the tool's own fields.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct ToolBinding {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub category: String,
    pub icon: Option<String>,
    pub is_built_in: bool,
    pub enabled: bool,
    pub user_selectable: bool,
    /// The binding's own flag: the tool is on for this assistant.
    pub bound_enabled: bool,
}

/// The tools bound to an assistant, in the order they were bound.
pub async fn list_tool_bindings(db: &PgPool, assistant_id: &str) -> StoreResult<Vec<ToolBinding>> {
    Ok(sqlx::query_as::<_, ToolBinding>(
        r#"SELECT t."id", t."name", t."displayName", t."description", t."category", t."icon",
                  t."isBuiltIn", t."enabled", t."userSelectable", b."enabled" AS "boundEnabled"
           FROM "AssistantTool" b JOIN "Tool" t ON t."id" = b."toolId"
           WHERE b."assistantId" = $1 ORDER BY b."createdAt" ASC"#,
    )
    .bind(assistant_id)
    .fetch_all(db)
    .await?)
}

/// The ids of the tools that are hidden from the assistant's picker (`userSelectable = false`).
/// A binding PUT must not drop them.
pub async fn hidden_tool_ids(db: &PgPool, assistant_id: &str) -> StoreResult<Vec<String>> {
    Ok(sqlx::query_scalar(
        r#"SELECT b."toolId" FROM "AssistantTool" b JOIN "Tool" t ON t."id" = b."toolId"
           WHERE b."assistantId" = $1 AND t."userSelectable" = false"#,
    )
    .bind(assistant_id)
    .fetch_all(db)
    .await?)
}

/// A skill bound to an assistant, with the skill's own fields.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct SkillBinding {
    /// The id of the binding row, not of the skill.
    pub binding_id: String,
    pub skill_id: String,
    pub display_name: String,
    pub description: String,
    pub icon: Option<String>,
    pub enabled: bool,
    pub priority: i32,
}

/// The skills bound to an assistant. Only the enabled ones are listed, as before.
pub async fn list_skill_bindings(
    db: &PgPool,
    assistant_id: &str,
) -> StoreResult<Vec<SkillBinding>> {
    Ok(sqlx::query_as::<_, SkillBinding>(
        r#"SELECT b."id" AS "bindingId", b."skillId", s."displayName", s."description", s."icon",
                  b."enabled", b."priority"
           FROM "AssistantSkill" b JOIN "Skill" s ON s."id" = b."skillId"
           WHERE b."assistantId" = $1 AND b."enabled" = true
           ORDER BY b."priority" ASC, b."createdAt" ASC"#,
    )
    .bind(assistant_id)
    .fetch_all(db)
    .await?)
}

/// An MCP server bound to an assistant, with the server's own fields.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct McpServerBinding {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub transport: String,
    pub enabled: bool,
    pub last_connected_at: Option<NaiveDateTime>,
    pub last_error: Option<String>,
    pub tool_count: i64,
    /// The binding's own flag: the server is on for this assistant.
    pub bound_enabled: bool,
}

/// The MCP servers bound to an assistant.
pub async fn list_mcp_server_bindings(
    db: &PgPool,
    assistant_id: &str,
) -> StoreResult<Vec<McpServerBinding>> {
    Ok(sqlx::query_as::<_, McpServerBinding>(
        r#"SELECT m."id", m."name", m."description", m."transport", m."enabled", m."lastConnectedAt",
                  m."lastError",
                  (SELECT COUNT(*) FROM "Tool" t WHERE t."mcpServerId" = m."id") AS "toolCount",
                  b."enabled" AS "boundEnabled"
           FROM "AssistantMcpServer" b JOIN "McpServerConfig" m ON m."id" = b."mcpServerId"
           WHERE b."assistantId" = $1 ORDER BY b."createdAt" ASC"#,
    )
    .bind(assistant_id)
    .fetch_all(db)
    .await?)
}

/// A workflow bound to an assistant, with the workflow's own fields.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct WorkflowBinding {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub mode: String,
    pub category: String,
    pub trigger: Value,
    pub tags: Vec<String>,
    pub nodes: Value,
    /// How many times the workflow ran.
    pub runs: i64,
    /// The binding's own flag: the workflow is on for this assistant.
    pub bound_enabled: bool,
}

/// The workflows bound to an assistant.
pub async fn list_workflow_bindings(
    db: &PgPool,
    assistant_id: &str,
) -> StoreResult<Vec<WorkflowBinding>> {
    Ok(sqlx::query_as::<_, WorkflowBinding>(
        r#"SELECT w."id", w."name", w."description", w."status"::text AS "status",
                  w."mode"::text AS "mode", w."category"::text AS "category", w."trigger", w."tags",
                  w."nodes",
                  (SELECT COUNT(*) FROM "WorkflowRun" r WHERE r."workflowId" = w."id") AS "runs",
                  b."enabled" AS "boundEnabled"
           FROM "AssistantWorkflow" b JOIN "Workflow" w ON w."id" = b."workflowId"
           WHERE b."assistantId" = $1 ORDER BY b."createdAt" ASC"#,
    )
    .bind(assistant_id)
    .fetch_all(db)
    .await?)
}

/// How many tools each assistant has: the tool count the list shows.
pub async fn tool_counts(db: &PgPool, org_id: &str) -> StoreResult<Vec<(String, i64)>> {
    Ok(sqlx::query_as::<_, (String, i64)>(
        r#"SELECT a."id", COUNT(b."id")::bigint FROM "Assistant" a
           LEFT JOIN "AssistantTool" b ON b."assistantId" = a."id"
           WHERE a."isBuiltIn" = true OR a."organizationId" = $1
           GROUP BY a."id""#,
    )
    .bind(org_id)
    .fetch_all(db)
    .await?)
}

/// Whether the assistant has an active chatflow workflow.
///
/// The chatflow runs instead of the plain chat (`findActiveChatflowByAssistantId` in the
/// TypeScript), so the plain chat service must not answer for such an assistant.
pub async fn has_active_chatflow(db: &PgPool, assistant_id: &str) -> StoreResult<bool> {
    let found: Option<bool> = sqlx::query_scalar(
        r#"SELECT EXISTS(SELECT 1 FROM "Workflow"
           WHERE "assistantId"=$1 AND "mode"='CHATFLOW' AND "status"='ACTIVE')"#,
    )
    .bind(assistant_id)
    .fetch_one(db)
    .await?;
    Ok(found.unwrap_or(false))
}
