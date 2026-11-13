//! `/api/dashboard/memory` and `/api/mobile/memories` against a migrated database.

mod common;

use agents_store::memory::{self, MemoryType};
use common::{R, bearer, code, router, send, user};
use serde_json::json;

#[tokio::test]
async fn unauthenticated_and_suspended_callers_are_refused() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (status, body) = send(&app, "GET", "/api/dashboard/memory", None, None).await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));

    // QA TC-1269: a suspended user's still-valid token must stop working.
    let suspended = user(&db, true).await?;
    let (status, _) = send(
        &app,
        "GET",
        "/api/dashboard/memory",
        Some(&bearer(&suspended)?),
        None,
    )
    .await?;
    assert_eq!(status, 401);

    let (status, body) = send(
        &app,
        "GET",
        "/api/dashboard/memory",
        Some("Bearer not-a-token"),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (401, Some("unauthenticated")));
    Ok(())
}

#[tokio::test]
async fn owner_lists_and_deletes_only_their_rows() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (alice, bob) = (user(&db, false).await?, user(&db, false).await?);
    let mine = memory::insert_raw(&db, &alice, MemoryType::Working, "k1", &json!({"a": 1})).await?;
    memory::insert_raw(
        &db,
        &alice,
        MemoryType::LongTerm,
        "user_profile",
        &json!({}),
    )
    .await?;
    let theirs = memory::insert_raw(&db, &bob, MemoryType::Working, "k2", &json!({})).await?;

    // Positive control: the owner sees both of their rows and correct stats.
    let (status, body) = send(
        &app,
        "GET",
        "/api/dashboard/memory",
        Some(&bearer(&alice)?),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/stats/total"), Some(&json!(2)));
    assert_eq!(body.pointer("/stats/working"), Some(&json!(1)));
    assert_eq!(
        body.pointer("/memories")
            .and_then(serde_json::Value::as_array)
            .map(Vec::len),
        Some(2)
    );
    assert!(
        !body.to_string().contains(&theirs),
        "another user's row must not be listed"
    );

    let (status, body) = send(
        &app,
        "GET",
        "/api/mobile/memories?type=WORKING",
        Some(&bearer(&alice)?),
        None,
    )
    .await?;
    assert_eq!(status, 200);
    assert_eq!(
        body.pointer("/memories")
            .and_then(serde_json::Value::as_array)
            .map(Vec::len),
        Some(1)
    );

    // Someone else's id is "not found", and the row survives.
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/dashboard/memory/{theirs}"),
        Some(&bearer(&alice)?),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (404, Some("not_found")));
    assert_eq!(memory::list(&db, &bob, None, 10).await?.len(), 1);

    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/dashboard/memory/{mine}"),
        Some(&bearer(&alice)?),
        None,
    )
    .await?;
    assert_eq!((status, body), (200, json!({"success": true})));
    Ok(())
}

#[tokio::test]
async fn bad_input_is_a_400_not_a_500() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let alice = user(&db, false).await?;
    let auth = bearer(&alice)?;
    let (status, body) = send(
        &app,
        "GET",
        "/api/dashboard/memory?type=BOGUS",
        Some(&auth),
        None,
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    let (status, body) = send(
        &app,
        "DELETE",
        "/api/dashboard/memory",
        Some(&auth),
        Some(json!({"type": "NOPE"})),
    )
    .await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));
    let (status, body) = send(&app, "DELETE", "/api/dashboard/memory", Some(&auth), None).await?;
    assert_eq!((status, code(&body)), (400, Some("invalid_request")));

    memory::insert_raw(&db, &alice, MemoryType::Semantic, "s", &json!({})).await?;
    memory::insert_raw(&db, &alice, MemoryType::Working, "w", &json!({})).await?;
    let (status, _) = send(
        &app,
        "DELETE",
        "/api/dashboard/memory",
        Some(&auth),
        Some(json!({"type": "SEMANTIC"})),
    )
    .await?;
    assert_eq!(status, 200);
    let left = memory::list(&db, &alice, None, 10).await?;
    assert_eq!(left.len(), 1, "only the SEMANTIC row is cleared");
    Ok(())
}
