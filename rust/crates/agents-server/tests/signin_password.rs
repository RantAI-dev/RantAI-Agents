//! Password sign-in, sign-out and the mobile sign-in against a migrated database, the throttle,
//! `passwordLoginEnabled`, and the issued cookie decoded by the real Auth.js code (a bun script).

#[allow(dead_code, reason = "this file uses only part of the shared helpers")]
mod signin_kit;

use agents_store::new_id;
use serde_json::{Value, json};
use signin_kit::{
    PASSWORD, R, Reply, Res, SECRET, call, domain, member, org, pool, router, session_cookie,
    user_with,
};

/// The value at a JSON Pointer, or `null`: tests compare it without indexing.
fn at(v: &Value, pointer: &str) -> Value {
    v.pointer(pointer).cloned().unwrap_or(Value::Null)
}

async fn login(app: &axum::Router, email: &str, password: &str) -> Res<Reply> {
    call(
        app,
        "POST",
        "/api/auth/login",
        &[],
        Some(json!({ "email": email, "password": password })),
    )
    .await
}

fn new_email() -> String {
    format!("pw-{}@{}", new_id(), domain())
}

/// Runs `tests/nextauth/decode.mjs` with bun over the cookie header. `None` when bun or the
/// Node modules are missing outside CI; in CI that is a failure, so the check cannot vanish.
fn nextauth_decode(cookie_header: &str, secure: bool) -> Res<Option<Value>> {
    let script = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/nextauth/decode.mjs");
    let out = std::process::Command::new("bun")
        .arg(script)
        .env("COOKIE", cookie_header)
        .env("SECRET", SECRET)
        .env("SECURE", if secure { "true" } else { "false" })
        .output();
    let out = match out {
        Ok(o) => o,
        Err(e) if std::env::var_os("CI").is_none() => {
            eprintln!("skipped the Auth.js decode: bun is not runnable ({e})");
            return Ok(None);
        }
        Err(e) => return Err(format!("bun is required in CI: {e}").into()),
    };
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        if stderr.contains("Cannot find") && std::env::var_os("CI").is_none() {
            eprintln!("skipped the Auth.js decode: run `bun install` first");
            return Ok(None);
        }
        return Err(format!("decode.mjs failed: {stderr}").into());
    }
    Ok(Some(serde_json::from_slice(&out.stdout)?))
}

#[tokio::test]
async fn a_password_login_issues_a_cookie_rust_and_nextauth_both_accept() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    for secure in [false, true] {
        let app = router(&db, secure);
        let email = new_email();
        let user_id = user_with(&db, &email, true, false).await?;
        let reply = login(&app, &email, PASSWORD).await?;
        assert_eq!(reply.status, 200, "{reply:?}");
        assert_eq!(at(&reply.body, "/user/id"), json!(user_id));
        assert_eq!(at(&reply.body, "/redirectTo"), "/dashboard");
        let cookie = session_cookie(&reply, secure).ok_or("no session cookie")?;
        let set = reply.set_cookies.first().ok_or("no Set-Cookie")?;
        assert!(set.contains("; Path=/; Expires=") && set.contains("; HttpOnly"));
        assert!(set.ends_with("; SameSite=Lax"));
        assert_eq!(set.contains("; Secure"), secure);

        // Rust: the cookie is a session on an existing route.
        let me = call(
            &app,
            "GET",
            "/api/dashboard/memory",
            &[("cookie", &cookie)],
            None,
        )
        .await?;
        assert_eq!(me.status, 200, "{me:?}");

        // Auth.js: `decode` and `getToken` read the same claims.
        if let Some(out) = nextauth_decode(&cookie, secure)? {
            for which in ["decoded", "fromRequest"] {
                let claims = at(&out, &format!("/{which}"));
                assert_eq!(at(&claims, "/id"), json!(user_id), "{which}: {out}");
                assert_eq!(at(&claims, "/sub"), json!(user_id));
                assert_eq!(at(&claims, "/email"), json!(email));
                assert_eq!(at(&claims, "/role"), "USER");
                assert_eq!(at(&claims, "/name"), "Signin User");
                let (iat, exp) = (at(&claims, "/iat").as_i64(), at(&claims, "/exp").as_i64());
                assert_eq!(exp.zip(iat).map(|(e, i)| e - i), Some(30 * 24 * 60 * 60));
                assert!(at(&claims, "/jti").as_str().is_some_and(|j| j.len() == 36));
            }
            // A cookie under the other name (the other salt) is not a session to Auth.js.
            let renamed = if secure {
                cookie.replacen("__Secure-", "", 1)
            } else {
                format!("__Secure-{cookie}")
            };
            let out = nextauth_decode(&renamed, !secure)?.ok_or("bun vanished")?;
            assert!(
                at(&out, "/fromRequest").is_null() && at(&out, "/decoded").is_null(),
                "{out}"
            );
        }
    }
    Ok(())
}

#[tokio::test]
async fn a_wrong_password_an_unknown_email_and_a_password_less_account_look_the_same() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let app = router(&db, false);
    let with_password = new_email();
    user_with(&db, &with_password, true, false).await?;
    let sso_only = new_email();
    user_with(&db, &sso_only, false, false).await?;

    let wrong = login(&app, &with_password, "wrong").await?;
    let unknown = login(&app, &new_email(), PASSWORD).await?;
    let no_hash = login(&app, &sso_only, PASSWORD).await?;
    for r in [&wrong, &unknown, &no_hash] {
        assert_eq!(
            (r.status, r.code()),
            (401, Some("unauthenticated")),
            "{r:?}"
        );
        assert!(r.set_cookies.is_empty());
    }
    assert_eq!(
        at(&wrong.body, "/error/message"),
        at(&unknown.body, "/error/message")
    );
    assert_eq!(
        at(&wrong.body, "/error/message"),
        at(&no_hash.body, "/error/message")
    );

    let missing = call(&app, "POST", "/api/auth/login", &[], Some(json!({}))).await?;
    assert_eq!(
        (missing.status, missing.code()),
        (400, Some("invalid_request"))
    );
    assert_eq!(
        at(&missing.body, "/error/errors").as_array().map(Vec::len),
        Some(2)
    );
    // A form post from another site cannot sign anyone in: the body must be JSON.
    let form = call(
        &app,
        "POST",
        "/api/auth/login",
        &[("content-type", "application/x-www-form-urlencoded")],
        None,
    )
    .await?;
    assert_eq!(form.status, 415);
    let cross = call(
        &app,
        "POST",
        "/api/auth/login",
        &[("origin", "http://evil.test")],
        Some(json!({ "email": with_password, "password": PASSWORD })),
    )
    .await?;
    assert_eq!(
        (cross.status, cross.code()),
        (403, Some("permission_denied"))
    );
    // Positive control for all of the above.
    assert_eq!(login(&app, &with_password, PASSWORD).await?.status, 200);
    Ok(())
}

#[tokio::test]
async fn a_suspended_account_is_told_only_after_the_right_password() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let app = router(&db, false);
    let email = new_email();
    let id = user_with(&db, &email, true, false).await?;
    sqlx::query(r#"UPDATE "Agent" SET "suspendedAt" = now() WHERE "id" = $1"#)
        .bind(&id)
        .execute(&db)
        .await?;
    assert_eq!(login(&app, &email, "wrong").await?.status, 401);
    let right = login(&app, &email, PASSWORD).await?;
    assert_eq!(
        (right.status, right.code()),
        (403, Some("permission_denied"))
    );
    assert!(right.set_cookies.is_empty());
    Ok(())
}

#[tokio::test]
async fn password_login_follows_the_organisations_setting() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let app = router(&db, false);
    let sso_org = org(&db, false).await?;
    let email = new_email();
    let id = user_with(&db, &email, true, false).await?;
    // In no organisation: allowed.
    assert_eq!(login(&app, &email, PASSWORD).await?.status, 200);
    // Only in an organisation that turned passwords off: refused, after the password matched.
    member(&db, &sso_org, &id, "member").await?;
    let refused = login(&app, &email, PASSWORD).await?;
    assert_eq!(
        (refused.status, refused.code()),
        (403, Some("password_login_disabled"))
    );
    assert!(refused.set_cookies.is_empty());
    assert_eq!(login(&app, &email, "wrong").await?.status, 401);
    let mobile = call(
        &app,
        "POST",
        "/api/mobile/login",
        &[],
        Some(json!({ "email": email, "password": PASSWORD })),
    )
    .await?;
    assert_eq!(mobile.code(), Some("password_login_disabled"));
    // Also in an organisation that allows passwords: allowed again.
    member(&db, &org(&db, true).await?, &id, "member").await?;
    assert_eq!(login(&app, &email, PASSWORD).await?.status, 200);
    Ok(())
}

#[tokio::test]
async fn the_throttle_stops_guessing_even_when_the_guesses_arrive_at_once() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let app = router(&db, false);
    let email = new_email();
    user_with(&db, &email, true, false).await?;
    for _ in 0..5 {
        assert_eq!(login(&app, &email, "guess").await?.status, 401);
    }
    let blocked = login(&app, &email, "guess").await?;
    assert_eq!(
        (blocked.status, blocked.code()),
        (429, Some("rate_limited"))
    );
    assert!(
        blocked
            .retry_after
            .as_deref()
            .and_then(|s| s.parse::<u64>().ok())
            .is_some_and(|s| s > 0)
    );
    // Now even the right password waits: the throttle is per email, not per guess.
    assert_eq!(login(&app, &email, PASSWORD).await?.status, 429);
    // Another account is not locked out by this one.
    let other = new_email();
    user_with(&db, &other, true, false).await?;
    assert_eq!(login(&app, &other, PASSWORD).await?.status, 200);

    // Twelve guesses at the same moment against a fresh account: exactly five reach bcrypt.
    let app = router(&db, false);
    let target = new_email();
    user_with(&db, &target, true, false).await?;
    let replies = futures::future::join_all((0..12).map(|_| login(&app, &target, "guess"))).await;
    let statuses: Vec<u16> = replies
        .iter()
        .filter_map(|r| r.as_ref().ok().map(|r| r.status))
        .collect();
    assert_eq!(
        statuses.iter().filter(|s| **s == 401).count(),
        5,
        "{statuses:?}"
    );
    assert_eq!(
        statuses.iter().filter(|s| **s == 429).count(),
        7,
        "{statuses:?}"
    );
    Ok(())
}

#[tokio::test]
async fn logout_clears_the_cookie_and_the_mobile_login_issues_a_token() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let app = router(&db, false);
    let email = new_email();
    let id = user_with(&db, &email, true, false).await?;
    let reply = login(&app, &email, PASSWORD).await?;
    let cookie = session_cookie(&reply, false).ok_or("no cookie")?;
    let out = call(
        &app,
        "POST",
        "/api/auth/logout",
        &[("cookie", &cookie), ("origin", "http://app.test")],
        None,
    )
    .await?;
    assert_eq!(out.status, 204);
    assert!(
        out.set_cookies
            .iter()
            .any(|c| c.starts_with("authjs.session-token=;") && c.contains("Max-Age=0"))
    );
    let cross = call(
        &app,
        "POST",
        "/api/auth/logout",
        &[("cookie", &cookie), ("origin", "http://evil.test")],
        None,
    )
    .await?;
    assert_eq!(cross.status, 403);

    let mobile = call(
        &app,
        "POST",
        "/api/mobile/login",
        &[],
        Some(json!({ "email": email, "password": PASSWORD })),
    )
    .await?;
    assert_eq!(mobile.status, 200, "{mobile:?}");
    assert_eq!(at(&mobile.body, "/user/id"), json!(id));
    let token = at(&mobile.body, "/token");
    let token = token.as_str().ok_or("no token")?;
    let claims =
        agents_auth::mobile::verify_mobile_token(token, SECRET, chrono::Utc::now().timestamp())?;
    assert_eq!(
        (claims.user_id.as_str(), claims.role.as_deref()),
        (id.as_str(), Some("USER"))
    );
    let bearer = format!("Bearer {token}");
    let me = call(
        &app,
        "GET",
        "/api/mobile/memories",
        &[("authorization", &bearer)],
        None,
    )
    .await?;
    assert_eq!(me.status, 200);
    let wrong = call(
        &app,
        "POST",
        "/api/mobile/login",
        &[],
        Some(json!({ "email": email, "password": "x" })),
    )
    .await?;
    assert_eq!((wrong.status, wrong.code()), (401, Some("unauthenticated")));
    Ok(())
}
