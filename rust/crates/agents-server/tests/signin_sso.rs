//! OIDC sign-in end to end against a stub provider: the happy path, every refusal next to its
//! positive control, the replay guard, the email-link rule, JIT and group sync.

#[allow(dead_code, reason = "this file uses only part of the shared helpers")]
mod signin_kit;

use agents_store::new_id;
use serde_json::{Value, json};
use signin_kit::{
    CLIENT_ID, R, Signing, StubIdp, call, callback, domain, member, org, pool, provider, router,
    router_with_env, session_cookie, sign_in, start, user_with,
};

/// The value at a JSON Pointer, or `null`: tests compare it without indexing.
fn at(v: &Value, pointer: &str) -> Value {
    v.pointer(pointer).cloned().unwrap_or(Value::Null)
}

fn error_of(reply: &signin_kit::Reply) -> Option<String> {
    let location = reply.location.as_deref()?;
    let url = reqwest::Url::parse(location).ok()?;
    url.query_pairs()
        .find(|(k, _)| k == "error")
        .map(|(_, v)| v.into_owned())
}

fn with(mut claims: Value, field: &str, value: Value) -> Value {
    if let Some(m) = claims.as_object_mut() {
        m.insert(field.to_owned(), value);
    }
    claims
}

#[tokio::test]
async fn a_new_user_signs_in_and_the_session_works_on_a_rust_route() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let app = router(&db, false);
    let org_id = org(&db, true).await?;
    let d = domain();
    let pid = provider(
        &db,
        &org_id,
        &stub,
        std::slice::from_ref(&d),
        true,
        json!({}),
    )
    .await?;
    let email = format!("new@{d}");

    let started = start(&app, &pid).await?;
    assert_eq!(
        started.redirect_uri,
        format!("http://app.test/api/auth/sso/{pid}/callback")
    );
    let code = new_id();
    stub.grant(
        &code,
        stub.claims("sub-new", &email, &started.nonce),
        &started.challenge,
        Signing::Good,
    );
    let reply = callback(&app, &pid, &code, &started.state, &started.cookie).await?;
    assert_eq!(reply.status, 303, "{reply:?}");
    assert_eq!(reply.location.as_deref(), Some("http://app.test/dashboard"));
    let session = session_cookie(&reply, false).ok_or("no session cookie")?;
    // The flow cookie is cleared.
    assert!(
        reply
            .set_cookies
            .iter()
            .any(|c| c.starts_with("rantai.sso-flow=;") && c.contains("Max-Age=0"))
    );

    let me = call(
        &app,
        "GET",
        "/api/dashboard/memory",
        &[("cookie", &session)],
        None,
    )
    .await?;
    assert_eq!(me.status, 200, "{me:?}");
    // Without the cookie the same route refuses: the 200 is the session's doing.
    let anon = call(&app, "GET", "/api/dashboard/memory", &[], None).await?;
    assert_eq!(anon.status, 401);

    let (user_id, hash, role): (String, Option<String>, String) = sqlx::query_as(
        r#"SELECT u."id", u."passwordHash", m."role" FROM "Agent" u
           JOIN "OrganizationMember" m ON m."userId" = u."id" AND m."organizationId" = $2
           WHERE u."email" = $1"#,
    )
    .bind(&email)
    .bind(&org_id)
    .fetch_one(&db)
    .await?;
    assert_eq!((hash, role.as_str()), (None, "member"));
    let (last_login, audits): (Option<chrono::NaiveDateTime>, i64) = sqlx::query_as(
        r#"SELECT (SELECT "lastLoginAt" FROM "UserIdentity" WHERE "providerId" = $1 AND "subject" = 'sub-new'),
                  (SELECT count(*) FROM "AuditLog" WHERE "organizationId" = $2 AND "action" = 'sso.login' AND "userId" = $3)"#,
    )
    .bind(&pid)
    .bind(&org_id)
    .bind(&user_id)
    .fetch_one(&db)
    .await?;
    assert!(last_login.is_some());
    assert_eq!(audits, 1);
    Ok(())
}

#[tokio::test]
async fn each_bad_token_is_refused_next_to_a_good_one() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let app = router(&db, false);
    let org_id = org(&db, true).await?;
    let d = domain();
    let pid = provider(
        &db,
        &org_id,
        &stub,
        std::slice::from_ref(&d),
        true,
        json!({}),
    )
    .await?;
    let now = chrono::Utc::now().timestamp();

    type Claims<'a> = Box<dyn Fn(&str, &str) -> Value + 'a>;
    let cases: Vec<(&str, Claims<'_>, Signing)> = vec![
        (
            "bad signature",
            Box::new(|n: &str, e: &str| stub.claims("s-sig", e, n)),
            Signing::OtherKey,
        ),
        (
            "alg none",
            Box::new(|n: &str, e: &str| stub.claims("s-none", e, n)),
            Signing::AlgNone,
        ),
        (
            "wrong issuer",
            Box::new(|n: &str, e: &str| {
                with(
                    stub.claims("s-iss", e, n),
                    "iss",
                    json!("http://evil.test/realms/acme"),
                )
            }),
            Signing::Good,
        ),
        (
            "wrong audience",
            Box::new(|n: &str, e: &str| {
                with(stub.claims("s-aud", e, n), "aud", json!("someone-else"))
            }),
            Signing::Good,
        ),
        (
            "expired",
            Box::new(|n: &str, e: &str| with(stub.claims("s-exp", e, n), "exp", json!(now - 3600))),
            Signing::Good,
        ),
        (
            "wrong nonce",
            Box::new(|_n: &str, e: &str| stub.claims("s-nonce", e, "not-the-nonce")),
            Signing::Good,
        ),
    ];
    for (name, claims, signing) in cases {
        let email = format!("{}@{d}", new_id());
        let reply = sign_in(&app, &stub, &pid, |n| claims(n, &email), signing).await?;
        assert_eq!(
            error_of(&reply).as_deref(),
            Some("sso_failed"),
            "{name}: {reply:?}"
        );
        assert!(session_cookie(&reply, false).is_none(), "{name}");
    }
    // The positive control: the same provider and flow with a good token signs in.
    let email = format!("{}@{d}", new_id());
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("s-good", &email, n),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some(), "{reply:?}");
    Ok(())
}

#[tokio::test]
async fn a_replayed_callback_is_refused_and_a_tampered_state_too() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let app = router(&db, false);
    let org_id = org(&db, true).await?;
    let d = domain();
    let pid = provider(
        &db,
        &org_id,
        &stub,
        std::slice::from_ref(&d),
        true,
        json!({}),
    )
    .await?;
    let email = format!("replay@{d}");

    let started = start(&app, &pid).await?;
    let code = new_id();
    stub.grant(
        &code,
        stub.claims("sub-replay", &email, &started.nonce),
        &started.challenge,
        Signing::Good,
    );
    let first = callback(&app, &pid, &code, &started.state, &started.cookie).await?;
    assert!(session_cookie(&first, false).is_some(), "{first:?}");
    // The same callback again, cookie and all: the IdP (this stub) would trade the code again,
    // so only our guard stands in the way.
    let again = callback(&app, &pid, &code, &started.state, &started.cookie).await?;
    assert_eq!(error_of(&again).as_deref(), Some("sso_failed"), "{again:?}");
    assert!(session_cookie(&again, false).is_none());

    // Two replays at once: still none gets through.
    let started = start(&app, &pid).await?;
    let code = new_id();
    stub.grant(
        &code,
        stub.claims("sub-replay", &email, &started.nonce),
        &started.challenge,
        Signing::Good,
    );
    let replies = futures::future::join_all(
        (0..6).map(|_| callback(&app, &pid, &code, &started.state, &started.cookie)),
    )
    .await;
    let signed_in = replies
        .iter()
        .filter(|r| r.as_ref().is_ok_and(|r| session_cookie(r, false).is_some()))
        .count();
    assert_eq!(signed_in, 1);

    // A state that is not the flow's, and a flow cookie for another provider, are refused.
    let started = start(&app, &pid).await?;
    let code = new_id();
    stub.grant(
        &code,
        stub.claims("sub-replay", &email, &started.nonce),
        &started.challenge,
        Signing::Good,
    );
    let wrong_state = callback(&app, &pid, &code, "forged", &started.cookie).await?;
    assert_eq!(error_of(&wrong_state).as_deref(), Some("sso_failed"));
    let no_cookie = callback(&app, &pid, &code, &started.state, "x=y").await?;
    assert_eq!(error_of(&no_cookie).as_deref(), Some("sso_failed"));
    Ok(())
}

#[tokio::test]
async fn an_existing_account_is_linked_only_by_a_verified_email_of_a_claimed_domain() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let app = router(&db, false);
    let org_id = org(&db, true).await?;
    let d = domain();
    let pid = provider(
        &db,
        &org_id,
        &stub,
        std::slice::from_ref(&d),
        true,
        json!({}),
    )
    .await?;

    // Unverified email: refused, and the account is not linked.
    let victim = format!("victim@{d}");
    let victim_id = user_with(&db, &victim, true, false).await?;
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| {
            with(
                stub.claims("attacker-1", &victim, n),
                "email_verified",
                json!(false),
            )
        },
        Signing::Good,
    )
    .await?;
    assert_eq!(
        error_of(&reply).as_deref(),
        Some("account_link_refused"),
        "{reply:?}"
    );

    // A domain the provider does not claim: refused.
    let foreign = format!("someone@{}", domain());
    user_with(&db, &foreign, true, false).await?;
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("attacker-2", &foreign, n),
        Signing::Good,
    )
    .await?;
    assert_eq!(error_of(&reply).as_deref(), Some("account_link_refused"));

    // A member of another organisation: this provider cannot take the account over.
    let elsewhere = format!("elsewhere@{d}");
    let elsewhere_id = user_with(&db, &elsewhere, true, false).await?;
    member(&db, &org(&db, true).await?, &elsewhere_id, "owner").await?;
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("attacker-3", &elsewhere, n),
        Signing::Good,
    )
    .await?;
    assert_eq!(error_of(&reply).as_deref(), Some("account_link_refused"));

    // A platform admin is never linked automatically.
    let admin = format!("root@{d}");
    user_with(&db, &admin, true, true).await?;
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("attacker-4", &admin, n),
        Signing::Good,
    )
    .await?;
    assert_eq!(error_of(&reply).as_deref(), Some("account_link_refused"));

    let links: i64 =
        sqlx::query_scalar(r#"SELECT count(*) FROM "UserIdentity" WHERE "providerId" = $1"#)
            .bind(&pid)
            .fetch_one(&db)
            .await?;
    assert_eq!(links, 0);

    // Positive control: verified, claimed domain, not elsewhere: linked to the same user.
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("victim-real", &victim, n),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some(), "{reply:?}");
    let linked: String = sqlx::query_scalar(r#"SELECT "userId" FROM "UserIdentity" WHERE "providerId" = $1 AND "subject" = 'victim-real'"#)
        .bind(&pid)
        .fetch_one(&db)
        .await?;
    assert_eq!(linked, victim_id);
    // From now on the subject finds the user, whatever email the token carries.
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("victim-real", &format!("renamed@{d}"), n),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some());
    Ok(())
}

#[tokio::test]
async fn without_jit_an_unknown_user_is_refused() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let app = router(&db, false);
    let org_id = org(&db, true).await?;
    let d = domain();
    let pid = provider(
        &db,
        &org_id,
        &stub,
        std::slice::from_ref(&d),
        false,
        json!({}),
    )
    .await?;
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("nobody", &format!("nobody@{d}"), n),
        Signing::Good,
    )
    .await?;
    assert_eq!(error_of(&reply).as_deref(), Some("account_not_provisioned"));
    // Positive control: an invited user (pending membership) is let in and the invite accepted.
    let invited = format!("invited@{d}");
    let uid = user_with(&db, &invited, false, false).await?;
    sqlx::query(r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role") VALUES ($1,$2,$3,$4,'viewer')"#)
        .bind(new_id())
        .bind(&uid)
        .bind(&invited)
        .bind(&org_id)
        .execute(&db)
        .await?;
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("invited", &invited, n),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some(), "{reply:?}");
    Ok(())
}

async fn unit(db: &agents_store::PgPool, org: &str, external: &str) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "OrgUnit" ("id","organizationId","kind","name","slug","externalId","createdAt","updatedAt")
           VALUES ($1,$2,'team',$1,$1,$3,now(),now())"#,
    )
    .bind(&id)
    .bind(org)
    .bind(external)
    .execute(db)
    .await?;
    Ok(id)
}

#[tokio::test]
async fn group_sync_adds_and_removes_only_idp_memberships() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let app = router(&db, false);
    let org_id = org(&db, true).await?;
    let d = domain();
    let pid = provider(
        &db,
        &org_id,
        &stub,
        std::slice::from_ref(&d),
        true,
        json!({ "roleMapping": { "it": "admin" } }),
    )
    .await?;
    let eng = unit(&db, &org_id, "eng").await?;
    let ops = unit(&db, &org_id, "ops").await?;
    let manual = unit(&db, &org_id, "sales").await?;
    let email = format!("grouped@{d}");
    let groups = |g: Value| {
        let (s, e) = (stub.clone(), email.clone());
        move |n: &str| with(s.claims("grouped", &e, n), "groups", g)
    };

    let reply = sign_in(
        &app,
        &stub,
        &pid,
        groups(json!(["eng", "ops", "unknown"])),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some(), "{reply:?}");
    let user_id: String = sqlx::query_scalar(r#"SELECT "id" FROM "Agent" WHERE "email" = $1"#)
        .bind(&email)
        .fetch_one(&db)
        .await?;
    // A manual membership the admin made, in a unit the IdP also names on the next login.
    sqlx::query(r#"INSERT INTO "OrgUnitMember" ("organizationId","unitId","userId","source","updatedAt") VALUES ($1,$2,$3,'manual',now())"#)
        .bind(&org_id)
        .bind(&manual)
        .bind(&user_id)
        .execute(&db)
        .await?;
    let rows = || async {
        sqlx::query_as::<_, (String, String)>(
            r#"SELECT "unitId","source" FROM "OrgUnitMember" WHERE "userId" = $1 ORDER BY "unitId""#,
        )
        .bind(&user_id)
        .fetch_all(&db)
        .await
    };
    let mut expected = vec![
        (eng.clone(), "idp".to_owned()),
        (ops.clone(), "idp".to_owned()),
        (manual.clone(), "manual".to_owned()),
    ];
    expected.sort();
    assert_eq!(rows().await?, expected);

    // Next login: ops dropped, sales added in the IdP; the manual sales row stays manual.
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        groups(json!(["eng", "sales", "it"])),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some());
    let mut expected = vec![
        (eng.clone(), "idp".to_owned()),
        (manual.clone(), "manual".to_owned()),
    ];
    expected.sort();
    assert_eq!(rows().await?, expected);
    let role: String = sqlx::query_scalar(
        r#"SELECT "role" FROM "OrganizationMember" WHERE "userId" = $1 AND "organizationId" = $2"#,
    )
    .bind(&user_id)
    .bind(&org_id)
    .fetch_one(&db)
    .await?;
    assert_eq!(role, "admin");

    // No groups claim at all: the idp rows are left as they are.
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("grouped", &email, n),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some());
    assert_eq!(rows().await?, expected);
    // An empty list removes every idp row and no manual one.
    let reply = sign_in(&app, &stub, &pid, groups(json!([])), Signing::Good).await?;
    assert!(session_cookie(&reply, false).is_some());
    assert_eq!(rows().await?, vec![(manual, "manual".to_owned())]);
    Ok(())
}

#[tokio::test]
async fn a_rotated_key_is_fetched_and_discover_finds_the_provider() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let app = router(&db, false);
    let org_id = org(&db, true).await?;
    let d = domain();
    let pid = provider(
        &db,
        &org_id,
        &stub,
        std::slice::from_ref(&d),
        true,
        json!({}),
    )
    .await?;
    let email = format!("rot@{d}");
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("rot", &email, n),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some());
    stub.rotate();
    let reply = sign_in(
        &app,
        &stub,
        &pid,
        |n| stub.claims("rot", &email, n),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some(), "{reply:?}");

    let found = call(
        &app,
        "GET",
        &format!("/api/auth/sso/discover?email=a@{}", d.to_uppercase()),
        &[],
        None,
    )
    .await?;
    assert_eq!(at(&found.body, "/method"), "sso");
    assert_eq!(at(&found.body, "/providerId"), json!(pid));
    let none = call(
        &app,
        "GET",
        &format!("/api/auth/sso/discover?email=a@{}", domain()),
        &[],
        None,
    )
    .await?;
    assert_eq!(at(&none.body, "/method"), "password");
    let bad = call(&app, "GET", "/api/auth/sso/discover?email=nope", &[], None).await?;
    assert_eq!((bad.status, bad.code()), (400, Some("invalid_request")));
    let missing = call(&app, "GET", "/api/auth/sso/not-a-provider/start", &[], None).await?;
    assert_eq!((missing.status, missing.code()), (404, Some("not_found")));
    assert!(stub.token_calls() >= 2);
    Ok(())
}

#[tokio::test]
async fn the_environment_provider_signs_in_until_the_org_has_its_own() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let org_id = org(&db, true).await?;
    let d = domain();
    let vars = [
        ("AUTH_OIDC_PRESET", "keycloak".to_owned()),
        ("AUTH_OIDC_ISSUER", stub.issuer.clone()),
        ("AUTH_OIDC_CLIENT_ID", CLIENT_ID.to_owned()),
        ("AUTH_OIDC_ORG_ID", org_id.clone()),
        ("AUTH_OIDC_EMAIL_DOMAINS", d.clone()),
        ("AUTH_OIDC_JIT", "true".to_owned()),
    ];
    let env = agents_server::sso::env::from_vars(|name| {
        vars.iter()
            .find(|(k, _)| *k == name)
            .map(|(_, v)| v.clone())
    })?;
    let app = router_with_env(&db, false, env);
    let found = call(
        &app,
        "GET",
        &format!("/api/auth/sso/discover?email=a@{d}"),
        &[],
        None,
    )
    .await?;
    assert_eq!(at(&found.body, "/providerId"), "env-oidc");
    let email = format!("env@{d}");
    let reply = sign_in(
        &app,
        &stub,
        "env-oidc",
        |n| stub.claims("env-sub", &email, n),
        Signing::Good,
    )
    .await?;
    assert!(session_cookie(&reply, false).is_some(), "{reply:?}");

    // The organisation configures its own provider: the environment's steps aside.
    provider(&db, &org_id, &stub, &[], true, json!({})).await?;
    let gone = call(&app, "GET", "/api/auth/sso/env-oidc/start", &[], None).await?;
    assert_eq!(gone.status, 404);
    sqlx::query(r#"DELETE FROM "IdentityProvider" WHERE "id" = 'env-oidc'"#)
        .execute(&db)
        .await?;
    Ok(())
}
