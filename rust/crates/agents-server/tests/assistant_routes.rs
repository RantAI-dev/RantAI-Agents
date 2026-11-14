//! `/api/assistants/**` against a migrated database: tenancy, roles, the built-in assistants,
//! the concurrent writers, the bindings and the mobile mirror.

mod common;

use agents_store::PgPool;
use agents_store::assistants;
use agents_store::new_id;
use common::{R, bearer, code, router, send, send_with, user};
use serde_json::{Value, json};

/// An organisation row; returns its id.
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

/// An accepted membership of a user in an organisation.
async fn member(db: &PgPool, user_id: &str, org_id: &str, role: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,$4,now())"#,
    )
    .bind(new_id())
    .bind(user_id)
    .bind(org_id)
    .bind(role)
    .execute(db)
    .await?;
    Ok(())
}

/// An assistant row; returns its id. Without an organisation it is global, and a built-in
/// belongs to nobody.
async fn assistant_row(
    db: &PgPool,
    org_id: Option<&str>,
    built_in: bool,
) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Assistant" ("id","name","systemPrompt","model","organizationId","isBuiltIn",
             "knowledgeBaseGroupIds","openingQuestions","tags","createdAt","updatedAt")
           VALUES ($1,'t','p','openrouter/free',$2,$3,'{}','{}','{}',now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .bind(built_in)
    .execute(db)
    .await?;
    Ok(id)
}

/// A grant on an assistant; returns its id.
async fn grant(
    db: &PgPool,
    org_id: &str,
    assistant_id: &str,
    subject_type: &str,
    subject_id: &str,
    level: &str,
) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "AssistantGrant" ("id","organizationId","assistantId","subjectType",
             "subjectId","level","grantedBy","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,'test',now(),now())
           ON CONFLICT ("assistantId","subjectType","subjectId")
             DO UPDATE SET "level" = EXCLUDED."level""#,
    )
    .bind(&id)
    .bind(org_id)
    .bind(assistant_id)
    .bind(subject_type)
    .bind(subject_id)
    .bind(level)
    .execute(db)
    .await?;
    Ok(id)
}

/// A platform admin (the `role` of the table `"Agent"`); returns its id.
async fn admin_user(db: &PgPool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Agent" ("id","email","name","passwordHash","role","createdAt","updatedAt")
           VALUES ($1,$1 || '@test.invalid','Test','x','ADMIN',now(),now())"#,
    )
    .bind(&id)
    .execute(db)
    .await?;
    Ok(id)
}

/// A tool row; returns its id. A tool that is not user-selectable is hidden from the picker.
async fn tool_row(
    db: &PgPool,
    org_id: Option<&str>,
    user_selectable: bool,
) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Tool" ("id","name","displayName","description","category","parameters",
             "organizationId","userSelectable","createdAt","updatedAt")
           VALUES ($1,$1,'d','d','builtin','{}',$2,$3,now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .bind(user_selectable)
    .execute(db)
    .await?;
    Ok(id)
}

/// A skill row; returns its id.
async fn skill_row(db: &PgPool, org_id: Option<&str>) -> Result<String, sqlx::Error> {
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

/// Every route that takes an assistant id, with a body that would change the row.
fn calls(id: &str) -> Vec<(&'static str, String, Option<Value>)> {
    vec![
        ("GET", format!("/api/assistants/{id}"), None),
        (
            "PUT",
            format!("/api/assistants/{id}"),
            Some(json!({ "name": "mine now" })),
        ),
        (
            "PATCH",
            format!("/api/assistants/{id}"),
            Some(json!({ "name": "mine now" })),
        ),
        ("DELETE", format!("/api/assistants/{id}"), None),
        ("GET", format!("/api/assistants/{id}/tools"), None),
        (
            "PUT",
            format!("/api/assistants/{id}/tools"),
            Some(json!({ "toolIds": [] })),
        ),
        ("GET", format!("/api/assistants/{id}/skills"), None),
        (
            "PUT",
            format!("/api/assistants/{id}/skills"),
            Some(json!({ "skillIds": [] })),
        ),
        ("GET", format!("/api/assistants/{id}/mcp-servers"), None),
        (
            "PUT",
            format!("/api/assistants/{id}/mcp-servers"),
            Some(json!({ "mcpServerIds": [] })),
        ),
        ("GET", format!("/api/assistants/{id}/workflows"), None),
        (
            "PUT",
            format!("/api/assistants/{id}/workflows"),
            Some(json!({ "workflowIds": [] })),
        ),
        ("POST", format!("/api/assistants/{id}/default"), None),
        ("DELETE", format!("/api/assistants/{id}/default"), None),
        ("GET", format!("/api/mobile/assistants/{id}"), None),
        ("GET", format!("/api/mobile/assistants/{id}/tools"), None),
        (
            "PUT",
            format!("/api/mobile/assistants/{id}/skills"),
            Some(json!({ "skillIds": [] })),
        ),
        (
            "POST",
            format!("/api/mobile/assistants/{id}/duplicate"),
            None,
        ),
        ("POST", format!("/api/mobile/assistants/{id}/default"), None),
    ]
}

#[tokio::test]
async fn an_assistant_of_another_organisation_is_not_found() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (alice, bob) = (user(&db, false).await?, user(&db, false).await?);
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    member(&db, &alice, &org_a, "member").await?;
    // The positive control is an admin: a member of the owning org may not edit an agent it
    // was not granted (differences row 80).
    member(&db, &bob, &org_b, "admin").await?;
    let theirs = assistant_row(&db, Some(&org_b), false).await?;
    let auth = bearer(&alice)?;

    for (method, uri, body) in calls(&theirs) {
        let (status, response) = send(&app, method, &uri, Some(&auth), body).await?;
        assert_eq!(
            (status, code(&response)),
            (404, Some("not_found")),
            "{method} {uri} on another organisation's assistant"
        );
    }

    // Nothing was changed.
    let row = assistants::get(&db, &theirs).await?;
    assert_eq!(row.name, "t", "the assistant is untouched");

    // Positive control: the organisation that owns it may read and change it.
    let owner = bearer(&bob)?;
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/assistants/{theirs}"),
        Some(&owner),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/id"), Some(&json!(theirs)));

    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{theirs}"),
        Some(&owner),
        Some(json!({ "name": "renamed by its owner" })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/name"), Some(&json!("renamed by its owner")));

    // And the other organisation's list does not carry it.
    let (_, body) = send(&app, "GET", "/api/assistants", Some(&auth), None).await?;
    let listed: Vec<&str> = body
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|a| a.get("id").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    assert!(
        !listed.contains(&theirs.as_str()),
        "another organisation's assistant is not listed"
    );
    Ok(())
}

#[tokio::test]
async fn the_role_of_the_caller_decides_what_it_may_do() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (viewer, member_user, admin) = (
        user(&db, false).await?,
        user(&db, false).await?,
        user(&db, false).await?,
    );
    let org_id = org(&db).await?;
    member(&db, &viewer, &org_id, "viewer").await?;
    member(&db, &member_user, &org_id, "member").await?;
    member(&db, &admin, &org_id, "admin").await?;
    let id = assistant_row(&db, Some(&org_id), false).await?;
    let (viewer_auth, member_auth, admin_auth) =
        (bearer(&viewer)?, bearer(&member_user)?, bearer(&admin)?);

    // A viewer and a member neither use nor build an agent that was not granted to them
    // (differences row 80). The read is the same 403 as the write: the assistant is one of
    // their own organisation, so it exists and they may not act on it (§4).
    let refused = [
        ("GET", format!("/api/assistants/{id}"), None),
        (
            "PATCH",
            format!("/api/assistants/{id}"),
            Some(json!({ "name": "not allowed" })),
        ),
        (
            "PUT",
            format!("/api/assistants/{id}/tools"),
            Some(json!({ "toolIds": [] })),
        ),
        (
            "PUT",
            format!("/api/assistants/{id}/skills"),
            Some(json!({ "skillIds": [] })),
        ),
        ("DELETE", format!("/api/assistants/{id}"), None),
        ("POST", format!("/api/assistants/{id}/default"), None),
        (
            "POST",
            "/api/assistants".to_owned(),
            Some(json!({ "name": "new", "systemPrompt": "twenty characters at least" })),
        ),
    ];
    for auth in [&viewer_auth, &member_auth] {
        for (method, uri, body) in &refused {
            let (status, response) = send(&app, method, uri, Some(auth), body.clone()).await?;
            assert_eq!(
                (status, code(&response)),
                (403, Some("permission_denied")),
                "{method} {uri} without a grant"
            );
        }
    }

    // Positive control: an admin reads, edits, binds, sets the default and creates.
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "an admin may read the assistant");

    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{id}"),
        Some(&admin_auth),
        Some(json!({ "name": "edited by an admin" })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/name"), Some(&json!("edited by an admin")));

    let (status, _) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/tools"),
        Some(&admin_auth),
        Some(json!({ "toolIds": [] })),
    )
    .await?;
    assert_eq!(status, 200, "an admin may write the bindings");

    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/assistants/{id}/default"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/isSystemDefault"), Some(&json!(true)));

    let (status, _) = send(
        &app,
        "POST",
        "/api/assistants",
        Some(&admin_auth),
        Some(json!({ "name": "made by an admin", "systemPrompt": "twenty characters at least" })),
    )
    .await?;
    assert_eq!(status, 201, "an admin may create an agent");

    // A `use` grant lets the member read, and nothing else.
    grant(&db, &org_id, &id, "user", &member_user, "use").await?;
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&member_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "a use grant lets the member read the agent");
    let (status, response) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{id}"),
        Some(&member_auth),
        Some(json!({ "name": "not allowed either" })),
    )
    .await?;
    assert_eq!((status, code(&response)), (403, Some("permission_denied")));

    // A `manage` grant lets them edit and bind that one agent (§3.3) ...
    grant(&db, &org_id, &id, "user", &member_user, "manage").await?;
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{id}"),
        Some(&member_auth),
        Some(json!({ "name": "edited by a delegate" })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/name"), Some(&json!("edited by a delegate")));

    let (status, _) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/tools"),
        Some(&member_auth),
        Some(json!({ "toolIds": [] })),
    )
    .await?;
    assert_eq!(
        status, 200,
        "a manage grant covers the bindings of that agent"
    );

    // ... but never creating another agent, and never its grants: a delegate cannot widen
    // their own audience.
    let (status, response) = send(
        &app,
        "POST",
        "/api/assistants",
        Some(&member_auth),
        Some(json!({ "name": "a second agent", "systemPrompt": "twenty characters at least" })),
    )
    .await?;
    assert_eq!((status, code(&response)), (403, Some("permission_denied")));

    let (status, response) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}/access"),
        Some(&member_auth),
        None,
    )
    .await?;
    assert_eq!(
        (status, code(&response)),
        (403, Some("permission_denied")),
        "a manage grant does not reach the access panel"
    );

    // The admin deletes it (deleting is `agents.manage`).
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/assistants/{id}"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!((status, body), (200, json!({ "success": true })));
    Ok(())
}

#[tokio::test]
async fn a_built_in_assistant_is_read_only_for_everyone_but_a_platform_admin() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = user(&db, false).await?;
    member(&db, &member_user, &org_id, "member").await?;
    let admin = admin_user(&db).await?;
    let built_in = assistant_row(&db, None, true).await?;

    // A member may read a built-in.
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/assistants/{built_in}"),
        Some(&bearer(&member_user)?),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/isBuiltIn"), Some(&json!(true)));

    // A member may not edit it nor write its bindings.
    let (status, response) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{built_in}"),
        Some(&bearer(&member_user)?),
        Some(json!({ "name": "renamed", "description": "changed" })),
    )
    .await?;
    assert_eq!(
        (status, code(&response)),
        (403, Some("permission_denied")),
        "a built-in assistant is read-only"
    );

    let (status, response) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{built_in}/tools"),
        Some(&bearer(&member_user)?),
        Some(json!({ "toolIds": [] })),
    )
    .await?;
    assert_eq!((status, code(&response)), (403, Some("permission_denied")));

    // A platform admin may, but the name and the knowledge base stay as they are.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{built_in}"),
        Some(&bearer(&admin)?),
        Some(json!({
            "name": "renamed",
            "useKnowledgeBase": true,
            "knowledgeBaseGroupIds": ["group_1"],
            "description": "a new description"
        })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.pointer("/description"),
        Some(&json!("a new description"))
    );
    assert_eq!(
        body.pointer("/name"),
        Some(&json!("t")),
        "the name of a built-in does not change"
    );
    assert_eq!(
        body.pointer("/useKnowledgeBase"),
        Some(&json!(false)),
        "the knowledge base of a built-in does not change"
    );
    assert_eq!(
        body.pointer("/knowledgeBaseGroupIds"),
        Some(&json!([])),
        "the knowledge base groups of a built-in do not change"
    );
    Ok(())
}

#[tokio::test]
async fn ten_writers_with_the_same_version_produce_one_winner() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id, "admin").await?;
    let id = assistant_row(&db, Some(&org_id), false).await?;
    let auth = bearer(&member_user)?;

    // Positive control: one writer with the current version wins.
    let (status, _) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{id}"),
        Some(&auth),
        Some(json!({ "name": "the first writer" })),
    )
    .await?;
    assert_eq!(status, 200);

    // The version every writer in the burst saw.
    let (_, body) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&auth),
        None,
    )
    .await?;
    let version = body
        .pointer("/updatedAt")
        .and_then(Value::as_str)
        .ok_or("no updatedAt")?
        .to_owned();

    let mut writers = tokio::task::JoinSet::new();
    for i in 0..10 {
        let app = app.clone();
        let auth = auth.clone();
        let version = version.clone();
        let uri = format!("/api/assistants/{id}");
        writers.spawn(async move {
            send_with(
                &app,
                "PATCH",
                &uri,
                Some(&auth),
                Some(json!({ "name": format!("writer {i}") })),
                &[("if-match", version.as_str())],
            )
            .await
            .map_err(|e| e.to_string())
        });
    }
    let mut winners = 0;
    let mut conflicts = 0;
    let mut others: Vec<(u16, Value)> = Vec::new();
    while let Some(done) = writers.join_next().await {
        let (status, body) = done??;
        match status {
            200 => winners += 1,
            409 => {
                conflicts += 1;
                assert_eq!(
                    code(&body),
                    Some("conflict"),
                    "a stale writer gets a conflict"
                );
            }
            other => others.push((other, body)),
        }
    }
    assert!(others.is_empty(), "unexpected answers: {others:?}");
    assert_eq!(winners, 1, "exactly one writer wins");
    assert_eq!(conflicts, 9, "every other writer conflicts");
    Ok(())
}

#[tokio::test]
async fn a_binding_put_replaces_the_set_and_dedupes_it() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id, "admin").await?;
    let id = assistant_row(&db, Some(&org_id), false).await?;
    let (first, second, hidden) = (
        tool_row(&db, Some(&org_id), true).await?,
        tool_row(&db, Some(&org_id), true).await?,
        tool_row(&db, Some(&org_id), false).await?,
    );
    let auth = bearer(&member_user)?;

    // Positive control: the tools that are bound are listed.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/tools"),
        Some(&auth),
        Some(json!({ "toolIds": [first, second] })),
    )
    .await?;
    assert_eq!(status, 200);
    let ids: Vec<&str> = body
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|t| t.get("id").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(ids, vec![first.as_str(), second.as_str()]);

    // A second put replaces the set: the first tool is gone.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/tools"),
        Some(&auth),
        Some(json!({ "toolIds": [second] })),
    )
    .await?;
    assert_eq!(status, 200);
    let ids: Vec<&str> = body
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|t| t.get("id").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(
        ids,
        vec![second.as_str()],
        "the set is replaced, not added to"
    );

    // The same id twice is one binding.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/tools"),
        Some(&auth),
        Some(json!({ "toolIds": [second, second] })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.as_array().map(Vec::len),
        Some(1),
        "a repeated id is one binding"
    );

    // A tool that is hidden from the picker stays bound: a put cannot drop it.
    assistants::replace_bindings(
        &db,
        &id,
        agents_store::assistants::Binding::Tool,
        std::slice::from_ref(&hidden),
    )
    .await?;
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/tools"),
        Some(&auth),
        Some(json!({ "toolIds": [second] })),
    )
    .await?;
    assert_eq!(status, 200);
    let ids: Vec<&str> = body
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|t| t.get("id").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    assert!(
        ids.contains(&hidden.as_str()),
        "a hidden tool stays bound: {ids:?}"
    );
    assert_eq!(ids.len(), 2, "the hidden tool and the one the caller sent");

    // The skills are bindings too, and they keep their order.
    let (first_skill, second_skill) = (
        skill_row(&db, Some(&org_id)).await?,
        skill_row(&db, Some(&org_id)).await?,
    );
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/skills"),
        Some(&auth),
        Some(json!({ "skillIds": [second_skill, first_skill] })),
    )
    .await?;
    assert_eq!(status, 200);
    let skill_ids: Vec<&str> = body
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|s| s.get("skillId").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(
        skill_ids,
        vec![second_skill.as_str(), first_skill.as_str()],
        "the order the caller sent is the order of the bindings"
    );

    // A body that is not a list of ids is a 400 with the field it got wrong.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/tools"),
        Some(&auth),
        Some(json!({ "toolIds": "one" })),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    Ok(())
}

#[tokio::test]
async fn the_mobile_routes_take_the_bearer_token_and_refuse_a_suspended_user() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id, "admin").await?;
    let id = assistant_row(&db, Some(&org_id), false).await?;
    let auth = bearer(&member_user)?;

    // The mobile list: the assistants and the user's own default.
    let (status, body) = send(&app, "GET", "/api/mobile/assistants", Some(&auth), None).await?;
    assert_eq!(status, 200);
    let listed: Vec<&str> = body
        .pointer("/assistants")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|a| a.get("id").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    assert!(listed.contains(&id.as_str()), "the assistant is listed");
    assert_eq!(body.pointer("/defaultAssistantId"), Some(&Value::Null));

    // The mobile create.
    let (status, body) = send(
        &app,
        "POST",
        "/api/mobile/assistants",
        Some(&auth),
        Some(json!({ "name": "from the phone", "systemPrompt": "twenty characters at least" })),
    )
    .await?;
    assert_eq!(status, 201);
    let created = body
        .pointer("/id")
        .and_then(Value::as_str)
        .ok_or("no id")?
        .to_owned();
    assert_eq!(body.pointer("/name"), Some(&json!("from the phone")));

    // The mobile duplicate: a copy of the assistant.
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/mobile/assistants/{created}/duplicate"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 201);
    assert_eq!(body.pointer("/name"), Some(&json!("from the phone (Copy)")));

    // The mobile default: the user's own choice.
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/mobile/assistants/{created}/default"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/defaultAssistantId"), Some(&json!(created)));

    // A suspended user is refused (QA TC-1269).
    let suspended = user(&db, true).await?;
    let (status, body) = send(
        &app,
        "GET",
        "/api/mobile/assistants",
        Some(&bearer(&suspended)?),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));

    // And so is a caller without a token at all.
    let (status, body) = send(&app, "GET", "/api/mobile/assistants", None, None).await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));
    Ok(())
}

#[tokio::test]
async fn a_bad_body_is_a_400_with_every_bad_field() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id, "admin").await?;
    let id = assistant_row(&db, Some(&org_id), false).await?;
    let auth = bearer(&member_user)?;

    // No body at all.
    let (status, body) = send(&app, "POST", "/api/assistants", Some(&auth), None).await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));

    // A name that is too short, a prompt that is too short and a field that does not exist:
    // every one of them is reported.
    let (status, body) = send(
        &app,
        "POST",
        "/api/assistants",
        Some(&auth),
        Some(json!({ "name": "", "systemPrompt": "short", "nonsense": 1 })),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    let mut reported = fields(&body);
    reported.sort_unstable();
    assert_eq!(
        reported,
        vec!["/name", "/nonsense", "/systemPrompt"],
        "every bad field is reported"
    );

    // An unknown field in an update is refused too.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{id}"),
        Some(&auth),
        Some(json!({ "nonsense": 1 })),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    assert_eq!(fields(&body), vec!["/nonsense"]);

    // A version that is not a timestamp is a 400 as well.
    let (status, body) = send_with(
        &app,
        "PATCH",
        &format!("/api/assistants/{id}"),
        Some(&auth),
        Some(json!({ "name": "new name" })),
        &[("if-match", "not-a-timestamp")],
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    Ok(())
}

/// The fields a 400 body lists.
fn fields(body: &Value) -> Vec<&str> {
    body.pointer("/error/errors")
        .and_then(Value::as_array)
        .map(|errors| {
            errors
                .iter()
                .filter_map(|e| e.get("field").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn the_default_assistant_is_the_one_the_organisation_and_the_user_choose() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (member_user, admin) = (user(&db, false).await?, user(&db, false).await?);
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    member(&db, &member_user, &org_a, "member").await?;
    member(&db, &admin, &org_a, "admin").await?;
    let (mine, theirs) = (
        assistant_row(&db, Some(&org_a), false).await?,
        assistant_row(&db, Some(&org_b), false).await?,
    );
    // A built-in exists, so the organisation has something to fall back to.
    let _built_in = assistant_row(&db, None, true).await?;
    // The member may use the organisation's default: a grant to the whole organisation
    // (differences row 80: a member uses an agent through a grant).
    grant(&db, &org_a, &mine, "org", &org_a, "use").await?;
    let (member_auth, admin_auth) = (bearer(&member_user)?, bearer(&admin)?);

    // Without a default the organisation falls back to the first built-in.
    let (status, body) = send(
        &app,
        "GET",
        "/api/user/default-assistant",
        Some(&member_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/source"), Some(&json!("fallback")));

    // The organisation's default: only a manager may set it.
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/assistants/{mine}/default"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/isSystemDefault"), Some(&json!(true)));

    let (status, body) = send(
        &app,
        "GET",
        "/api/user/default-assistant",
        Some(&member_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/source"), Some(&json!("system")));
    assert_eq!(
        body.pointer("/assistant/id"),
        Some(&json!(mine)),
        "the organisation's default is the assistant of that organisation"
    );

    // The user's own choice wins over the organisation's default.
    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/default-assistant",
        Some(&member_auth),
        Some(json!({ "assistantId": theirs })),
    )
    .await?;
    assert_eq!((status, code(&body)), (404, Some("not_found")));

    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/default-assistant",
        Some(&member_auth),
        Some(json!({ "assistantId": mine })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/source"), Some(&json!("user")));
    assert_eq!(body.pointer("/assistant/id"), Some(&json!(mine)));

    // The default of another organisation is not this organisation's default.
    let other = assistant_row(&db, Some(&org_b), false).await?;
    let bob = user(&db, false).await?;
    member(&db, &bob, &org_b, "admin").await?;
    let (status, body) = send(
        &app,
        "GET",
        "/api/user/default-assistant",
        Some(&bearer(&bob)?),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_ne!(
        body.pointer("/assistant/id"),
        Some(&json!(mine)),
        "another organisation's default does not leak"
    );
    assert_eq!(body.pointer("/source"), Some(&json!("fallback")));

    // The organisation's default can be cleared again.
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/assistants/{mine}/default"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/isSystemDefault"), Some(&json!(false)));

    // Clearing it twice is a conflict: the row is not the default any more.
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/assistants/{mine}/default"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (409, Some("conflict")));
    let _ = other;
    Ok(())
}
