//! `/api/dashboard/chat/sessions/**` against a migrated database.

mod common;

use agents_store::PgPool;
use agents_store::new_id;
use agents_store::sessions;
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

/// An assistant; returns its id. Without an organisation it is open to every user.
async fn assistant(db: &PgPool, organization_id: Option<&str>) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Assistant" ("id","name","systemPrompt","model","organizationId","createdAt","updatedAt")
           VALUES ($1,'t','p','openrouter/free',$2,now(),now())"#,
    )
    .bind(&id)
    .bind(organization_id)
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

/// A session that belongs to `owner`.
async fn seed_session(
    db: &agents_store::PgPool,
    owner: &str,
    assistant_id: &str,
    title: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    Ok(sessions::create_session(db, owner, assistant_id, title)
        .await?
        .id)
}

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
async fn unauthenticated_callers_are_refused() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let owner = user(&db, false).await?;
    let assistant_id = assistant(&db, None).await?;
    let id = seed_session(&db, &owner, &assistant_id, "chat").await?;

    let calls = [
        ("GET", "/api/dashboard/chat/sessions".to_owned()),
        ("POST", "/api/dashboard/chat/sessions".to_owned()),
        ("GET", format!("/api/dashboard/chat/sessions/{id}")),
        ("PATCH", format!("/api/dashboard/chat/sessions/{id}")),
        ("DELETE", format!("/api/dashboard/chat/sessions/{id}")),
        (
            "POST",
            format!("/api/dashboard/chat/sessions/{id}/messages"),
        ),
        (
            "PATCH",
            format!("/api/dashboard/chat/sessions/{id}/messages"),
        ),
        (
            "DELETE",
            format!("/api/dashboard/chat/sessions/{id}/messages"),
        ),
    ];
    for (method, uri) in calls {
        let body = match method {
            "POST" if uri.ends_with("messages") => Some(json!({"messages": []})),
            "POST" => Some(json!({"assistantId": assistant_id})),
            "PATCH" if uri.ends_with("messages") => Some(json!({"messageId": "m1"})),
            "PATCH" => Some(json!({"title": "other"})),
            "DELETE" if uri.ends_with("messages") => Some(json!({"messageIds": ["m1"]})),
            _ => None,
        };
        let (status, response) = send(&app, method, &uri, None, body).await?;
        assert_eq!(
            (status, code(&response)),
            (401, Some("unauthenticated")),
            "{method} {uri} without a token"
        );
    }

    // A suspended user is refused too (QA TC-1269).
    let suspended = user(&db, true).await?;
    let (status, _) = send(
        &app,
        "GET",
        "/api/dashboard/chat/sessions",
        Some(&bearer(&suspended)?),
        None,
    )
    .await?;
    assert_eq!(status, 401);
    Ok(())
}

#[tokio::test]
async fn the_owner_creates_reads_renames_and_deletes_a_session() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let alice = user(&db, false).await?;
    let auth = bearer(&alice)?;
    let assistant_id = assistant(&db, None).await?;

    // Create.
    let (status, body) = send(
        &app,
        "POST",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        Some(json!({"assistantId": assistant_id, "title": "My chat"})),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/title"), Some(&json!("My chat")));
    assert_eq!(body.pointer("/assistantId"), Some(&json!(assistant_id)));
    assert_eq!(body.pointer("/messageCount"), Some(&json!(0)));
    assert_eq!(body.pointer("/lastMessage"), Some(&Value::Null));
    let id = body
        .pointer("/id")
        .and_then(Value::as_str)
        .ok_or("no session id")?
        .to_owned();
    // The message ids carry the test's own prefix: the tests share a database.
    let (m1, m2) = (new_id(), new_id());

    // List: the session is there, with the shape the sidebar reads.
    let (status, body) = send(
        &app,
        "GET",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    let list = body.as_array().map(Vec::len).unwrap_or_default();
    assert!(list >= 1, "the new session is listed");
    let first = body.as_array().and_then(|a| a.first());
    assert_eq!(
        first.and_then(|s| s.get("id")).and_then(Value::as_str),
        Some(id.as_str())
    );
    assert!(
        first.and_then(|s| s.get("createdAt")).is_some(),
        "createdAt"
    );
    assert!(
        first.and_then(|s| s.get("updatedAt")).is_some(),
        "updatedAt"
    );

    // Write a message.
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({
            "messages": [
                { "id": m1, "role": "user", "content": "hello" },
                { "id": m2, "role": "assistant", "content": "hi there" }
            ]
        })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.pointer("/messages")
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(2)
    );
    assert_eq!(
        body.pointer("/messages/0/content").and_then(Value::as_str),
        Some("hello")
    );

    // Read the session: the messages come back in the order they were written.
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/title"), Some(&json!("My chat")));
    let ids: Vec<&str> = body
        .pointer("/messages")
        .and_then(Value::as_array)
        .map(|messages| {
            messages
                .iter()
                .filter_map(|m| m.get("id").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(
        ids,
        vec![m1.as_str(), m2.as_str()],
        "the order the messages were written in"
    );
    assert!(
        body.get("artifacts").is_some(),
        "the artifacts are always there"
    );

    // Rename.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&auth),
        Some(json!({"title": "Renamed"})),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/title"), Some(&json!("Renamed")));
    assert_eq!(body.pointer("/id"), Some(&json!(id)));

    // Update one message.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({"messageId": m1, "content": "hello again"})),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.get("content").and_then(Value::as_str),
        Some("hello again")
    );
    assert_eq!(body.get("id").and_then(Value::as_str), Some(m1.as_str()));

    // Delete one message, then the session.
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({"messageIds": [m1]})),
    )
    .await?;
    assert_eq!((status, body), (200, json!({"success": true})));

    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!((status, body), (200, json!({"success": true})));

    let (status, _) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 404, "the session is gone");
    Ok(())
}

#[tokio::test]
async fn another_users_session_is_a_404() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (alice, bob) = (user(&db, false).await?, user(&db, false).await?);
    let assistant_id = assistant(&db, None).await?;
    let theirs = seed_session(&db, &bob, &assistant_id, "theirs").await?;
    let auth = bearer(&alice)?;

    let calls = [
        ("GET", format!("/api/dashboard/chat/sessions/{theirs}")),
        ("PATCH", format!("/api/dashboard/chat/sessions/{theirs}")),
        ("DELETE", format!("/api/dashboard/chat/sessions/{theirs}")),
        (
            "POST",
            format!("/api/dashboard/chat/sessions/{theirs}/messages"),
        ),
        (
            "PATCH",
            format!("/api/dashboard/chat/sessions/{theirs}/messages"),
        ),
        (
            "DELETE",
            format!("/api/dashboard/chat/sessions/{theirs}/messages"),
        ),
    ];
    for (method, uri) in calls {
        let body = match method {
            "POST" => Some(json!({"messages": [{"role": "user", "content": "hi"}]})),
            "PATCH" if uri.ends_with("messages") => Some(json!({"messageId": "m1"})),
            "PATCH" => Some(json!({"title": "mine now"})),
            "DELETE" if uri.ends_with("messages") => Some(json!({"messageIds": ["m1"]})),
            _ => None,
        };
        let (status, response) = send(&app, method, &uri, Some(&auth), body).await?;
        assert_eq!(
            (status, code(&response)),
            (404, Some("not_found")),
            "{method} {uri} on somebody else's session"
        );
    }

    // It is still theirs, with the title it had.
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{theirs}"),
        Some(&bearer(&bob)?),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/title"), Some(&json!("theirs")));

    // A session of another user is not in the list either.
    let (_, body) = send(
        &app,
        "GET",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        None,
    )
    .await?;
    let listed = body
        .as_array()
        .map(|sessions| {
            sessions
                .iter()
                .filter_map(|s| s.get("id").and_then(Value::as_str))
                .collect::<Vec<&str>>()
        })
        .unwrap_or_default();
    assert!(
        !listed.contains(&theirs.as_str()),
        "another user's session is not listed"
    );
    Ok(())
}

#[tokio::test]
async fn bad_input_is_a_400_not_a_500() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let alice = user(&db, false).await?;
    let auth = bearer(&alice)?;
    let assistant_id = assistant(&db, None).await?;
    let id = seed_session(&db, &alice, &assistant_id, "chat").await?;

    // No body at all.
    let (status, body) = send(
        &app,
        "POST",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));

    // No assistant to chat with, and a field that does not exist: both are reported.
    let (status, body) = send(
        &app,
        "POST",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        Some(json!({"title": "no assistant", "nonsense": 1})),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    let mut reported = fields(&body);
    reported.sort_unstable();
    assert_eq!(
        reported,
        vec!["/assistantId", "/nonsense"],
        "every bad field is reported"
    );

    // A role that is not a role, and a message without content.
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({"messages": [{"role": "robot", "content": "hi"}]})),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    assert_eq!(fields(&body), vec!["/messages/0/role"]);

    // A message id that is missing, and a title that is empty.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({"content": "no id"})),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    assert_eq!(fields(&body), vec!["/messageId"]);

    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&auth),
        Some(json!({"title": ""})),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    assert_eq!(fields(&body), vec!["/title"]);

    // Message ids that are not a list of ids.
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({"messageIds": "m1"})),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));

    // An edit history entry without a timestamp.
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({
            "messages": [{
                "role": "user",
                "content": "hi",
                "editHistory": [{ "content": "older" }]
            }]
        })),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    assert_eq!(fields(&body), vec!["/messages/0/editHistory/0/editedAt"]);
    Ok(())
}

#[tokio::test]
async fn the_edit_history_survives_a_reload() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let alice = user(&db, false).await?;
    let auth = bearer(&alice)?;
    let assistant_id = assistant(&db, None).await?;
    let id = seed_session(&db, &alice, &assistant_id, "chat").await?;
    let message_id = new_id();

    let history = json!([
        { "content": "first question", "assistantResponse": "first answer", "editedAt": "2026-11-14T10:00:00.000Z" }
    ]);
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({
            "messages": [{
                "id": message_id,
                "role": "user",
                "content": "second question",
                "editHistory": history
            }]
        })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.pointer("/messages/0/editHistory/0/content")
            .and_then(Value::as_str),
        Some("first question"),
        "the user text of the earlier version"
    );
    assert_eq!(
        body.pointer("/messages/0/editHistory/0/assistantResponse")
            .and_then(Value::as_str),
        Some("first answer"),
        "the assistant reply of the earlier version"
    );

    // The same after a reload (QA TC-944).
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/dashboard/chat/sessions/{id}"),
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.pointer("/messages/0/editHistory/0/content")
            .and_then(Value::as_str),
        Some("first question")
    );
    assert_eq!(
        body.pointer("/messages/0/editHistory/0/assistantResponse")
            .and_then(Value::as_str),
        Some("first answer")
    );

    // And after an update of the message.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/dashboard/chat/sessions/{id}/messages"),
        Some(&auth),
        Some(json!({
            "messageId": message_id,
            "content": "third question",
            "editHistory": history
        })),
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.pointer("/editHistory/0/assistantResponse")
            .and_then(Value::as_str),
        Some("first answer")
    );
    Ok(())
}

#[tokio::test]
async fn an_assistant_of_another_organisation_is_a_404() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (alice, bob) = (user(&db, false).await?, user(&db, false).await?);
    let theirs = org(&db).await?;
    member(&db, &bob, &theirs).await?;
    let their_assistant = assistant(&db, Some(&theirs)).await?;
    let auth = bearer(&alice)?;

    let (status, body) = send(
        &app,
        "POST",
        "/api/dashboard/chat/sessions",
        Some(&auth),
        Some(json!({"assistantId": their_assistant})),
    )
    .await?;
    assert_eq!(
        (status, code(&body)),
        (404, Some("not_found")),
        "an assistant of another organisation is not found, not forbidden"
    );

    // A member of the organisation may start a chat with it.
    let (status, _) = send(
        &app,
        "POST",
        "/api/dashboard/chat/sessions",
        Some(&bearer(&bob)?),
        Some(json!({"assistantId": their_assistant})),
    )
    .await?;
    assert_eq!(status, 200);
    Ok(())
}

#[tokio::test]
async fn a_message_id_of_another_session_is_a_conflict() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let alice = user(&db, false).await?;
    let auth = bearer(&alice)?;
    let assistant_id = assistant(&db, None).await?;
    let (one, two) = (
        seed_session(&db, &alice, &assistant_id, "one").await?,
        seed_session(&db, &alice, &assistant_id, "two").await?,
    );
    let message_id = new_id();
    let (status, _) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{one}/messages"),
        Some(&auth),
        Some(json!({"messages": [{"id": message_id, "role": "user", "content": "hello"}]})),
    )
    .await?;
    assert_eq!(status, 200);

    // The same id in another session would move the message.
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/dashboard/chat/sessions/{two}/messages"),
        Some(&auth),
        Some(json!({"messages": [{"id": message_id, "role": "user", "content": "moved"}]})),
    )
    .await?;
    assert_eq!((status, code(&body)), (409, Some("conflict")));
    Ok(())
}
