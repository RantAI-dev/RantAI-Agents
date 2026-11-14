//! The binding PUTs bind only what the agent's organisation may use: its own tools, skills, MCP
//! servers and workflows, plus the global rows the schema shares (built-in tools and MCP
//! servers, global skills). Anything else is a 404 for the whole request, and nothing is written.

mod common;

use agents_store::PgPool;
use agents_store::new_id;
use common::{R, bearer, code, router, send, user};
use serde_json::json;

async fn org(db: &PgPool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt")
           VALUES ($1,'t',$1,now(),now())"#,
    )
    .bind(&id)
    .execute(db)
    .await?;
    Ok(id)
}

async fn admin_of(db: &PgPool, org_id: &str) -> Result<String, sqlx::Error> {
    let user_id = user(db, false).await?;
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,'admin',now())"#,
    )
    .bind(new_id())
    .bind(&user_id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(user_id)
}

async fn assistant(db: &PgPool, org_id: &str) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Assistant" ("id","name","systemPrompt","model","organizationId",
             "knowledgeBaseGroupIds","openingQuestions","tags","createdAt","updatedAt")
           VALUES ($1,'t','p','openrouter/free',$2,'{}','{}','{}',now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(id)
}

async fn tool(db: &PgPool, org_id: Option<&str>, built_in: bool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Tool" ("id","name","displayName","description","category","parameters",
             "organizationId","isBuiltIn","createdAt","updatedAt")
           VALUES ($1,$1,'d','d','builtin','{}',$2,$3,now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .bind(built_in)
    .execute(db)
    .await?;
    Ok(id)
}

async fn skill(db: &PgPool, org_id: Option<&str>) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Skill" ("id","name","displayName","description","content","source",
             "organizationId","createdAt","updatedAt")
           VALUES ($1,$1,'d','d','c','custom',$2,now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(id)
}

async fn mcp_server(
    db: &PgPool,
    org_id: Option<&str>,
    built_in: bool,
) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "McpServerConfig" ("id","name","transport","organizationId","isBuiltIn","createdAt","updatedAt")
           VALUES ($1,'m','sse',$2,$3,now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .bind(built_in)
    .execute(db)
    .await?;
    Ok(id)
}

async fn workflow(db: &PgPool, org_id: Option<&str>) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Workflow" ("id","name","tags","createdBy","organizationId","createdAt","updatedAt")
           VALUES ($1,'w','{}','test',$2,now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(id)
}

/// The ids bound to the assistant, straight from the table.
async fn bound(
    db: &PgPool,
    table: &str,
    column: &str,
    assistant_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let sql =
        format!(r#"SELECT "{column}" FROM "{table}" WHERE "assistantId" = $1 ORDER BY "{column}""#);
    sqlx::query_scalar(&sql)
        .bind(assistant_id)
        .fetch_all(db)
        .await
}

/// One binding route, what to seed for it and which global rows it accepts.
struct Case {
    path: &'static str,
    field: &'static str,
    table: &'static str,
    column: &'static str,
}

const CASES: [Case; 6] = [
    Case {
        path: "/api/assistants/{id}/tools",
        field: "toolIds",
        table: "AssistantTool",
        column: "toolId",
    },
    Case {
        path: "/api/assistants/{id}/skills",
        field: "skillIds",
        table: "AssistantSkill",
        column: "skillId",
    },
    Case {
        path: "/api/assistants/{id}/mcp-servers",
        field: "mcpServerIds",
        table: "AssistantMcpServer",
        column: "mcpServerId",
    },
    Case {
        path: "/api/assistants/{id}/workflows",
        field: "workflowIds",
        table: "AssistantWorkflow",
        column: "workflowId",
    },
    Case {
        path: "/api/mobile/assistants/{id}/tools",
        field: "toolIds",
        table: "AssistantTool",
        column: "toolId",
    },
    Case {
        path: "/api/mobile/assistants/{id}/skills",
        field: "skillIds",
        table: "AssistantSkill",
        column: "skillId",
    },
];

/// A row of this kind in `org_id` (or global when `None`).
async fn seed(db: &PgPool, column: &str, org_id: Option<&str>) -> Result<String, sqlx::Error> {
    match column {
        "toolId" => tool(db, org_id, org_id.is_none()).await,
        "skillId" => skill(db, org_id).await,
        "mcpServerId" => mcp_server(db, org_id, org_id.is_none()).await,
        _ => workflow(db, org_id).await,
    }
}

#[tokio::test]
async fn a_binding_put_refuses_another_organisations_rows_and_writes_nothing() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (mine, theirs) = (org(&db).await?, org(&db).await?);
    let admin = admin_of(&db, &mine).await?;
    let auth = bearer(&admin)?;

    for case in &CASES {
        let id = assistant(&db, &mine).await?;
        let uri = case.path.replace("{id}", &id);
        let own = seed(&db, case.column, Some(&mine)).await?;
        let foreign = seed(&db, case.column, Some(&theirs)).await?;

        // Positive control: the organisation's own row binds.
        let (status, _) = send(
            &app,
            "PUT",
            &uri,
            Some(&auth),
            Some(json!({ case.field: [own] })),
        )
        .await?;
        assert_eq!(status, 200, "{}: the owner binds its own row", case.path);
        assert_eq!(
            bound(&db, case.table, case.column, &id).await?,
            vec![own.clone()]
        );

        // Another organisation's row, even beside a valid one: 404 and nothing changes.
        let (status, body) = send(
            &app,
            "PUT",
            &uri,
            Some(&auth),
            Some(json!({ case.field: [own, foreign] })),
        )
        .await?;
        assert_eq!(
            (status, code(&body)),
            (404, Some("not_found")),
            "{}: a foreign id is not found",
            case.path
        );
        assert_eq!(
            bound(&db, case.table, case.column, &id).await?,
            vec![own.clone()],
            "{}: a refused request writes nothing",
            case.path
        );

        // An id that exists nowhere is the same answer.
        let (status, body) = send(
            &app,
            "PUT",
            &uri,
            Some(&auth),
            Some(json!({ case.field: [new_id()] })),
        )
        .await?;
        assert_eq!(
            (status, code(&body)),
            (404, Some("not_found")),
            "{}",
            case.path
        );
        assert_eq!(bound(&db, case.table, case.column, &id).await?, vec![own]);
    }
    Ok(())
}

#[tokio::test]
async fn the_global_rows_the_schema_shares_still_bind() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let mine = org(&db).await?;
    let admin = admin_of(&db, &mine).await?;
    let auth = bearer(&admin)?;

    // Built-in tools and MCP servers, and global skills, belong to everyone.
    for case in CASES.iter().filter(|c| c.column != "workflowId") {
        let id = assistant(&db, &mine).await?;
        let global = seed(&db, case.column, None).await?;
        let (status, body) = send(
            &app,
            "PUT",
            &case.path.replace("{id}", &id),
            Some(&auth),
            Some(json!({ case.field: [global] })),
        )
        .await?;
        assert_eq!(status, 200, "{}: {body}", case.path);
        assert_eq!(
            bound(&db, case.table, case.column, &id).await?,
            vec![global]
        );
    }

    // A global row that is not built-in is nobody's to share: a stray tool, MCP server or
    // workflow without an organisation is refused.
    let id = assistant(&db, &mine).await?;
    for (path, field, row) in [
        ("tools", "toolIds", tool(&db, None, false).await?),
        (
            "mcp-servers",
            "mcpServerIds",
            mcp_server(&db, None, false).await?,
        ),
        ("workflows", "workflowIds", workflow(&db, None).await?),
    ] {
        let (status, body) = send(
            &app,
            "PUT",
            &format!("/api/assistants/{id}/{path}"),
            Some(&auth),
            Some(json!({ field: [row] })),
        )
        .await?;
        assert_eq!((status, code(&body)), (404, Some("not_found")), "{path}");
    }
    Ok(())
}
