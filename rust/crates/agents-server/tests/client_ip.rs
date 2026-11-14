//! One trusted client IP (`http::client_ip`): the socket peer, unless the peer is a trusted
//! proxy. A client cannot pick the address the audit log records or the throttle counts by
//! writing `X-Forwarded-For` or `X-Real-IP` itself.

#[allow(dead_code, reason = "this file uses only part of the shared helpers")]
mod common;

use std::net::SocketAddr;

use agents_server::auth::AuthConfig;
use agents_server::{AppState, app};
use agents_store::{PgPool, new_id};
use axum::Router;
use common::{R, SECRET, bearer, code, pool, router, send_from, user};
use serde_json::json;

/// The router with `TRUSTED_PROXIES` set to `proxies` (comma-separated ranges).
pub async fn router_trusting(
    proxies: &str,
) -> Result<Option<(Router, PgPool)>, Box<dyn std::error::Error>> {
    let Some(db) = pool().await? else {
        return Ok(None);
    };
    let trusted = agents_core::net::parse_cidrs(proxies)?;
    let state = AppState {
        trusted_proxies: std::sync::Arc::from(trusted),
        ..AppState::new(
            db.clone(),
            AuthConfig {
                secrets: vec![SECRET.to_owned()],
            },
        )
    };
    Ok(Some((app(state), db)))
}

fn peer(ip: &str) -> Result<SocketAddr, std::net::AddrParseError> {
    format!("{ip}:40000").parse()
}

/// An organisation and its owner; returns both ids.
async fn owned_org(db: &PgPool) -> Result<(String, String), sqlx::Error> {
    let org_id = new_id();
    sqlx::query(
        r#"INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt")
           VALUES ($1,'t',$1,now(),now())"#,
    )
    .bind(&org_id)
    .execute(db)
    .await?;
    let owner = user(db, false).await?;
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,'owner',now())"#,
    )
    .bind(new_id())
    .bind(&owner)
    .bind(&org_id)
    .execute(db)
    .await?;
    Ok((org_id, owner))
}

/// Renames the organisation from `from` with `headers`; returns the IP its audit row recorded.
async fn audited_ip(
    app: &axum::Router,
    db: &PgPool,
    from: SocketAddr,
    headers: &[(&str, &str)],
) -> Result<Option<String>, Box<dyn std::error::Error>> {
    let (org_id, owner) = owned_org(db).await?;
    let (status, body) = send_from(
        app,
        "PATCH",
        &format!("/api/organizations/{org_id}"),
        Some(&bearer(&owner)?),
        Some(json!({ "name": "Renamed" })),
        headers,
        Some(from),
    )
    .await?;
    if status != 200 {
        return Err(format!("rename answered {status}: {body}").into());
    }
    Ok(sqlx::query_scalar(
        r#"SELECT "ipAddress" FROM "AuditLog" WHERE "organizationId" = $1 AND "action" = 'org.update'"#,
    )
    .bind(&org_id)
    .fetch_one(db)
    .await?)
}

#[tokio::test]
async fn without_trusted_proxies_a_forwarded_header_cannot_change_the_audited_ip() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let spoofed = [
        ("x-forwarded-for", "6.6.6.6, 7.7.7.7"),
        ("x-real-ip", "8.8.8.8"),
    ];
    // Positive control: with no headers the peer is recorded, so the column is written at all.
    let plain = audited_ip(&app, &db, peer("198.51.100.4")?, &[]).await?;
    assert_eq!(plain.as_deref(), Some("198.51.100.4"));
    let ip = audited_ip(&app, &db, peer("198.51.100.4")?, &spoofed).await?;
    assert_eq!(
        ip.as_deref(),
        Some("198.51.100.4"),
        "the client's headers are ignored"
    );
    Ok(())
}

#[tokio::test]
async fn behind_a_trusted_proxy_the_hop_it_appended_is_the_client() -> R {
    let Some((app, db)) = router_trusting("10.0.0.0/8").await? else {
        return Ok(());
    };
    // The client wrote 6.6.6.6; the edge proxy appended the address it saw, 203.0.113.9.
    let headers = [("x-forwarded-for", "6.6.6.6, 203.0.113.9")];
    let ip = audited_ip(&app, &db, peer("10.0.0.2")?, &headers).await?;
    assert_eq!(ip.as_deref(), Some("203.0.113.9"));
    // The same headers straight from the internet: the peer, since it is no proxy of ours.
    let ip = audited_ip(&app, &db, peer("198.51.100.4")?, &headers).await?;
    assert_eq!(ip.as_deref(), Some("198.51.100.4"));
    Ok(())
}

#[tokio::test]
async fn a_forwarded_header_cannot_buy_fresh_sign_in_attempts() -> R {
    let Some((app, _db)) = router().await? else {
        return Ok(());
    };
    let attacker = peer("198.51.100.66")?;
    let attempt =
        |n: usize, from: SocketAddr| {
            let app = app.clone();
            async move {
                let forged = format!("203.0.113.{n}");
                send_from(
                &app,
                "POST",
                "/api/auth/login",
                None,
                Some(json!({ "email": format!("{}@test.invalid", new_id()), "password": "guess" })),
                &[("x-forwarded-for", forged.as_str()), ("x-real-ip", forged.as_str())],
                Some(from),
            )
            .await
            }
        };
    // Thirty failures per address are allowed, each with another email and another forged hop.
    for n in 0..30 {
        let (status, body) = attempt(n, attacker).await?;
        assert_eq!(status, 401, "attempt {n}: {body}");
    }
    let (status, body) = attempt(30, attacker).await?;
    assert_eq!(
        (status, code(&body)),
        (429, Some("rate_limited")),
        "the address is the peer, whatever the header says"
    );
    // Positive control: another peer is not limited by the attacker's failures.
    let (status, _) = attempt(31, peer("198.51.100.67")?).await?;
    assert_eq!(status, 401);
    Ok(())
}
