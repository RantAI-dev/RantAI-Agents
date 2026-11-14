//! Integration tests for the dashboard sessions and messages.
//! Set `TEST_DATABASE_URL`; without it each test prints why it skipped and passes.

use agents_store::sessions::{self, JsonWrite, MessageChanges, NewMessage};
use agents_store::{PgPool, StoreError, new_id};
use serde_json::{Value, json};

type R = Result<(), Box<dyn std::error::Error>>;

async fn db() -> Result<Option<PgPool>, sqlx::Error> {
    match std::env::var("TEST_DATABASE_URL") {
        Ok(url) if !url.is_empty() => Ok(Some(PgPool::connect(&url).await?)),
        _ if std::env::var_os("CI").is_some() => Err(sqlx::Error::Configuration(
            "TEST_DATABASE_URL must be set in CI: these tests may not skip there".into(),
        )),
        _ => {
            eprintln!("skipped: TEST_DATABASE_URL is not set");
            Ok(None)
        }
    }
}

/// A session row for a user; returns its id.
async fn session(db: &PgPool, user_id: &str, title: &str) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "DashboardSession" ("id","userId","title","assistantId","createdAt","updatedAt")
           VALUES ($1,$2,$3,'assistant-1',now(),now())"#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(title)
    .execute(db)
    .await?;
    Ok(id)
}

/// A message row in a session; returns its id.
async fn message(
    db: &PgPool,
    session_id: &str,
    id: &str,
    role: &str,
    content: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "DashboardMessage" ("id","sessionId","role","content","createdAt")
           VALUES ($1,$2,$3,$4,now())"#,
    )
    .bind(id)
    .bind(session_id)
    .bind(role)
    .bind(content)
    .execute(db)
    .await?;
    Ok(())
}

fn new_message(role: &str, content: &str) -> NewMessage {
    NewMessage {
        id: None,
        role: role.to_owned(),
        content: content.to_owned(),
        reply_to: None,
        edit_history: None,
        sources: None,
        metadata: None,
    }
}

#[tokio::test]
async fn another_users_session_is_not_found() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (alice, bob) = (format!("u_{}", new_id()), format!("u_{}", new_id()));
    let theirs = session(&db, &bob, "theirs").await?;
    message(&db, &theirs, &new_id(), "user", "hello").await?;

    assert!(
        matches!(
            sessions::get_session(&db, &alice, &theirs).await,
            Err(StoreError::NotFound)
        ),
        "read"
    );
    assert!(
        matches!(
            sessions::get_session_detail(&db, &alice, &theirs).await,
            Err(StoreError::NotFound)
        ),
        "read with messages"
    );
    assert!(
        matches!(
            sessions::update_title(&db, &alice, &theirs, "mine").await,
            Err(StoreError::NotFound)
        ),
        "rename"
    );
    assert!(
        matches!(
            sessions::delete_session(&db, &alice, &theirs).await,
            Err(StoreError::NotFound)
        ),
        "delete"
    );
    assert!(
        matches!(
            sessions::list_messages(&db, &alice, &theirs).await,
            Err(StoreError::NotFound)
        ),
        "list messages"
    );
    assert!(
        matches!(
            sessions::add_messages(&db, &alice, &theirs, &[new_message("user", "hi")]).await,
            Err(StoreError::NotFound)
        ),
        "add a message"
    );
    assert!(
        matches!(
            sessions::update_message(&db, &alice, &theirs, "any", &MessageChanges::default()).await,
            Err(StoreError::NotFound)
        ),
        "update a message"
    );
    assert!(
        matches!(
            sessions::delete_messages(&db, &alice, &theirs, &[new_id()]).await,
            Err(StoreError::NotFound)
        ),
        "delete messages"
    );

    // Nothing of theirs changed.
    let rows = sessions::list_sessions(&db, &bob).await?;
    assert_eq!(rows.len(), 1, "the session still belongs to its owner");
    assert_eq!(rows.first().map(|r| r.title.as_str()), Some("theirs"));
    assert_eq!(
        sessions::list_messages(&db, &bob, &theirs).await?.len(),
        1,
        "the message is still there"
    );
    Ok(())
}

#[tokio::test]
async fn messages_come_back_in_seq_order() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let alice = format!("u_{}", new_id());
    let hers = session(&db, &alice, "chat").await?;
    // Written in an order that is neither the id order nor the createdAt order: `seq` is the
    // only stable order a reload can use. The ids carry the test's own prefix, so the tests
    // that share a database cannot collide.
    let prefix = new_id();
    let (third, first, second) = (
        format!("{prefix}-3"),
        format!("{prefix}-1"),
        format!("{prefix}-2"),
    );
    for (id, content) in [(&third, "third"), (&first, "first"), (&second, "second")] {
        message(&db, &hers, id, "user", content).await?;
    }

    let rows = sessions::list_messages(&db, &alice, &hers).await?;
    let ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
    let wanted = vec![third.as_str(), first.as_str(), second.as_str()];
    assert_eq!(ids, wanted, "the insert order");

    let detail = sessions::get_session_detail(&db, &alice, &hers).await?;
    let detail_ids: Vec<&str> = detail.messages.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(detail_ids, wanted, "the same order in the detail");
    Ok(())
}

#[tokio::test]
async fn deleting_messages_removes_only_the_given_ids() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (alice, bob) = (format!("u_{}", new_id()), format!("u_{}", new_id()));
    let hers = session(&db, &alice, "mine").await?;
    let theirs = session(&db, &bob, "theirs").await?;
    let prefix = new_id();
    let (m1, m2, m3) = (
        format!("{prefix}-1"),
        format!("{prefix}-2"),
        format!("{prefix}-3"),
    );
    message(&db, &hers, &m1, "user", "one").await?;
    message(&db, &hers, &m2, "user", "two").await?;
    message(&db, &theirs, &m3, "user", "three").await?;

    let deleted =
        sessions::delete_messages(&db, &alice, &hers, &[m1.clone(), m3.clone(), new_id()]).await?;
    assert_eq!(
        deleted, 1,
        "only the message of the caller's own session goes"
    );

    let left = sessions::list_messages(&db, &alice, &hers).await?;
    let ids: Vec<&str> = left.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(
        ids,
        vec![m2.as_str()],
        "the message that was not named stays"
    );

    let other = sessions::list_messages(&db, &bob, &theirs).await?;
    assert_eq!(other.len(), 1, "the other session keeps its message");
    Ok(())
}

#[tokio::test]
async fn a_message_id_of_another_session_is_a_conflict() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (alice, bob) = (format!("u_{}", new_id()), format!("u_{}", new_id()));
    let hers = session(&db, &alice, "mine").await?;
    let theirs = session(&db, &bob, "theirs").await?;
    let id = format!("{}-1", new_id());
    message(&db, &theirs, &id, "user", "one").await?;

    let mut moved = new_message("user", "two");
    moved.id = Some(id);
    assert!(
        matches!(
            sessions::add_messages(&db, &alice, &hers, &[moved]).await,
            Err(StoreError::Conflict)
        ),
        "a message may not move to another session"
    );
    let other = sessions::list_messages(&db, &bob, &theirs).await?;
    assert_eq!(other.len(), 1, "the message is still in its own session");
    Ok(())
}

#[tokio::test]
async fn the_edit_history_keeps_the_user_text_and_the_reply() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let alice = format!("u_{}", new_id());
    let hers = session(&db, &alice, "chat").await?;
    let history = json!([
        { "content": "first question", "assistantResponse": "first answer", "editedAt": "2026-11-14T10:00:00.000Z" },
        { "content": "second question", "editedAt": "2026-11-14T11:00:00.000Z" }
    ]);
    let mut written = new_message("user", "third question");
    written.edit_history = Some(history.clone());
    let rows = sessions::add_messages(&db, &alice, &hers, &[written]).await?;

    let stored = rows.first().and_then(|r| r.edit_history.as_ref());
    let entries = stored.and_then(Value::as_array).map(Vec::len);
    assert_eq!(entries, Some(2), "both versions are stored");
    let first = stored
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .and_then(|e| e.as_object());
    assert_eq!(
        first.and_then(|e| e.get("content")).and_then(Value::as_str),
        Some("first question"),
        "the user text of the version"
    );
    assert_eq!(
        first
            .and_then(|e| e.get("assistantResponse"))
            .and_then(Value::as_str),
        Some("first answer"),
        "the assistant reply of the version"
    );

    // The same history after a reload.
    let reread = sessions::list_messages(&db, &alice, &hers).await?;
    let after = reread.first().and_then(|r| r.edit_history.as_ref());
    assert_eq!(after, stored, "the history survives the round trip");
    Ok(())
}

#[tokio::test]
async fn an_update_leaves_the_fields_it_does_not_send_alone() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let alice = format!("u_{}", new_id());
    let hers = session(&db, &alice, "chat").await?;
    let mut written = new_message("user", "hello");
    written.edit_history = Some(json!([
        { "content": "older", "assistantResponse": "older answer", "editedAt": "2026-11-14T10:00:00.000Z" }
    ]));
    written.metadata = Some(json!({"artifactIds": ["a1"]}));
    let rows = sessions::add_messages(&db, &alice, &hers, &[written]).await?;
    let id = rows.first().map(|r| r.id.clone()).unwrap_or_default();

    // Only the content changes.
    let changed = sessions::update_message(
        &db,
        &alice,
        &hers,
        &id,
        &MessageChanges {
            content: Some("hello again".to_owned()),
            ..MessageChanges::default()
        },
    )
    .await?;
    assert_eq!(changed.content, "hello again");
    assert_eq!(
        changed.edit_history,
        rows.first().and_then(|r| r.edit_history.clone()),
        "the edit history is untouched"
    );
    assert_eq!(
        changed.metadata,
        rows.first().and_then(|r| r.metadata.clone()),
        "the metadata is untouched"
    );

    // The sources can be cleared.
    let cleared = sessions::update_message(
        &db,
        &alice,
        &hers,
        &id,
        &MessageChanges {
            sources: JsonWrite::Clear,
            ..MessageChanges::default()
        },
    )
    .await?;
    assert_eq!(cleared.sources, None, "the sources are gone");
    assert_eq!(
        cleared.content, "hello again",
        "the content is untouched by the second update"
    );
    Ok(())
}

#[tokio::test]
async fn a_session_lists_only_for_its_owner() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (alice, bob) = (format!("u_{}", new_id()), format!("u_{}", new_id()));
    let hers = session(&db, &alice, "mine").await?;
    let theirs = session(&db, &bob, "theirs").await?;
    message(&db, &hers, &format!("{}-1", new_id()), "user", "hello").await?;

    let rows = sessions::list_sessions(&db, &alice).await?;
    assert_eq!(rows.len(), 1, "only her own session");
    let row = rows.first();
    assert_eq!(row.map(|r| r.id.as_str()), Some(hers.as_str()));
    assert_eq!(row.map(|r| r.message_count), Some(1));
    assert_eq!(
        row.and_then(|r| r.last_message.clone()).as_deref(),
        Some("hello")
    );

    let other = sessions::list_sessions(&db, &bob).await?;
    assert_eq!(other.len(), 1);
    assert_eq!(other.first().map(|r| r.id.as_str()), Some(theirs.as_str()));
    Ok(())
}
