//! `/api/user/preferences`: the user's own settings — the assistant they chose and their
//! sidebar.

mod common;

use agents_store::PgPool;
use agents_store::new_id;
use common::{R, bearer, code, router, send, user};
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
async fn member(db: &PgPool, user_id: &str, org_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,'member',now())"#,
    )
    .bind(new_id())
    .bind(user_id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(())
}

/// An assistant row; returns its id.
async fn assistant_row(db: &PgPool, org_id: Option<&str>) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Assistant" ("id","name","systemPrompt","model","organizationId","isBuiltIn",
             "knowledgeBaseGroupIds","openingQuestions","tags","createdAt","updatedAt")
           VALUES ($1,'t','p','openrouter/free',$2,false,'{}','{}','{}',now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(id)
}

/// The default assistant the row holds.
async fn stored_default(db: &PgPool, user_id: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(r#"SELECT "defaultAssistantId" FROM "UserPreference" WHERE "userId" = $1"#)
        .bind(user_id)
        .fetch_optional(db)
        .await
}

#[tokio::test]
async fn the_settings_round_trip() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id).await?;
    let assistant = assistant_row(&db, Some(&org_id)).await?;
    let auth = bearer(&member_user)?;

    // Without a row the settings are empty, not missing.
    let (status, body) = send(&app, "GET", "/api/user/preferences", Some(&auth), None).await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/userId"), Some(&json!(member_user)));
    assert_eq!(body.pointer("/defaultAssistantId"), Some(&Value::Null));
    assert_eq!(body.pointer("/sidebarConfig"), Some(&Value::Null));

    // The assistant the user chose and their sidebar settings.
    let sidebar = json!({"hiddenItems": ["Chat"], "sidebarCollapsed": true});
    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        Some(&auth),
        Some(json!({ "defaultAssistantId": assistant, "sidebarConfig": sidebar })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/defaultAssistantId"), Some(&json!(assistant)));
    assert_eq!(body.pointer("/sidebarConfig"), Some(&sidebar));

    // And they come back.
    let (status, body) = send(&app, "GET", "/api/user/preferences", Some(&auth), None).await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/defaultAssistantId"), Some(&json!(assistant)));
    assert_eq!(body.pointer("/sidebarConfig"), Some(&sidebar));

    // The choice can be cleared, and the sidebar settings stay.
    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        Some(&auth),
        Some(json!({ "defaultAssistantId": null })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/defaultAssistantId"), Some(&Value::Null));
    assert_eq!(
        body.pointer("/sidebarConfig"),
        Some(&sidebar),
        "the fields the body did not carry stay as they were"
    );
    Ok(())
}

#[tokio::test]
async fn another_organisation_s_assistant_is_not_found() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (member_user, other_user) = (user(&db, false).await?, user(&db, false).await?);
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    member(&db, &member_user, &org_a).await?;
    member(&db, &other_user, &org_b).await?;
    let theirs = assistant_row(&db, Some(&org_b)).await?;
    let mine = assistant_row(&db, Some(&org_a)).await?;
    let auth = bearer(&member_user)?;

    // Positive control: the organisation's own assistant is accepted.
    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        Some(&auth),
        Some(json!({ "defaultAssistantId": mine })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/defaultAssistantId"), Some(&json!(mine)));

    // Another organisation's assistant is not found, not forbidden: a 403 would tell the
    // caller that the id exists.
    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        Some(&auth),
        Some(json!({ "defaultAssistantId": theirs })),
    )
    .await?;
    assert_eq!((status, code(&body)), (404, Some("not_found")));

    // Nothing was written.
    let stored = stored_default(&db, &member_user).await?;
    assert_eq!(
        stored,
        Some(mine.clone()),
        "the refused request left the choice as it was"
    );
    Ok(())
}

#[tokio::test]
async fn a_caller_without_a_token_and_a_suspended_one_are_refused() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id).await?;
    let assistant = assistant_row(&db, Some(&org_id)).await?;

    let (status, body) = send(&app, "GET", "/api/user/preferences", None, None).await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));

    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        None,
        Some(json!({ "defaultAssistantId": assistant })),
    )
    .await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));

    // A suspended user is refused too (QA TC-1269).
    let suspended = user(&db, true).await?;
    let (status, body) = send(
        &app,
        "GET",
        "/api/user/preferences",
        Some(&bearer(&suspended)?),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));
    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        Some(&bearer(&suspended)?),
        Some(json!({ "sidebarConfig": {"sidebarCollapsed": true} })),
    )
    .await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));

    // Positive control: the same requests with a live token are answered.
    let live = bearer(&member_user)?;
    let (status, _) = send(&app, "GET", "/api/user/preferences", Some(&live), None).await?;
    assert_eq!(status, 200);
    let (status, _) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        Some(&live),
        Some(json!({ "defaultAssistantId": assistant })),
    )
    .await?;
    assert_eq!(status, 200);
    Ok(())
}

#[tokio::test]
async fn a_bad_body_is_a_400_with_every_bad_field() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let member_user = user(&db, false).await?;
    let org_id = org(&db).await?;
    member(&db, &member_user, &org_id).await?;
    let auth = bearer(&member_user)?;

    // No body at all.
    let (status, body) = send(&app, "PUT", "/api/user/preferences", Some(&auth), None).await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));

    // A field of the wrong type and a field that does not exist: both are reported.
    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        Some(&auth),
        Some(json!({ "defaultAssistantId": 7, "nonsense": true })),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    let mut reported: Vec<&str> = body
        .pointer("/error/errors")
        .and_then(Value::as_array)
        .map(|errors| {
            errors
                .iter()
                .filter_map(|error| error.get("field").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    reported.sort_unstable();
    assert_eq!(reported, vec!["/defaultAssistantId", "/nonsense"]);
    Ok(())
}
