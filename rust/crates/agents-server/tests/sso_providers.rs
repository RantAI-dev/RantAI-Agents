//! The identity-provider admin API: `org.sso.manage` only, 404 across organisations, the secret
//! encrypted at rest and never returned.

#[allow(dead_code, reason = "this file uses only part of the shared helpers")]
mod signin_kit;

use serde_json::{Value, json};
use signin_kit::{R, Res, SECRET, StubIdp, call, domain, member, org, pool, router, user_with};

/// The value at a JSON Pointer, or `null`: tests compare it without indexing.
fn at(v: &Value, pointer: &str) -> Value {
    v.pointer(pointer).cloned().unwrap_or(Value::Null)
}

fn bearer(user_id: &str) -> Res<String> {
    let token = agents_auth::mobile::sign_mobile_token(
        user_id,
        "x@test.invalid",
        None,
        SECRET,
        chrono::Utc::now().timestamp(),
    )?;
    Ok(format!("Bearer {token}"))
}

async fn person(db: &agents_store::PgPool, org: &str, role: &str) -> Res<String> {
    let id = user_with(
        db,
        &format!("{}@{}", agents_store::new_id(), domain()),
        true,
        false,
    )
    .await?;
    member(db, org, &id, role).await?;
    Ok(id)
}

const PATH: &str = "/api/dashboard/sso/providers";

#[tokio::test]
async fn an_admin_manages_providers_and_the_secret_never_comes_back() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let app = router(&db, false);
    let stub = StubIdp::start().await?;
    let org_a = org(&db, true).await?;
    let admin = bearer(&person(&db, &org_a, "admin").await?)?;
    let d = domain();
    let secret = format!("very-secret-{}", agents_store::new_id());
    let body = json!({
        "name": "Acme Keycloak", "preset": "keycloak", "issuer": stub.issuer, "clientId": "rantai-test",
        "clientSecret": secret, "emailDomains": [d.to_uppercase()], "isJitEnabled": true,
        "groupsClaim": "groups", "roleMapping": { "it": "admin" }
    });
    let created = call(&app, "POST", PATH, &[("authorization", &admin)], Some(body)).await?;
    assert_eq!(created.status, 201, "{created:?}");
    let id = at(&created.body, "/id").as_str().ok_or("no id")?.to_owned();
    assert_eq!(at(&created.body, "/hasClientSecret"), true);
    assert_eq!(at(&created.body, "/emailDomains"), json!([d]));
    assert_eq!(
        at(&created.body, "/callbackUrl"),
        json!(format!("http://app.test/api/auth/sso/{id}/callback"))
    );
    assert!(!created.body.to_string().contains(&secret));
    let stored: Value =
        sqlx::query_scalar(r#"SELECT "config" FROM "IdentityProvider" WHERE "id" = $1"#)
            .bind(&id)
            .fetch_one(&db)
            .await?;
    assert!(
        !stored.to_string().contains(&secret),
        "the secret is stored in clear"
    );
    assert!(at(&stored, "/clientSecretEncrypted").is_string());

    let listed = call(&app, "GET", PATH, &[("authorization", &admin)], None).await?;
    assert_eq!(listed.status, 200);
    assert!(at(&listed.body, "/nextCursor").is_null());
    assert_eq!(at(&listed.body, "/data").as_array().map(Vec::len), Some(1));
    assert!(!listed.body.to_string().contains(&secret));

    let one = format!("{PATH}/{id}");
    let renamed = call(
        &app,
        "PATCH",
        &one,
        &[("authorization", &admin)],
        Some(json!({ "name": "Renamed" })),
    )
    .await?;
    assert_eq!(
        (
            renamed.status,
            at(&renamed.body, "/hasClientSecret").as_bool()
        ),
        (200, Some(true))
    );
    let cleared = call(
        &app,
        "PATCH",
        &one,
        &[("authorization", &admin)],
        Some(json!({ "clientSecret": null })),
    )
    .await?;
    assert_eq!(at(&cleared.body, "/hasClientSecret"), false);

    let tested = call(
        &app,
        "POST",
        &format!("{one}/test"),
        &[("authorization", &admin)],
        None,
    )
    .await?;
    assert_eq!(tested.status, 200, "{tested:?}");
    assert_eq!(at(&tested.body, "/keyCount"), 1);

    let deleted = call(&app, "DELETE", &one, &[("authorization", &admin)], None).await?;
    assert_eq!(deleted.status, 204);
    assert_eq!(
        call(&app, "GET", &one, &[("authorization", &admin)], None)
            .await?
            .status,
        404
    );
    let audits: i64 = sqlx::query_scalar(
        r#"SELECT count(*) FROM "AuditLog" WHERE "organizationId" = $1 AND "resource" = $2"#,
    )
    .bind(&org_a)
    .bind(format!("identity_provider:{id}"))
    .fetch_one(&db)
    .await?;
    assert_eq!(audits, 4);
    Ok(())
}

#[tokio::test]
async fn another_org_gets_404_and_a_member_gets_403() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let app = router(&db, false);
    let org_a = org(&db, true).await?;
    let org_b = org(&db, true).await?;
    let owner_a = bearer(&person(&db, &org_a, "owner").await?)?;
    let member_a = bearer(&person(&db, &org_a, "member").await?)?;
    let admin_b = bearer(&person(&db, &org_b, "admin").await?)?;
    let created = call(
        &app,
        "POST",
        PATH,
        &[("authorization", &owner_a)],
        Some(json!({
            "name": "A", "preset": "google", "clientId": "c", "hostedDomain": "a.test"
        })),
    )
    .await?;
    assert_eq!(created.status, 201, "{created:?}");
    let one = format!(
        "{PATH}/{}",
        at(&created.body, "/id").as_str().ok_or("no id")?
    );

    for (method, uri, body) in [
        ("GET", one.clone(), None),
        ("PATCH", one.clone(), Some(json!({ "name": "x" }))),
        ("DELETE", one.clone(), None),
        ("POST", format!("{one}/test"), None),
    ] {
        let other = call(
            &app,
            method,
            &uri,
            &[("authorization", &admin_b)],
            body.clone(),
        )
        .await?;
        assert_eq!(
            (other.status, other.code()),
            (404, Some("not_found")),
            "{method} {uri}"
        );
        let member = call(&app, method, &uri, &[("authorization", &member_a)], body).await?;
        assert_eq!(
            (member.status, member.code()),
            (403, Some("permission_denied")),
            "{method} {uri}"
        );
    }
    let listed_by_b = call(&app, "GET", PATH, &[("authorization", &admin_b)], None).await?;
    assert_eq!(at(&listed_by_b.body, "/data"), json!([]));
    assert_eq!(
        call(&app, "GET", PATH, &[("authorization", &member_a)], None)
            .await?
            .status,
        403
    );
    assert_eq!(
        call(
            &app,
            "POST",
            PATH,
            &[("authorization", &member_a)],
            Some(json!({}))
        )
        .await?
        .status,
        403
    );
    assert_eq!(call(&app, "GET", PATH, &[], None).await?.status, 401);
    // Positive control: the owner reads it.
    assert_eq!(
        call(&app, "GET", &one, &[("authorization", &owner_a)], None)
            .await?
            .status,
        200
    );
    Ok(())
}

#[tokio::test]
async fn bad_settings_and_a_domain_of_another_org_are_refused() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let app = router(&db, false);
    let admin_a = bearer(&person(&db, &org(&db, true).await?, "admin").await?)?;
    let admin_b = bearer(&person(&db, &org(&db, true).await?, "admin").await?)?;

    let bad = call(
        &app,
        "POST",
        PATH,
        &[("authorization", &admin_a)],
        Some(json!({
            "name": "", "preset": "entra", "tenantId": "common", "clientId": "c",
            "emailDomains": ["not a domain"], "defaultRole": "owner"
        })),
    )
    .await?;
    assert_eq!((bad.status, bad.code()), (400, Some("invalid_request")));
    let errors = at(&bad.body, "/error/errors");
    let fields: Vec<&str> = errors
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| e.get("field").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    for f in ["/name", "/tenantId", "/emailDomains", "/defaultRole"] {
        assert!(fields.contains(&f), "{f} missing from {fields:?}");
    }
    let unknown = call(
        &app,
        "POST",
        PATH,
        &[("authorization", &admin_a)],
        Some(json!({ "surprise": 1 })),
    )
    .await?;
    assert_eq!(unknown.status, 400);

    let d = domain();
    let entra = json!({
        "name": "E", "preset": "entra", "tenantId": "72f988bf-86f1-41af-91ab-2d7cd011db47",
        "clientId": "c", "emailDomains": [d]
    });
    let first = call(
        &app,
        "POST",
        PATH,
        &[("authorization", &admin_a)],
        Some(entra.clone()),
    )
    .await?;
    assert_eq!(first.status, 201, "{first:?}");
    assert_eq!(
        at(&first.body, "/issuer"),
        "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0"
    );
    let taken = call(
        &app,
        "POST",
        PATH,
        &[("authorization", &admin_b)],
        Some(entra.clone()),
    )
    .await?;
    assert_eq!((taken.status, taken.code()), (409, Some("conflict")));
    // The same org may have a second provider for its own domain.
    let again = call(
        &app,
        "POST",
        PATH,
        &[("authorization", &admin_a)],
        Some(entra),
    )
    .await?;
    assert_eq!(again.status, 201);
    Ok(())
}
