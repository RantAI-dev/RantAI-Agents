//! The owner rules of `/api/organizations/**`: only an owner makes or unmakes an owner, the
//! last owner stays, and two writers demoting the two owners at once cannot leave none.
//!
//! Set `TEST_DATABASE_URL` to a migrated database; without it each test skips (and fails in CI).

mod common;
mod org_admin_fixtures;

use agents_store::PgPool;
use common::{R, bearer, code, router, send, user};
use org_admin_fixtures::{member, member_id, org, text};
use serde_json::{Value, json};

async fn call(
    app: &axum::Router,
    token: &str,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (u16, Value) {
    match send(app, method, uri, Some(token), body).await {
        Ok(answer) => answer,
        // A transport failure fails the assertion with the request's own error.
        Err(e) => (0, json!({ "testError": e.to_string() })),
    }
}

fn token(user_id: &str) -> String {
    bearer(user_id).unwrap_or_default()
}

fn denied(body: &Value) -> bool {
    code(body) == Some("permission_denied")
}

async fn owners(db: &PgPool, org_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>(
        r#"SELECT count(*) FROM "OrganizationMember" WHERE "organizationId" = $1 AND "role" = 'owner'"#,
    )
    .bind(org_id)
    .fetch_one(db)
    .await
}

/// Only an owner makes or unmakes an owner; an admin keeps the other member powers.
#[tokio::test]
async fn only_an_owner_makes_or_unmakes_an_owner() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    let admin = user(&db, false).await?;
    let target = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    member(&db, &admin, &o, "admin").await?;
    member(&db, &target, &o, "member").await?;
    let target_member = member_id(&db, &o, &target).await?;
    let to = token(&owner);
    let ta = token(&admin);

    // An admin may not make an owner.
    let (status, body) = call(
        &app,
        &ta,
        "PATCH",
        &format!("/api/organizations/{o}/members/{target_member}"),
        Some(json!({ "role": "owner" })),
    )
    .await;
    assert_eq!(status, 403, "{body}");
    assert!(denied(&body));

    // The owner may: the positive control for the same body.
    let (status, body) = call(
        &app,
        &to,
        "PATCH",
        &format!("/api/organizations/{o}/members/{target_member}"),
        Some(json!({ "role": "owner" })),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(text(&body, "/role"), "owner");
    assert_eq!(owners(&db, &o).await?, 2);

    // An admin may not demote an owner either.
    let (status, body) = call(
        &app,
        &ta,
        "PATCH",
        &format!("/api/organizations/{o}/members/{target_member}"),
        Some(json!({ "role": "member" })),
    )
    .await;
    assert_eq!(status, 403, "{body}");
    // Nor remove one.
    let (status, body) = call(
        &app,
        &ta,
        "DELETE",
        &format!("/api/organizations/{o}/members/{target_member}"),
        None,
    )
    .await;
    assert_eq!(status, 403, "{body}");
    assert!(denied(&body));

    // The owner demotes the second owner, with one left.
    let (status, body) = call(
        &app,
        &to,
        "PATCH",
        &format!("/api/organizations/{o}/members/{target_member}"),
        Some(json!({ "role": "member" })),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(owners(&db, &o).await?, 1);

    // An admin still manages an ordinary member: the admin's own power is intact.
    let (status, body) = call(
        &app,
        &ta,
        "PATCH",
        &format!("/api/organizations/{o}/members/{target_member}"),
        Some(json!({ "role": "viewer" })),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    Ok(())
}

/// The last owner cannot be demoted or removed; with a second owner both are allowed.
#[tokio::test]
async fn the_last_owner_stays() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let sole = user(&db, false).await?;
    let second = user(&db, false).await?;
    member(&db, &sole, &o, "owner").await?;
    member(&db, &second, &o, "member").await?;
    let ts = token(&sole);
    let sole_member = member_id(&db, &o, &sole).await?;
    let second_member = member_id(&db, &o, &second).await?;

    for (method, body) in [
        ("PATCH", Some(json!({ "role": "admin" }))),
        ("DELETE", None),
    ] {
        let (status, answer) = call(
            &app,
            &ts,
            method,
            &format!("/api/organizations/{o}/members/{sole_member}"),
            body,
        )
        .await;
        assert_eq!(status, 409, "the last owner {method}: {answer}");
        assert_eq!(code(&answer), Some("conflict"));
        assert_eq!(owners(&db, &o).await?, 1);
    }

    // A second owner makes the demotion legal: the positive control.
    let (status, body) = call(
        &app,
        &ts,
        "PATCH",
        &format!("/api/organizations/{o}/members/{second_member}"),
        Some(json!({ "role": "owner" })),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(owners(&db, &o).await?, 2);
    let (status, body) = call(
        &app,
        &ts,
        "PATCH",
        &format!("/api/organizations/{o}/members/{sole_member}"),
        Some(json!({ "role": "admin" })),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(owners(&db, &o).await?, 1);
    Ok(())
}

/// Two owners demote themselves at the same moment: exactly one of the two writes lands, so one
/// owner remains. Without the owner-row lock both see two owners and both succeed, leaving none.
#[tokio::test]
async fn two_concurrent_demotions_leave_one_owner() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    for round in 0..8 {
        let o = org(&db).await?;
        let a = user(&db, false).await?;
        let b = user(&db, false).await?;
        member(&db, &a, &o, "owner").await?;
        member(&db, &b, &o, "owner").await?;
        let ma = member_id(&db, &o, &a).await?;
        let mb = member_id(&db, &o, &b).await?;
        let ta = token(&a);
        let tb = token(&b);
        let body = Some(json!({ "role": "member" }));
        let uri_a = format!("/api/organizations/{o}/members/{ma}");
        let uri_b = format!("/api/organizations/{o}/members/{mb}");
        let (first, second) = tokio::join!(
            send(&app, "PATCH", &uri_a, Some(ta.as_str()), body.clone()),
            send(&app, "PATCH", &uri_b, Some(tb.as_str()), body),
        );
        let (first_status, first_body) = match first {
            Ok(answer) => answer,
            Err(e) => return Err(e),
        };
        let (second_status, second_body) = match second {
            Ok(answer) => answer,
            Err(e) => return Err(e),
        };
        assert_eq!(
            owners(&db, &o).await?,
            1,
            "round {round}: exactly one owner must remain, got {} and {} ({first_body} / {second_body})",
            first_status,
            second_status
        );
        let statuses = [first_status, second_status];
        assert!(
            statuses.contains(&200) && statuses.contains(&409),
            "round {round}: one demotion lands and one is refused, got {statuses:?}"
        );
    }
    Ok(())
}

/// Two owners remove each other at the same moment: the last one stays.
#[tokio::test]
async fn two_concurrent_removals_leave_one_owner() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    for round in 0..8 {
        let o = org(&db).await?;
        let a = user(&db, false).await?;
        let b = user(&db, false).await?;
        member(&db, &a, &o, "owner").await?;
        member(&db, &b, &o, "owner").await?;
        let ma = member_id(&db, &o, &a).await?;
        let mb = member_id(&db, &o, &b).await?;
        let ta = token(&a);
        let tb = token(&b);

        let uri_a = format!("/api/organizations/{o}/members/{mb}");
        let uri_b = format!("/api/organizations/{o}/members/{ma}");
        let (first, second) = tokio::join!(
            send(&app, "DELETE", &uri_a, Some(ta.as_str()), None),
            send(&app, "DELETE", &uri_b, Some(tb.as_str()), None),
        );
        let (first_status, first_body) = match first {
            Ok(answer) => answer,
            Err(e) => return Err(e),
        };
        let (second_status, second_body) = match second {
            Ok(answer) => answer,
            Err(e) => return Err(e),
        };
        assert_eq!(
            owners(&db, &o).await?,
            1,
            "round {round}: got {first_status} and {second_status} ({first_body} / {second_body})"
        );
        // One removal lands; the other is refused, or its actor was the one removed.
        assert!(
            [200, 409, 404].contains(&first_status) && [200, 409, 404].contains(&second_status),
            "round {round}: {first_status} and {second_status}"
        );
        assert!(
            first_status == 200 || second_status == 200,
            "round {round}: one removal lands"
        );
    }
    Ok(())
}
