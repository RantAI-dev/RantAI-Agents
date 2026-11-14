//! An organisation admin chooses the provider URLs, so with `SSO_ALLOW_PRIVATE_NETWORKS` off the
//! server refuses to reach a provider on a loopback, private or metadata address: by IP literal,
//! and by a name that resolves to one. The operator's own provider (`AUTH_OIDC_*`) is exempt.

#[allow(dead_code, reason = "this file uses only part of the shared helpers")]
mod signin_kit;

use agents_server::sso::client::{OidcClient, OidcOptions};
use serde_json::json;
use signin_kit::{
    R, Res, SECRET, StubIdp, call, domain, member, org, pool, router_with_clients, user_with,
};

/// The client the cloud runs with: private networks refused. `http` is allowed only because the
/// stub serves plain HTTP; the address check does not depend on the scheme.
fn guarded() -> OidcClient {
    OidcClient::new(OidcOptions {
        allow_http: true,
        allow_private_networks: false,
        jwks_refetch_cooldown: std::time::Duration::ZERO,
    })
}

/// The client an on-prem install with an internal Keycloak runs with.
fn on_prem() -> OidcClient {
    OidcClient::new(OidcOptions {
        allow_http: true,
        allow_private_networks: true,
        jwks_refetch_cooldown: std::time::Duration::ZERO,
    })
}

async fn admin_bearer(db: &agents_store::PgPool, org_id: &str) -> Res<String> {
    let id = user_with(
        db,
        &format!("{}@{}", agents_store::new_id(), domain()),
        true,
        false,
    )
    .await?;
    member(db, org_id, &id, "admin").await?;
    let token = agents_auth::mobile::sign_mobile_token(
        &id,
        "x@test.invalid",
        None,
        SECRET,
        chrono::Utc::now().timestamp(),
    )?;
    Ok(format!("Bearer {token}"))
}

/// Creates a provider at `issuer` through the admin API and runs its connection test.
async fn test_provider(
    app: &axum::Router,
    admin: &str,
    issuer: &str,
) -> Res<(u16, Option<String>)> {
    let created = call(
        app,
        "POST",
        "/api/dashboard/sso/providers",
        &[("authorization", admin)],
        Some(json!({
            "name": "Internal", "preset": "keycloak", "issuer": issuer, "clientId": "rantai-test",
            "emailDomains": [domain()]
        })),
    )
    .await?;
    if created.status != 201 {
        return Err(format!("create answered {created:?}").into());
    }
    let id = created
        .body
        .pointer("/id")
        .and_then(|v| v.as_str())
        .ok_or("no id")?
        .to_owned();
    let tested = call(
        app,
        "POST",
        &format!("/api/dashboard/sso/providers/{id}/test"),
        &[("authorization", admin)],
        None,
    )
    .await?;
    Ok((tested.status, tested.code().map(str::to_owned)))
}

#[tokio::test]
async fn an_org_provider_on_a_private_address_is_never_fetched() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    // One stub by IP literal and one by a name that resolves to loopback: the second goes
    // through the resolver, the path DNS rebinding would take.
    let by_ip = StubIdp::start().await?;
    let by_name = StubIdp::start_as(Some("localhost")).await?;
    let org_id = org(&db, true).await?;
    let admin = admin_bearer(&db, &org_id).await?;

    // Positive control: with private networks allowed, both reach the stub.
    let open = router_with_clients(&db, false, None, on_prem());
    for issuer in [&by_ip.issuer, &by_name.issuer] {
        let (status, code) = test_provider(&open, &admin, issuer).await?;
        assert_eq!(status, 200, "{issuer} on-prem: {code:?}");
    }

    let closed = router_with_clients(&db, false, None, guarded());
    for issuer in [&by_ip.issuer, &by_name.issuer] {
        let (status, code) = test_provider(&closed, &admin, issuer).await?;
        assert_eq!(
            (status, code.as_deref()),
            (502, Some("upstream_failed")),
            "{issuer} is refused"
        );
    }
    Ok(())
}

#[tokio::test]
async fn the_metadata_addresses_are_refused_before_any_connection() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let org_id = org(&db, true).await?;
    let admin = admin_bearer(&db, &org_id).await?;
    let closed = router_with_clients(&db, false, None, guarded());
    for issuer in [
        "http://169.254.169.254/realms/acme",
        "http://[fd00:ec2::254]/realms/acme",
        "http://[::ffff:127.0.0.1]/realms/acme",
        "http://10.0.0.1/realms/acme",
        "http://100.64.0.1/realms/acme",
    ] {
        let (status, code) = test_provider(&closed, &admin, issuer).await?;
        assert_eq!(
            (status, code.as_deref()),
            (502, Some("upstream_failed")),
            "{issuer}"
        );
    }
    Ok(())
}

#[tokio::test]
async fn the_operators_own_provider_is_exempt() -> R {
    let Some(db) = pool().await? else {
        return Ok(());
    };
    let stub = StubIdp::start().await?;
    let org_id = org(&db, true).await?;
    let d = domain();
    let vars = [
        ("AUTH_OIDC_ISSUER", stub.issuer.clone()),
        ("AUTH_OIDC_CLIENT_ID", "rantai-test".to_owned()),
        ("AUTH_OIDC_ORG_ID", org_id.clone()),
        ("AUTH_OIDC_EMAIL_DOMAINS", d.clone()),
    ];
    let env = agents_server::sso::env::from_vars(|name| {
        vars.iter()
            .find(|(k, _)| *k == name)
            .map(|(_, v)| v.clone())
    })?;
    // The organisations' client refuses loopback; the stub is on loopback all the same.
    let app = router_with_clients(&db, false, env, guarded());
    let started = signin_kit::start(&app, "env-oidc").await;
    assert!(
        started.is_ok(),
        "the env provider starts: {:?}",
        started.err()
    );
    Ok(())
}
