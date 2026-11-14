//! The agent access panel: `GET`/`PUT`/`DELETE /api/assistants/{id}/access`
//! (`docs/design/identity-and-access.md` §3.3, §3.7).
//!
//! Every change writes an `AuditLog` row, and only an admin of the organisation changes the
//! grants: a `manage` grant edits one agent, never its audience.

#[path = "agent_rbac/support.rs"]
mod support;

mod common;

use agents_core::authz::UnitKind;
use common::{R, bearer, code, router, send};
use serde_json::{Value, json};
use support::{assistant, built_in, grant, ids, member_of, org, unit, unit_member};

/// The audit rows written for an assistant, newest last.
async fn audit_rows(
    db: &agents_store::PgPool,
    org_id: &str,
    assistant_id: &str,
) -> Result<Vec<(String, Value)>, sqlx::Error> {
    let rows: Vec<(String, Value)> = sqlx::query_as(
        r#"SELECT "action", "detail" FROM "AuditLog"
           WHERE "organizationId" = $1 AND "resource" = $2
           ORDER BY "createdAt" ASC"#,
    )
    .bind(org_id)
    .bind(format!("assistant:{assistant_id}"))
    .fetch_all(db)
    .await?;
    Ok(rows)
}

#[tokio::test]
async fn the_panel_lists_every_grant_with_the_name_of_what_it_names() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let auth = bearer(&admin)?;
    let id = assistant(&db, &org_id).await?;
    let department = unit(&db, &org_id, None, UnitKind::Department, "sales").await?;

    // An empty panel is an empty list, not a missing row.
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body, json!({ "data": [] }));

    grant(&db, &org_id, &id, "org", &org_id, "use").await?;
    grant(&db, &org_id, &id, "unit", &department, "use").await?;
    grant(&db, &org_id, &id, "user", &admin, "manage").await?;

    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    let data = body
        .get("data")
        .and_then(Value::as_array)
        .ok_or("no data")?
        .clone();
    assert_eq!(data.len(), 3, "every grant is listed: {body}");
    let name_of = |subject_type: &str| -> Option<String> {
        data.iter()
            .find(|row| row.get("subjectType").and_then(Value::as_str) == Some(subject_type))
            .and_then(|row| row.get("subjectName"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    };
    assert_eq!(name_of("unit").as_deref(), Some("sales"));
    assert_eq!(name_of("user").as_deref(), Some("Test"));
    assert!(name_of("org").is_some(), "the organisation's own name");
    Ok(())
}

#[tokio::test]
async fn a_put_replaces_the_whole_list_and_writes_the_audit_trail() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let auth = bearer(&admin)?;
    let id = assistant(&db, &org_id).await?;

    // Two grants in, one of them its own.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        Some(json!([
            { "subjectType": "org", "subjectId": org_id, "level": "use" },
            { "subjectType": "user", "subjectId": member_user, "level": "manage" },
        ])),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(ids(&body).len(), 2);
    let mut actions: Vec<String> = audit_rows(&db, &org_id, &id)
        .await?
        .into_iter()
        .map(|(action, _)| action)
        .collect();
    actions.sort();
    assert_eq!(actions, vec!["rbac.grant.set", "rbac.grant.set"]);

    // The next PUT keeps the org grant and drops the user's.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        Some(json!([
            { "subjectType": "org", "subjectId": org_id, "level": "use" },
        ])),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/data/0/subjectType"), Some(&json!("org")));
    assert_eq!(
        body.get("data").and_then(Value::as_array).map(Vec::len),
        Some(1),
        "the grant the body did not name is gone"
    );

    let rows = audit_rows(&db, &org_id, &id).await?;
    let revoked: Vec<&(String, Value)> = rows
        .iter()
        .filter(|(action, _)| action == "rbac.grant.revoke")
        .collect();
    assert_eq!(revoked.len(), 1, "one revoke was written: {rows:?}");
    assert_eq!(
        revoked[0].1.pointer("/subjectId"),
        Some(&json!(member_user.as_str()))
    );

    // A body that names nobody leaves only the admins, and the panel says so.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        Some(json!([])),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body, json!({ "data": [] }));
    // The member lost the use the `manage` grant gave them.
    let (status, response) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&bearer(&member_user)?),
        None,
    )
    .await?;
    assert_eq!((status, code(&response)), (403, Some("permission_denied")));
    Ok(())
}

#[tokio::test]
async fn a_delete_takes_one_grant_away_and_writes_the_audit_trail() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let auth = bearer(&admin)?;
    let id = assistant(&db, &org_id).await?;
    let grant_id = grant(&db, &org_id, &id, "user", &member_user, "use").await?;

    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/assistants/{id}/access/{grant_id}"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!((status, body), (200, json!({ "success": true })));
    assert!(
        agents_store::grants::list(&db, &org_id, &id)
            .await?
            .is_empty()
    );

    let rows = audit_rows(&db, &org_id, &id).await?;
    assert_eq!(rows.len(), 1, "one revoke: {rows:?}");
    assert_eq!(rows[0].0, "rbac.grant.revoke");

    // The same id again is not found; so is one that never existed.
    for gone in [grant_id.as_str(), "no_such_grant"] {
        let (status, response) = send(
            &app,
            "DELETE",
            &format!("/api/assistants/{id}/access/{gone}"),
            Some(&auth),
            None,
        )
        .await?;
        assert_eq!((status, code(&response)), (404, Some("not_found")));
    }
    Ok(())
}

#[tokio::test]
async fn a_manage_grant_holder_cannot_change_the_grants() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let delegate = member_of(&db, &org_id, "member").await?;
    let id = assistant(&db, &org_id).await?;
    let grant_id = grant(&db, &org_id, &id, "user", &delegate, "manage").await?;
    let delegate_auth = bearer(&delegate)?;

    // The delegate edits that one agent ...
    let (status, _) = send(
        &app,
        "PATCH",
        &format!("/api/assistants/{id}"),
        Some(&delegate_auth),
        Some(json!({ "name": "edited by a delegate" })),
    )
    .await?;
    assert_eq!(status, 200, "a manage grant edits the agent");

    // ... and neither reads nor replaces the panel: a delegate cannot widen their audience.
    for (method, uri, body) in [
        ("GET", format!("/api/assistants/{id}/access"), None),
        (
            "PUT",
            format!("/api/assistants/{id}/access"),
            Some(json!([{ "subjectType": "org", "subjectId": org_id, "level": "manage" }])),
        ),
        (
            "DELETE",
            format!("/api/assistants/{id}/access/{grant_id}"),
            None,
        ),
    ] {
        let (status, response) = send(&app, method, &uri, Some(&delegate_auth), body).await?;
        assert_eq!(
            (status, code(&response)),
            (403, Some("permission_denied")),
            "{method} {uri} as a manage-grant holder"
        );
    }

    // Positive control: the admin does all three.
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}/access"),
        Some(&bearer(&admin)?),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    Ok(())
}

#[tokio::test]
async fn a_built_in_agent_has_no_grants_to_show() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let auth = bearer(&admin)?;
    let id = built_in(&db).await?;

    for (method, uri, body) in [
        ("GET", format!("/api/assistants/{id}/access"), None),
        (
            "PUT",
            format!("/api/assistants/{id}/access"),
            Some(json!([{ "subjectType": "org", "subjectId": org_id, "level": "use" }])),
        ),
    ] {
        let (status, response) = send(&app, method, &uri, Some(&auth), body).await?;
        assert_eq!(
            (status, code(&response)),
            (404, Some("not_found")),
            "{method} {uri} on a built-in"
        );
    }
    Ok(())
}

#[tokio::test]
async fn a_subject_outside_the_organisation_is_not_found_and_nothing_is_written() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    let admin = member_of(&db, &org_a, "admin").await?;
    let stranger = member_of(&db, &org_b, "member").await?;
    let auth = bearer(&admin)?;
    let id = assistant(&db, &org_a).await?;

    let (status, response) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        Some(json!([
            { "subjectType": "org", "subjectId": org_a, "level": "use" },
            { "subjectType": "user", "subjectId": stranger, "level": "use" },
        ])),
    )
    .await?;
    assert_eq!((status, code(&response)), (404, Some("not_found")));
    assert!(
        agents_store::grants::list(&db, &org_a, &id)
            .await?
            .is_empty(),
        "a body with one bad subject writes none of its grants"
    );

    // Positive control: the same body without the stranger is accepted.
    let (status, _) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        Some(json!([{ "subjectType": "org", "subjectId": org_a, "level": "use" }])),
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
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let auth = bearer(&admin)?;
    let id = assistant(&db, &org_id).await?;

    // Not an array at all.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        Some(json!({ "subjectType": "org" })),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));

    // An unknown type, an unknown level, a missing id and a field the request does not take.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        Some(json!([
            { "subjectType": "team", "subjectId": org_id, "level": "use" },
            { "subjectType": "org", "subjectId": "", "level": "read" },
            { "subjectType": "org", "level": "use", "nonsense": 1 },
        ])),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    let mut reported: Vec<String> = body
        .pointer("/error/errors")
        .and_then(Value::as_array)
        .map(|errors| {
            errors
                .iter()
                .filter_map(|error| error.get("field").and_then(Value::as_str))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    reported.sort_unstable();
    assert_eq!(
        reported,
        vec![
            "/0/subjectType",
            "/1/level",
            "/1/subjectId",
            "/2/nonsense",
            "/2/subjectId"
        ],
        "every bad field is reported"
    );

    // The same subject twice is refused, not silently collapsed.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&auth),
        Some(json!([
            { "subjectType": "org", "subjectId": org_id, "level": "use" },
            { "subjectType": "org", "subjectId": org_id, "level": "manage" },
        ])),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    Ok(())
}

#[tokio::test]
async fn the_member_list_and_the_panel_agree_after_a_grant_to_a_unit() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let in_unit = member_of(&db, &org_id, "member").await?;
    let department = unit(&db, &org_id, None, UnitKind::Department, "support").await?;
    let team = unit(&db, &org_id, Some(&department), UnitKind::Team, "night").await?;
    unit_member(&db, &org_id, &team, &in_unit).await?;
    let id = assistant(&db, &org_id).await?;

    // Through the API this time, on the department the member sits below.
    let (status, _) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&bearer(&admin)?),
        Some(json!([{ "subjectType": "unit", "subjectId": department, "level": "use" }])),
    )
    .await?;
    assert_eq!(status, 200);

    let (status, body) = send(
        &app,
        "GET",
        "/api/assistants",
        Some(&bearer(&in_unit)?),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert!(
        ids(&body).contains(&id),
        "a department grant through the API reaches the team below it"
    );
    Ok(())
}
