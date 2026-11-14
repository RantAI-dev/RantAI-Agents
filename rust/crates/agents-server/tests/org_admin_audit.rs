//! The audit rows of `/api/organizations/**`: written in the same transaction as the change they
//! record, and listed newest first whichever side wrote them.
//!
//! Set `TEST_DATABASE_URL` to a migrated database; without it each test skips (and fails in CI).

mod common;
mod org_admin_fixtures;

use common::{R, bearer, code, router, send};
use org_admin_fixtures::{
    list, member, member_id, org, role_of, text, unit, unit_member, wait_until_blocked_by,
};
use serde_json::json;

/// Whether `user` is directly in `unit`.
async fn in_unit(
    db: &agents_store::PgPool,
    unit_id: &str,
    user: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "OrgUnitMember" WHERE "unitId" = $1 AND "userId" = $2)"#,
    )
    .bind(unit_id)
    .bind(user)
    .fetch_one(db)
    .await
}

/// The test holds the organisation row, which every `AuditLog` insert must share-lock for its
/// foreign key, so each request parks at its audit write. While it is parked, the change must
/// not be visible yet: a change committed before its audit row would be kept by a request whose
/// audit write then fails.
#[tokio::test]
async fn a_change_is_not_visible_before_its_audit_row() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    for case in ["role", "remove", "unit_member"] {
        let o = org(&db).await?;
        let owner = common::user(&db, false).await?;
        let x = common::user(&db, false).await?;
        member(&db, &owner, &o, "owner").await?;
        member(&db, &x, &o, "member").await?;
        let mx = member_id(&db, &o, &x).await?;
        let u = unit(&db, &o, None, "eng").await?;
        unit_member(&db, &o, &u, &x, false).await?;
        let (method, uri, body) = match case {
            "role" => (
                "PATCH",
                format!("/api/organizations/{o}/members/{mx}"),
                Some(json!({ "role": "viewer" })),
            ),
            "remove" => (
                "DELETE",
                format!("/api/organizations/{o}/members/{mx}"),
                None,
            ),
            _ => (
                "DELETE",
                format!("/api/organizations/{o}/units/{u}/members"),
                Some(json!({ "userId": x })),
            ),
        };
        let unchanged = async |db: &agents_store::PgPool| -> Result<bool, sqlx::Error> {
            Ok(match case {
                "role" => role_of(db, &mx).await?.as_deref() == Some("member"),
                "remove" => role_of(db, &mx).await?.is_some(),
                _ => in_unit(db, &u, &x).await?,
            })
        };

        let mut hold = db.begin().await?;
        let pid = sqlx::query_scalar::<_, i32>("SELECT pg_backend_pid()")
            .fetch_one(&mut *hold)
            .await?;
        sqlx::query(r#"SELECT 1 FROM "Organization" WHERE "id" = $1 FOR UPDATE"#)
            .bind(&o)
            .execute(&mut *hold)
            .await?;
        let token = bearer(&owner)?;
        let (answer, while_parked) = tokio::join!(
            send(&app, method, &uri, Some(token.as_str()), body),
            async {
                wait_until_blocked_by(&db, pid).await?;
                let seen = unchanged(&db).await?;
                hold.commit().await?;
                Ok::<bool, sqlx::Error>(seen)
            }
        );
        assert!(
            while_parked?,
            "{case}: the change was visible while its audit row was still waiting"
        );
        let (status, answer) = answer?;
        assert_eq!(status, 200, "{case}: {answer}");
        assert!(
            !unchanged(&db).await?,
            "{case}: the change landed afterwards"
        );
        let rows = sqlx::query_scalar::<_, i64>(
            r#"SELECT count(*) FROM "AuditLog" WHERE "organizationId" = $1"#,
        )
        .bind(&o)
        .fetch_one(&db)
        .await?;
        assert_eq!(rows, 1, "{case}: one audit row");
    }
    Ok(())
}

/// The TypeScript writes `AuditLog` rows too, with cuid ids that sort after every UUIDv7. The
/// list is newest first by time, not by the id's spelling.
#[tokio::test]
async fn the_audit_list_is_newest_first_whoever_wrote_the_row() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = common::user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    let old = format!("c{}", agents_store::new_id());
    sqlx::query(
        r#"INSERT INTO "AuditLog" ("id","organizationId","action","resource","createdAt")
           VALUES ($1,$2,'tool.execute','tool:x', now() - interval '1 hour')"#,
    )
    .bind(&old)
    .bind(&o)
    .execute(&db)
    .await?;
    let token = bearer(&owner)?;
    for name in ["One", "Two"] {
        let (status, body) = send(
            &app,
            "PATCH",
            &format!("/api/organizations/{o}"),
            Some(token.as_str()),
            Some(json!({ "name": name })),
        )
        .await?;
        assert_eq!(status, 200, "{body}");
    }
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/organizations/{o}/audit"),
        Some(token.as_str()),
        None,
    )
    .await?;
    assert_eq!(status, 200, "{body}");
    let names: Vec<String> = list(&body, "/data")
        .iter()
        .map(|r| format!("{}:{}", text(r, "/action"), text(r, "/detail/name")))
        .collect();
    assert_eq!(
        names,
        ["org.update:Two", "org.update:One", "tool.execute:"],
        "{body}"
    );

    // Paged one at a time, the same order and nothing twice.
    let mut seen = Vec::new();
    let mut cursor = String::new();
    loop {
        let uri = if cursor.is_empty() {
            format!("/api/organizations/{o}/audit?limit=1")
        } else {
            format!("/api/organizations/{o}/audit?limit=1&cursor={cursor}")
        };
        let (status, page) = send(&app, "GET", &uri, Some(token.as_str()), None).await?;
        assert_eq!(status, 200, "{page}");
        seen.extend(list(&page, "/data").iter().map(|r| text(r, "/id")));
        cursor = text(&page, "/nextCursor");
        if cursor.is_empty() || seen.len() > 3 {
            break;
        }
    }
    assert_eq!(seen.len(), 3, "{seen:?}");
    assert_eq!(seen.last(), Some(&old));

    // A cursor this server did not issue is a 400, not a guess.
    let (status, body) = send(
        &app,
        "GET",
        &format!("/api/organizations/{o}/audit?cursor=not-a-cursor"),
        Some(token.as_str()),
        None,
    )
    .await?;
    assert_eq!(status, 400, "{body}");
    assert_eq!(code(&body), Some("invalid_request"));
    Ok(())
}
