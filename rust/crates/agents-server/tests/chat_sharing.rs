//! Chat sharing (`docs/design/identity-and-access.md` §3.4, §4; differences rows 130+).
//!
//! Each test seeds its own organisation, units, members and chat, then drives the routes the
//! same way the dashboard will. Every refusal has the positive control beside it: the same call
//! succeeds for the caller who should be allowed.

#[path = "chat_sharing/support.rs"]
mod support;

#[allow(dead_code, reason = "shared test helpers, used piecemeal")]
mod common;

use agents_core::authz::{SubjectType, UnitKind};
use agents_store::{PgPool, new_id};
use common::{R, bearer, code, router, send, send_from, send_with};
use serde_json::{Value, json};
use support::{assistant, grant_use, member_of, org, session, unit, unit_member, user_subject};

/// A share body from a list of `(subjectType, subjectId)` pairs.
fn share_body(subjects: &[(&str, &str)]) -> Value {
    Value::Array(
        subjects
            .iter()
            .map(|(kind, id)| json!({"subjectType": kind, "subjectId": id}))
            .collect(),
    )
}

/// The ids of a `{data, nextCursor}` page.
fn ids(body: &Value) -> Vec<String> {
    body.get("data")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.get("id").and_then(Value::as_str))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

/// The id of the share of one subject in a shares answer.
fn share_id(body: &Value, subject_id: &str) -> Option<String> {
    body.get("data")
        .and_then(Value::as_array)?
        .iter()
        .find(|row| row.get("subjectId").and_then(Value::as_str) == Some(subject_id))?
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_owned)
}

/// The chats a caller sees on `/api/dashboard/chat/shared`.
async fn shared_ids(
    app: &axum::Router,
    auth: &str,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let (status, body) = send(app, "GET", "/api/dashboard/chat/shared", Some(auth), None).await?;
    assert_eq!(status, 200, "the shared list answers: {body}");
    Ok(ids(&body))
}

/// A chat of `owner` with two messages; returns its id.
async fn chat_with_messages(
    app: &axum::Router,
    auth: &str,
    assistant_id: &str,
    create_org: Option<&str>,
    db: &PgPool,
    owner: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let id = session(db, owner, create_org, assistant_id, "shared chat").await?;
    let (status, _) = send(
        app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(auth),
        Some(json!({"messages": [
            {"id": new_id(), "role": "user", "content": "hello"},
            {"id": new_id(), "role": "assistant", "content": "hi there"}
        ]})),
    )
    .await?;
    assert_eq!(status, 200, "the owner writes the transcript");
    Ok(id)
}

#[tokio::test]
async fn a_department_share_reaches_a_sub_team_and_a_team_share_does_not_reach_up() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let in_team = member_of(&db, &org_id, "member").await?;
    let in_department = member_of(&db, &org_id, "member").await?;
    let department = unit(&db, &org_id, None, UnitKind::Department, "dept").await?;
    let team = unit(&db, &org_id, Some(&department), UnitKind::Team, "team").await?;
    unit_member(&db, &org_id, &team, &in_team).await?;
    unit_member(&db, &org_id, &department, &in_department).await?;
    let agent = assistant(&db, Some(&org_id)).await?;
    let owner_auth = bearer(&owner)?;
    let id = chat_with_messages(&app, &owner_auth, &agent, Some(&org_id), &db, &owner).await?;

    // A share to the department reaches the department and the team below it.
    let (status, shares) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&owner_auth),
        Some(share_body(&[("unit", &department)])),
    )
    .await?;
    assert_eq!(status, 200, "the owner shares: {shares}");
    assert!(
        shared_ids(&app, &bearer(&in_team)?).await?.contains(&id),
        "a team member sees a department share"
    );
    assert!(
        shared_ids(&app, &bearer(&in_department)?)
            .await?
            .contains(&id),
        "a department member sees it"
    );

    // Replacing it with a share to the team reaches the team, never the department above it.
    let (status, shares) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&owner_auth),
        Some(share_body(&[("unit", &team)])),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        shares.get("data").and_then(Value::as_array).map(Vec::len),
        Some(1),
        "the old share is gone: {shares}"
    );
    assert!(
        shared_ids(&app, &bearer(&in_team)?).await?.contains(&id),
        "the team member still sees it"
    );
    assert!(
        !shared_ids(&app, &bearer(&in_department)?)
            .await?
            .contains(&id),
        "a department member does not inherit a team share"
    );

    // Membership is resolved at read time: taking the user out of the team takes the access
    // with it, with no share row to clean up.
    agents_store::units::remove_member(&db, &org_id, &team, &in_team, None).await?;
    assert!(
        !shared_ids(&app, &bearer(&in_team)?).await?.contains(&id),
        "removing the user from the unit removes the access"
    );
    Ok(())
}

#[tokio::test]
async fn a_user_share_works_and_revoking_it_removes_access() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let recipient = member_of(&db, &org_id, "member").await?;
    let agent = assistant(&db, Some(&org_id)).await?;
    let owner_auth = bearer(&owner)?;
    let recipient_auth = bearer(&recipient)?;
    let id = session(&db, &owner, Some(&org_id), &agent, "mine").await?;

    let (status, shares) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&owner_auth),
        Some(share_body(&[("user", &recipient)])),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        shares.pointer("/data/0/level").and_then(Value::as_str),
        Some("view")
    );
    let share = share_id(&shares, &recipient).ok_or("no share id")?;

    // Positive control: before the revoke the recipient reads the transcript.
    assert!(shared_ids(&app, &recipient_auth).await?.contains(&id));
    let (status, transcript) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/shared/{id}"),
        Some(&recipient_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "{transcript}");
    assert_eq!(
        transcript.pointer("/assistantName").and_then(Value::as_str),
        Some("Test Agent")
    );

    // Revoke it by id.
    let (status, _) = send(
        &app,
        "DELETE",
        &format!("/api/dashboard/chat/sessions/{id}/shares/{share}"),
        Some(&owner_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert!(!shared_ids(&app, &recipient_auth).await?.contains(&id));
    // The chat is still in the recipient's own organisation, so the transcript is the 403 §4
    // gives a known row the caller may not read, not a 404: the list is what hides it.
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/shared/{id}"),
        Some(&recipient_auth),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (403, Some("permission_denied")));

    // The owner still sees an empty list of shares, and the audit trail has both changes.
    let (status, shares) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&owner_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        shares.get("data").and_then(Value::as_array).map(Vec::len),
        Some(0)
    );
    let actions: Vec<String> = sqlx::query_scalar(
        r#"SELECT "action" FROM "AuditLog"
           WHERE "resource" = $1 AND "action" IN ('rbac.share.create','rbac.share.revoke')
           ORDER BY "createdAt" ASC"#,
    )
    .bind(format!("session:{id}"))
    .fetch_all(&db)
    .await?;
    assert_eq!(actions, vec!["rbac.share.create", "rbac.share.revoke"]);

    // Sharing again revives the same row rather than writing a second one.
    let (status, shares) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&owner_auth),
        Some(share_body(&[("user", &recipient)])),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(share_id(&shares, &recipient), Some(share));
    assert!(shared_ids(&app, &recipient_auth).await?.contains(&id));
    Ok(())
}

#[tokio::test]
async fn only_the_owner_or_an_admin_shares() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let other = member_of(&db, &org_id, "member").await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let agent = assistant(&db, Some(&org_id)).await?;
    let owner_auth = bearer(&owner)?;
    let id = session(&db, &owner, Some(&org_id), &agent, "mine").await?;
    let uri = format!("/api/dashboard/chat/sessions/{id}/shares");

    // A member who is not the owner may not share it ...
    let (status, body) = send(
        &app,
        "PUT",
        &uri,
        Some(&bearer(&other)?),
        Some(share_body(&[("user", &other)])),
    )
    .await?;
    assert_eq!((status, code(&body)), (403, Some("permission_denied")));

    // ... and may not read its share list either.
    let (status, body) = send(&app, "GET", &uri, Some(&bearer(&other)?), None).await?;
    assert_eq!((status, code(&body)), (403, Some("permission_denied")));

    // Positive controls: the owner and an admin both may.
    let (status, _) = send(
        &app,
        "PUT",
        &uri,
        Some(&owner_auth),
        Some(share_body(&[("user", &other)])),
    )
    .await?;
    assert_eq!(status, 200, "the owner shares their own chat");
    let (status, shares) = send(
        &app,
        "PUT",
        &uri,
        Some(&bearer(&admin)?),
        Some(share_body(&[("org", &org_id)])),
    )
    .await?;
    assert_eq!(status, 200, "an admin shares it: {shares}");
    Ok(())
}

#[tokio::test]
async fn another_organisations_chat_is_a_404_everywhere() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    let owner_a = member_of(&db, &org_a, "member").await?;
    let recipient_a = member_of(&db, &org_a, "member").await?;
    let owner_b = member_of(&db, &org_b, "admin").await?;
    let agent_a = assistant(&db, Some(&org_a)).await?;
    let id = session(&db, &owner_a, Some(&org_a), &agent_a, "a's chat").await?;

    // Positive controls inside A: the owner shares, the recipient reads.
    let (status, shares) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&bearer(&owner_a)?),
        Some(share_body(&[("user", &recipient_a)])),
    )
    .await?;
    assert_eq!(status, 200);
    let share = share_id(&shares, &recipient_a).ok_or("no share id")?;
    assert!(
        shared_ids(&app, &bearer(&recipient_a)?)
            .await?
            .contains(&id)
    );

    // B, inside its own organisation, sees none of it.
    let auth_b = bearer(&owner_b)?;
    assert!(!shared_ids(&app, &auth_b).await?.contains(&id));
    let calls = [
        (
            "GET",
            format!("/api/dashboard/chat/sessions/{id}/shares"),
            None,
        ),
        (
            "PUT",
            format!("/api/dashboard/chat/sessions/{id}/shares"),
            Some(share_body(&[("user", &owner_b)])),
        ),
        (
            "DELETE",
            format!("/api/dashboard/chat/sessions/{id}/shares/{share}"),
            None,
        ),
        ("GET", format!("/api/dashboard/chat/shared/{id}"), None),
        (
            "POST",
            format!("/api/dashboard/chat/shared/{id}/fork"),
            None,
        ),
    ];
    for (method, uri, body) in calls {
        let (status, response) = send(&app, method, &uri, Some(&auth_b), body).await?;
        assert_eq!(
            (status, code(&response)),
            (404, Some("not_found")),
            "{method} {uri} from another organisation"
        );
    }
    Ok(())
}

#[tokio::test]
async fn a_recipient_cannot_write_through_the_session_routes() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let recipient = member_of(&db, &org_id, "member").await?;
    let agent = assistant(&db, Some(&org_id)).await?;
    let id = session(&db, &owner, Some(&org_id), &agent, "theirs").await?;
    send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&bearer(&owner)?),
        Some(share_body(&[("user", &recipient)])),
    )
    .await?;
    let auth = bearer(&recipient)?;

    let calls = [
        ("GET", format!("/api/dashboard/chat/sessions/{id}"), None),
        (
            "PATCH",
            format!("/api/dashboard/chat/sessions/{id}"),
            Some(json!({"title": "mine now"})),
        ),
        ("DELETE", format!("/api/dashboard/chat/sessions/{id}"), None),
        (
            "POST",
            format!("/api/dashboard/chat/sessions/{id}/messages"),
            Some(json!({"messages": [{"role": "user", "content": "hi"}]})),
        ),
        (
            "PATCH",
            format!("/api/dashboard/chat/sessions/{id}/messages"),
            Some(json!({"messageId": "m1", "content": "changed"})),
        ),
        (
            "DELETE",
            format!("/api/dashboard/chat/sessions/{id}/messages"),
            Some(json!({"messageIds": ["m1"]})),
        ),
    ];
    for (method, uri, body) in calls {
        let (status, response) = send(&app, method, &uri, Some(&auth), body).await?;
        assert_eq!(
            (status, code(&response)),
            (404, Some("not_found")),
            "{method} {uri} as a recipient"
        );
    }

    // Positive control: the owner still reads it.
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&bearer(&owner)?),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    Ok(())
}

#[tokio::test]
async fn fork_needs_agents_use_and_the_copy_is_the_callers() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let recipient = member_of(&db, &org_id, "member").await?;
    let agent = assistant(&db, Some(&org_id)).await?;
    let owner_auth = bearer(&owner)?;
    let recipient_auth = bearer(&recipient)?;
    let id = chat_with_messages(&app, &owner_auth, &agent, Some(&org_id), &db, &owner).await?;
    send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&owner_auth),
        Some(share_body(&[("user", &recipient)])),
    )
    .await?;

    // Reading is not using: without `agents.use` the fork is refused.
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/shared/{id}/fork"),
        Some(&recipient_auth),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (403, Some("permission_denied")));

    // With the grant it copies the transcript into the recipient's own sessions.
    grant_use(&db, &org_id, &agent, user_subject(&recipient)).await?;
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/shared/{id}/fork"),
        Some(&recipient_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "{body}");
    let forked = body
        .pointer("/id")
        .and_then(Value::as_str)
        .ok_or("no forked id")?
        .to_owned();
    assert_ne!(forked, id);
    assert_eq!(
        body.pointer("/messageCount").and_then(Value::as_i64),
        Some(2)
    );

    // It is the caller's own session, with the same transcript.
    let (status, detail) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{forked}"),
        Some(&recipient_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "the recipient owns the fork");
    assert_eq!(
        detail
            .pointer("/messages")
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(2)
    );
    // A recipient still cannot write to the original.
    let (status, _) = send(
        &app,
        "PATCH",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&recipient_auth),
        Some(json!({"title": "renamed"})),
    )
    .await?;
    assert_eq!(status, 404);

    // The copy is independent: a later turn in the fork leaves the original alone.
    send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{forked}/messages"),
        Some(&recipient_auth),
        Some(json!({"messages": [{"id": new_id(), "role": "user", "content": "more"}]})),
    )
    .await?;
    let (_, transcript) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/shared/{id}"),
        Some(&recipient_auth),
        None,
    )
    .await?;
    assert_eq!(
        transcript
            .pointer("/messages")
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(2),
        "the original keeps its two messages"
    );
    Ok(())
}

#[tokio::test]
async fn an_orgless_chat_is_a_409_unless_its_agent_names_one_org() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let owner_auth = bearer(&owner)?;
    let org_agent = assistant(&db, Some(&org_id)).await?;
    let global_agent = assistant(&db, None).await?;

    // A chat written before sessions carried an organisation, with a global agent: 409.
    let global = session(&db, &owner, None, &global_agent, "global").await?;
    let (status, body) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{global}/shares"),
        Some(&owner_auth),
        Some(share_body(&[("user", &owner)])),
    )
    .await?;
    assert_eq!((status, code(&body)), (409, Some("conflict")));
    assert!(
        body.pointer("/error/message")
            .and_then(Value::as_str)
            .is_some_and(|text| text.contains("belongs to no organisation")),
        "the caller is told why: {body}"
    );

    // The same chat, with an agent of exactly this organisation: the first share attaches it.
    let recoverable = session(&db, &owner, None, &org_agent, "old").await?;
    let (status, shares) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{recoverable}/shares"),
        Some(&owner_auth),
        Some(share_body(&[("user", &owner)])),
    )
    .await?;
    assert_eq!(status, 200, "{shares}");
    let attached: Option<String> =
        sqlx::query_scalar(r#"SELECT "organizationId" FROM "DashboardSession" WHERE "id" = $1"#)
            .bind(&recoverable)
            .fetch_one(&db)
            .await?;
    assert_eq!(attached.as_deref(), Some(org_id.as_str()));
    Ok(())
}

#[tokio::test]
async fn a_share_to_a_stranger_is_a_404() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    let owner = member_of(&db, &org_a, "member").await?;
    let stranger = member_of(&db, &org_b, "member").await?;
    let agent = assistant(&db, Some(&org_a)).await?;
    let owner_auth = bearer(&owner)?;
    let id = session(&db, &owner, Some(&org_a), &agent, "mine").await?;

    for subject in [
        ("user", stranger.as_str()),
        ("unit", "no-such-unit"),
        ("org", org_b.as_str()),
    ] {
        let (status, body) = send(
            &app,
            "PUT",
            &format!("/api/dashboard/chat/sessions/{id}/shares"),
            Some(&owner_auth),
            Some(share_body(&[subject])),
        )
        .await?;
        assert_eq!(
            (status, code(&body)),
            (404, Some("not_found")),
            "a share to {subject:?} outside the organisation"
        );
    }

    // Positive control: a subject of the organisation is accepted.
    let (status, _) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&owner_auth),
        Some(share_body(&[(SubjectType::Org.as_str(), org_a.as_str())])),
    )
    .await?;
    assert_eq!(status, 200);
    Ok(())
}

#[tokio::test]
async fn the_audit_address_is_the_socket_peer_not_a_header() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let recipient = member_of(&db, &org_id, "member").await?;
    let agent = assistant(&db, Some(&org_id)).await?;
    let id = session(&db, &owner, Some(&org_id), &agent, "audited").await?;
    let auth = bearer(&owner)?;
    let peer: std::net::SocketAddr = "203.0.113.9:4000".parse()?;
    // No proxy is trusted by default, so this header is the client's own claim.
    let spoofed = [("x-forwarded-for", "198.51.100.1")];

    let (status, shares) = send_from(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&auth),
        Some(share_body(&[("user", &recipient)])),
        &spoofed,
        Some(peer),
    )
    .await?;
    assert_eq!(status, 200, "{shares}");
    let share = share_id(&shares, &recipient).ok_or("no share id")?;
    let (status, _) = send_from(
        &app,
        "DELETE",
        &format!("/api/dashboard/chat/sessions/{id}/shares/{share}"),
        Some(&auth),
        None,
        &spoofed,
        Some(peer),
    )
    .await?;
    assert_eq!(status, 200);

    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        r#"SELECT "action", "ipAddress" FROM "AuditLog" WHERE "resource" = $1
           ORDER BY "createdAt" ASC"#,
    )
    .bind(format!("session:{id}"))
    .fetch_all(&db)
    .await?;
    assert_eq!(
        rows,
        vec![
            (
                "rbac.share.create".to_owned(),
                Some("203.0.113.9".to_owned())
            ),
            (
                "rbac.share.revoke".to_owned(),
                Some("203.0.113.9".to_owned())
            ),
        ]
    );
    Ok(())
}

#[tokio::test]
async fn an_admin_does_not_read_a_chat_nobody_shared() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let admin = member_of(&db, &org_id, "admin").await?;
    let agent = assistant(&db, Some(&org_id)).await?;
    let id = chat_with_messages(&app, &bearer(&owner)?, &agent, Some(&org_id), &db, &owner).await?;
    let admin_auth = bearer(&admin)?;

    for (method, uri) in [
        ("GET", format!("/api/dashboard/chat/shared/{id}")),
        ("POST", format!("/api/dashboard/chat/shared/{id}/fork")),
    ] {
        let (status, body) = send(&app, method, &uri, Some(&admin_auth), None).await?;
        assert_eq!(
            (status, code(&body)),
            (403, Some("permission_denied")),
            "{method} {uri} as an admin"
        );
    }
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!(status, 404, "the session routes stay owner-only");
    assert!(!shared_ids(&app, &admin_auth).await?.contains(&id));

    // Positive control: once the owner shares it with the organisation, the admin reads it.
    let (status, _) = send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&bearer(&owner)?),
        Some(share_body(&[("org", &org_id)])),
    )
    .await?;
    assert_eq!(status, 200);
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/shared/{id}"),
        Some(&admin_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    Ok(())
}

/// The organisation of a session, straight from the row.
async fn session_org(db: &PgPool, id: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(r#"SELECT "organizationId" FROM "DashboardSession" WHERE "id" = $1"#)
        .bind(id)
        .fetch_one(db)
        .await
}

#[tokio::test]
async fn the_backfill_only_attaches_a_chat_to_its_agents_org_for_a_member() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    let admin_a = member_of(&db, &org_a, "admin").await?;
    let member_a = member_of(&db, &org_a, "member").await?;
    let outsider = member_of(&db, &org_b, "member").await?;
    let both = member_of(&db, &org_b, "member").await?;
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,'member',now())"#,
    )
    .bind(new_id())
    .bind(&both)
    .bind(&org_a)
    .execute(&db)
    .await?;
    let (agent_a, agent_b) = (
        assistant(&db, Some(&org_a)).await?,
        assistant(&db, Some(&org_b)).await?,
    );
    let global = assistant(&db, None).await?;
    let admin_auth = bearer(&admin_a)?;
    let in_a = [("x-organization-id", org_a.as_str())];

    // An admin of A on an org-less chat that is not A's: a 404, as for any other tenant's row,
    // and nothing is attached.
    let not_ours = [
        // A's agent, but the owner is not a member of A.
        session(&db, &outsider, None, &agent_a, "outsider").await?,
        // The agent is B's.
        session(&db, &both, None, &agent_b, "b's agent").await?,
        // A global agent, somebody else's chat.
        session(&db, &member_a, None, &global, "global").await?,
    ];
    for id in &not_ours {
        let uri = format!("/api/dashboard/chat/sessions/{id}/shares");
        let (status, body) = send_with(&app, "GET", &uri, Some(&admin_auth), None, &in_a).await?;
        assert_eq!((status, code(&body)), (404, Some("not_found")), "GET {id}");
        let (status, body) = send_with(
            &app,
            "PUT",
            &uri,
            Some(&admin_auth),
            Some(share_body(&[("org", &org_a)])),
            &in_a,
        )
        .await?;
        assert_eq!((status, code(&body)), (404, Some("not_found")), "PUT {id}");
        assert_eq!(session_org(&db, id).await?, None, "{id} was attached");
    }
    // The owner acting in A on their chat with B's agent: also not A's.
    let (status, body) = send_with(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{}/shares", not_ours[1]),
        Some(&bearer(&both)?),
        Some(share_body(&[("org", &org_a)])),
        &in_a,
    )
    .await?;
    assert_eq!((status, code(&body)), (404, Some("not_found")));
    assert_eq!(session_org(&db, &not_ours[1]).await?, None);

    // An org-less chat A may claim is refused to a member who is not its owner, like any of A's.
    let mine = session(&db, &admin_a, None, &agent_a, "admin's").await?;
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{mine}/shares"),
        Some(&bearer(&member_a)?),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (403, Some("permission_denied")));

    // Positive control: an admin of A attaches a member's chat with A's agent, with the share.
    let theirs = session(&db, &member_a, None, &agent_a, "member's").await?;
    let (status, body) = send_with(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{theirs}/shares"),
        Some(&admin_auth),
        Some(share_body(&[("org", &org_a)])),
        &in_a,
    )
    .await?;
    assert_eq!(status, 200, "{body}");
    assert_eq!(session_org(&db, &theirs).await?, Some(org_a.clone()));
    Ok(())
}

#[tokio::test]
async fn a_new_chat_belongs_to_its_agents_org_not_the_header() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (org_a, org_b) = (org(&db).await?, org(&db).await?);
    let user = member_of(&db, &org_a, "member").await?;
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,'member',now())"#,
    )
    .bind(new_id())
    .bind(&user)
    .bind(&org_b)
    .execute(&db)
    .await?;
    let agent_b = assistant(&db, Some(&org_b)).await?;
    let global = assistant(&db, None).await?;
    let auth = bearer(&user)?;
    let in_a = [("x-organization-id", org_a.as_str())];

    // Acting in A with B's agent: the chat is B's, so A can never share a B transcript.
    let (status, body) = send_with(
        &app,
        "POST",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        Some(json!({"assistantId": agent_b})),
        &in_a,
    )
    .await?;
    assert_eq!(status, 200, "{body}");
    let id = body.pointer("/id").and_then(Value::as_str).ok_or("no id")?;
    assert_eq!(session_org(&db, id).await?, Some(org_b.clone()));

    // Positive control: an agent of no organisation takes the organisation the request acts in.
    let (status, body) = send_with(
        &app,
        "POST",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        Some(json!({"assistantId": global})),
        &in_a,
    )
    .await?;
    assert_eq!(status, 200, "{body}");
    let id = body.pointer("/id").and_then(Value::as_str).ok_or("no id")?;
    assert_eq!(session_org(&db, id).await?, Some(org_a.clone()));
    Ok(())
}

#[tokio::test]
async fn a_fork_leaves_the_edit_history_home_and_lands_in_the_callers_org() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let org_id = org(&db).await?;
    let owner = member_of(&db, &org_id, "member").await?;
    let recipient = member_of(&db, &org_id, "member").await?;
    let third = member_of(&db, &org_id, "member").await?;
    let agent = assistant(&db, Some(&org_id)).await?;
    for user in [&recipient, &third] {
        grant_use(&db, &org_id, &agent, user_subject(user)).await?;
    }
    let owner_auth = bearer(&owner)?;
    let id = session(&db, &owner, Some(&org_id), &agent, "drafts").await?;
    let (status, _) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&owner_auth),
        Some(json!({"messages": [{
            "id": new_id(), "role": "user", "content": "final",
            "editHistory": [{"content": "a private first draft", "editedAt": "2026-11-14T00:00:00Z"}]
        }]})),
    )
    .await?;
    assert_eq!(status, 200);
    send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{id}/shares"),
        Some(&owner_auth),
        Some(share_body(&[("user", &recipient)])),
    )
    .await?;
    let recipient_auth = bearer(&recipient)?;

    let (status, transcript) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/shared/{id}"),
        Some(&recipient_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert!(
        !transcript.to_string().contains("private first draft"),
        "{transcript}"
    );
    let (status, fork) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/shared/{id}/fork"),
        Some(&recipient_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "{fork}");
    let forked = fork.pointer("/id").and_then(Value::as_str).ok_or("no id")?;
    assert_eq!(session_org(&db, forked).await?, Some(org_id.clone()));
    let history: Vec<Option<serde_json::Value>> = sqlx::query_scalar(
        r#"SELECT "editHistory" FROM "DashboardMessage" WHERE "sessionId" = $1"#,
    )
    .bind(forked)
    .fetch_all(&db)
    .await?;
    assert_eq!(history, vec![None], "the fork carries no edit history");
    // Positive control: the original still has it.
    let (_, detail) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&owner_auth),
        None,
    )
    .await?;
    assert!(detail.to_string().contains("private first draft"));

    // A fork of the fork, shared on: the third user sees the recipient's copy, and nothing of
    // the owner's original, which was never shared with them.
    send(
        &app,
        "PUT",
        &format!("/api/dashboard/chat/sessions/{forked}/shares"),
        Some(&recipient_auth),
        Some(share_body(&[("user", &third)])),
    )
    .await?;
    let third_auth = bearer(&third)?;
    let (status, again) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/shared/{forked}/fork"),
        Some(&third_auth),
        None,
    )
    .await?;
    assert_eq!(status, 200, "{again}");
    assert_eq!(
        again.pointer("/messageCount").and_then(Value::as_i64),
        Some(1)
    );
    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/shared/{id}"),
        Some(&third_auth),
        None,
    )
    .await?;
    assert_eq!(status, 403, "the original stays closed to the third user");
    Ok(())
}
