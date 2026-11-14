//! Agent RBAC on the assistant routes: who builds an agent, who sees it, and what a grant to
//! a unit reaches (`docs/design/identity-and-access.md` §3.2, §3.3, §4; differences row 80).
//!
//! Every refusal has its positive control: the 403 is paired with the caller who is allowed,
//! so a route that is simply broken cannot pass.

#[path = "agent_rbac/support.rs"]
mod support;

mod common;

use agents_core::authz::UnitKind;
use common::{R, bearer, code, router, send};
use serde_json::json;
use support::{assistant, grant, ids, member_of, org, unit, unit_member};

#[tokio::test]
async fn a_member_cannot_create_an_agent_and_an_admin_can() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let admin_user = member_of(&db, &org_id, "admin").await?;
    let (member_auth, admin_auth) = (bearer(&member_user)?, bearer(&admin_user)?);

    // A member does not build agents: on the web route, the mobile mirror and the wizard.
    let body = json!({ "name": "member agent", "systemPrompt": "twenty characters at least" });
    for (method, uri) in [
        ("POST", "/api/assistants"),
        ("POST", "/api/mobile/assistants"),
    ] {
        let (status, response) =
            send(&app, method, uri, Some(&member_auth), Some(body.clone())).await?;
        assert_eq!(
            (status, code(&response)),
            (403, Some("permission_denied")),
            "{method} {uri} as a member"
        );
    }
    let (status, response) = send(
        &app,
        "POST",
        "/api/assistants/wizard/stream",
        Some(&member_auth),
        Some(json!({"messages": [], "model": "rantai/nano"})),
    )
    .await?;
    assert_eq!(
        (status, code(&response)),
        (403, Some("permission_denied")),
        "the wizard builds an agent"
    );

    // Positive control: an admin creates one, and it belongs to the caller's organisation.
    let (status, body) = send(
        &app,
        "POST",
        "/api/assistants",
        Some(&admin_auth),
        Some(json!({ "name": "admin agent", "systemPrompt": "twenty characters at least" })),
    )
    .await?;
    assert_eq!(status, 201);
    assert_eq!(body.pointer("/organizationId"), Some(&json!(org_id)));
    Ok(())
}

#[tokio::test]
async fn a_new_agent_is_invisible_to_a_member_until_it_is_granted() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let admin_user = member_of(&db, &org_id, "admin").await?;
    let (member_auth, admin_auth) = (bearer(&member_user)?, bearer(&admin_user)?);
    let id = assistant(&db, &org_id).await?;

    // A new agent starts with no grants: only an admin sees it (§3.3).
    let (status, body) = send(&app, "GET", "/api/assistants", Some(&member_auth), None).await?;
    assert_eq!(status, 200);
    assert!(
        !ids(&body).contains(&id),
        "an ungranted agent is not listed for a member"
    );
    let (status, response) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&member_auth),
        None,
    )
    .await?;
    assert_eq!(
        (status, code(&response)),
        (403, Some("permission_denied")),
        "the agent exists in the caller's organisation, so it is a 403, not a 404"
    );

    // Positive control: the admin sees and reads it.
    let (status, body) = send(&app, "GET", "/api/assistants", Some(&admin_auth), None).await?;
    assert_eq!(status, 200);
    assert!(ids(&body).contains(&id), "an admin sees the agent");
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);

    // Once it is granted to the member, it appears in their list.
    grant(&db, &org_id, &id, "user", &member_user, "use").await?;
    let (status, body) = send(&app, "GET", "/api/assistants", Some(&member_auth), None).await?;
    assert_eq!(status, 200);
    assert!(
        ids(&body).contains(&id),
        "a granted agent is listed for the member"
    );
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&member_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);

    // The mobile list is filtered by the same rule.
    let (status, body) = send(
        &app,
        "GET",
        "/api/mobile/assistants",
        Some(&member_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert!(
        ids(body.get("assistants").unwrap_or(&body)).contains(&id),
        "the mobile list carries the same agents"
    );
    Ok(())
}

#[tokio::test]
async fn a_grant_to_a_department_reaches_its_teams_but_a_team_grant_stays_there() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let department = unit(&db, &org_id, None, UnitKind::Department, "engineering").await?;
    let team = unit(&db, &org_id, Some(&department), UnitKind::Team, "platform").await?;
    let in_team = member_of(&db, &org_id, "member").await?;
    let in_department = member_of(&db, &org_id, "member").await?;
    unit_member(&db, &org_id, &team, &in_team).await?;
    unit_member(&db, &org_id, &department, &in_department).await?;
    let (team_auth, department_auth) = (bearer(&in_team)?, bearer(&in_department)?);

    // A grant to the department reaches a member of the team below it.
    let department_agent = assistant(&db, &org_id).await?;
    grant(&db, &org_id, &department_agent, "unit", &department, "use").await?;
    for (who, auth) in [("team", &team_auth), ("department", &department_auth)] {
        let (status, response) = send(
            &app,
            "GET",
            &format!("/api/assistants/{department_agent}"),
            Some(auth),
            None,
        )
        .await?;
        assert_eq!(status, 200, "a department grant reaches the {who} member");
        assert_ne!(code(&response), Some("permission_denied"));
    }

    // A grant to the team does not reach the department above it.
    let team_agent = assistant(&db, &org_id).await?;
    grant(&db, &org_id, &team_agent, "unit", &team, "use").await?;
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{team_agent}"),
        Some(&team_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "a team grant reaches the team member");
    let (status, response) = send(
        &app,
        "GET",
        &format!("/api/assistants/{team_agent}"),
        Some(&department_auth),
        None,
    )
    .await?;
    assert_eq!(
        (status, code(&response)),
        (403, Some("permission_denied")),
        "a team grant does not reach the parent department"
    );

    // And the lists agree with the single reads.
    let (_, body) = send(&app, "GET", "/api/assistants", Some(&team_auth), None).await?;
    let listed = ids(&body);
    assert!(listed.contains(&department_agent) && listed.contains(&team_agent));
    let (_, body) = send(&app, "GET", "/api/assistants", Some(&department_auth), None).await?;
    let listed = ids(&body);
    assert!(listed.contains(&department_agent));
    assert!(
        !listed.contains(&team_agent),
        "the team's agent is not listed"
    );
    Ok(())
}

#[tokio::test]
async fn a_direct_user_grant_works_and_revoking_it_removes_access() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let admin_user = member_of(&db, &org_id, "admin").await?;
    let (member_auth, admin_auth) = (bearer(&member_user)?, bearer(&admin_user)?);
    let id = assistant(&db, &org_id).await?;

    // Granted through the API, by an admin.
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&admin_auth),
        Some(json!([{ "subjectType": "user", "subjectId": member_user, "level": "use" }])),
    )
    .await?;
    assert_eq!(status, 200, "an admin replaces the grants: {body}");
    let grant_id = body
        .pointer("/data/0/id")
        .and_then(serde_json::Value::as_str)
        .ok_or("no grant id")?
        .to_owned();

    for (method, uri) in [
        ("GET", format!("/api/assistants/{id}")),
        ("GET", "/api/assistants".to_owned()),
    ] {
        let (status, body) = send(&app, method, &uri, Some(&member_auth), None).await?;
        assert_eq!(status, 200, "{method} {uri} with the grant");
        if method == "GET" && uri == "/api/assistants" {
            assert!(ids(&body).contains(&id), "the granted agent is listed");
        }
    }

    // Revoked: the same three answers deny.
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/assistants/{id}/access/{grant_id}"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!((status, body), (200, json!({ "success": true })));

    let (status, response) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&member_auth),
        None,
    )
    .await?;
    assert_eq!((status, code(&response)), (403, Some("permission_denied")));
    let (status, body) = send(&app, "GET", "/api/assistants", Some(&member_auth), None).await?;
    assert_eq!(status, 200);
    assert!(!ids(&body).contains(&id), "a revoked agent is not listed");

    // Positive control: the admin still reads it, so the route itself is not the problem.
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    Ok(())
}

#[tokio::test]
async fn another_organisations_agent_and_its_grants_are_not_found() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    let admin_a = member_of(&db, &org_a, "admin").await?;
    let admin_b = member_of(&db, &org_b, "admin").await?;
    let theirs = assistant(&db, &org_b).await?;
    let grant_id = grant(&db, &org_b, &theirs, "org", &org_b, "use").await?;
    let (auth_a, auth_b) = (bearer(&admin_a)?, bearer(&admin_b)?);

    // The agent itself, and every route of its access panel, is a 404 for the other tenant.
    let calls = [
        ("GET", format!("/api/assistants/{theirs}"), None),
        (
            "PATCH",
            format!("/api/assistants/{theirs}"),
            Some(json!({ "name": "not mine" })),
        ),
        ("GET", format!("/api/assistants/{theirs}/access"), None),
        (
            "PUT",
            format!("/api/assistants/{theirs}/access"),
            Some(json!([])),
        ),
        (
            "DELETE",
            format!("/api/assistants/{theirs}/access/{grant_id}"),
            None,
        ),
    ];
    for (method, uri, body) in calls {
        let (status, response) = send(&app, method, &uri, Some(&auth_a), body).await?;
        assert_eq!(
            (status, code(&response)),
            (404, Some("not_found")),
            "{method} {uri} across tenants"
        );
    }

    // Nothing of the other organisation's changed.
    let rows = agents_store::grants::list(&db, &org_b, &theirs).await?;
    assert_eq!(rows.len(), 1, "the other organisation's grant is untouched");

    // Positive control: the owning organisation's admin reads and replaces them.
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{theirs}/access"),
        Some(&auth_b),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{theirs}/access"),
        Some(&auth_b),
        Some(json!([{ "subjectType": "org", "subjectId": org_b, "level": "use" }])),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.pointer("/data/0/subjectId"),
        Some(&json!(org_b.as_str()))
    );
    Ok(())
}

#[tokio::test]
async fn a_default_the_caller_may_not_use_is_refused_when_set_and_ignored_afterwards() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let admin_user = member_of(&db, &org_id, "admin").await?;
    let (member_auth, admin_auth) = (bearer(&member_user)?, bearer(&admin_user)?);
    let id = assistant(&db, &org_id).await?;
    // The fallback has to exist for the resolution to have something to answer.
    let _built_in = support::built_in(&db).await?;

    // Setting it while it is not granted is refused, and nothing is written.
    let (status, response) = send(
        &app,
        "PUT",
        "/api/user/default-assistant",
        Some(&member_auth),
        Some(json!({ "assistantId": id })),
    )
    .await?;
    assert_eq!(
        (status, code(&response)),
        (403, Some("permission_denied")),
        "a default the caller may not use is refused"
    );
    let (status, response) = send(
        &app,
        "PUT",
        "/api/user/preferences",
        Some(&member_auth),
        Some(json!({ "defaultAssistantId": id })),
    )
    .await?;
    assert_eq!((status, code(&response)), (403, Some("permission_denied")));
    let stored = agents_store::assistants::user_preference(&db, &member_user).await?;
    assert_eq!(
        stored.and_then(|p| p.default_assistant_id),
        None,
        "the refused requests wrote no default"
    );

    // Granted, the choice is accepted; the admin then takes the grant away.
    grant(&db, &org_id, &id, "user", &member_user, "use").await?;
    let (status, body) = send(
        &app,
        "PUT",
        "/api/user/default-assistant",
        Some(&member_auth),
        Some(json!({ "assistantId": id })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/source"), Some(&json!("user")));
    assert_eq!(body.pointer("/assistant/id"), Some(&json!(id.as_str())));

    let (status, _) = send(
        &app,
        "PUT",
        &format!("/api/assistants/{id}/access"),
        Some(&admin_auth),
        Some(json!([])),
    )
    .await?;
    assert_eq!(status, 200);

    // The stored choice is ignored when resolving: the built-in answers instead.
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
    assert_eq!(
        body.pointer("/assistant/isBuiltIn"),
        Some(&json!(true)),
        "the default of a caller who lost the grant is a built-in"
    );
    assert_ne!(
        body.pointer("/assistant/id"),
        Some(&json!(id.as_str())),
        "the revoked agent is not the default any more"
    );
    // The built-in the fallback names may be any built-in of the shared database, not the one
    // this test seeded; what matters is that it is one of them.
    Ok(())
}

#[tokio::test]
async fn a_built_in_is_listed_for_every_member() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let member_user = member_of(&db, &org_id, "member").await?;
    let auth = bearer(&member_user)?;
    let id = support::built_in(&db).await?;

    let (status, body) = send(&app, "GET", "/api/assistants", Some(&auth), None).await?;
    assert_eq!(status, 200);
    assert!(
        ids(&body).contains(&id),
        "a built-in is visible to every member (§3.3)"
    );
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/assistants/{id}"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "a member reads a built-in");
    Ok(())
}
