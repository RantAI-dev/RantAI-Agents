//! Who may accept an invitation, how far a team lead reaches in the unit tree, and the tenancy
//! of the routes the other files do not cover.
//!
//! Set `TEST_DATABASE_URL` to a migrated database; without it each test skips (and fails in CI).

mod common;
mod org_admin_fixtures;

use agents_core::authz::UnitKind;
use agents_store::audit::Actor;
use agents_store::{PgPool, new_id, org_members};
use common::{R, SECRET, bearer, code, router, send, user};
use org_admin_fixtures::{member, member_id, org, unit, unit_member, unit_of_kind};
use serde_json::{Value, json};

/// A token for `user_id` whose claims carry `email`, as a session issued before an address
/// changed would.
fn token_claiming(user_id: &str, email: &str) -> Result<String, agents_auth::AuthError> {
    let now = chrono::Utc::now().timestamp();
    agents_auth::mobile::sign_mobile_token(user_id, email, None, SECRET, now)
        .map(|t| format!("Bearer {t}"))
}

fn actor(user_id: &str) -> Actor<'_> {
    Actor {
        user_id,
        ip_address: None,
    }
}

async fn set_email(db: &PgPool, user_id: &str, email: &str) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "Agent" SET "email" = $2 WHERE "id" = $1"#)
        .bind(user_id)
        .bind(email)
        .execute(db)
        .await?;
    Ok(())
}

async fn accept(app: &axum::Router, token: &str, org_id: &str) -> R2 {
    send(
        app,
        "POST",
        &format!("/api/organizations/{org_id}/members/accept"),
        Some(token),
        None,
    )
    .await
}

type R2 = Result<(u16, Value), Box<dyn std::error::Error>>;

/// The address an invite is matched by is the caller's address in the database, not the one a
/// token claims: a token is only as fresh as its sign-in.
#[tokio::test]
async fn an_invite_is_accepted_by_the_stored_address_not_the_claimed_one() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    let address = format!("new-{}@test.invalid", new_id());
    // Nobody has the address yet: the invite names a pending placeholder.
    org_members::invite(&db, &o, &address, "member", &actor(&owner)).await?;

    let stranger = user(&db, false).await?;
    let (status, body) = accept(&app, &token_claiming(&stranger, &address)?, &o).await?;
    assert_eq!(status, 404, "a token claiming the address: {body}");
    assert_eq!(code(&body), Some("not_found"));

    // The positive control: the person who now holds the address accepts.
    let invitee = user(&db, false).await?;
    set_email(&db, &invitee, &address).await?;
    let (status, body) = accept(&app, &bearer(&invitee)?, &o).await?;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body.pointer("/userId"), Some(&json!(invitee)));
    Ok(())
}

/// An invite that already names an account belongs to that account, even when somebody else has
/// the address by now.
#[tokio::test]
async fn an_invite_naming_an_account_is_that_accounts_alone() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    let invitee = user(&db, false).await?;
    let address = format!("{invitee}@test.invalid");
    org_members::invite(&db, &o, &address, "admin", &actor(&owner)).await?;

    // The invitee changes address and somebody else takes the old one.
    set_email(&db, &invitee, &format!("moved-{invitee}@test.invalid")).await?;
    let other = user(&db, false).await?;
    set_email(&db, &other, &address).await?;
    let (status, body) = accept(&app, &token_claiming(&other, &address)?, &o).await?;
    assert_eq!(status, 404, "somebody else's invite: {body}");

    let (status, body) = accept(&app, &bearer(&invitee)?, &o).await?;
    assert_eq!(status, 200, "the invitee, by id: {body}");
    assert_eq!(body.pointer("/userId"), Some(&json!(invitee)));
    Ok(())
}

/// An invitation is for one organisation: accepting through another organisation's path finds
/// nothing, and a pending invitee cannot be put in a unit.
#[tokio::test]
async fn an_invite_is_for_its_own_organisation() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (a, b) = (org(&db).await?, org(&db).await?);
    let owner_a = user(&db, false).await?;
    let owner_b = user(&db, false).await?;
    member(&db, &owner_a, &a, "owner").await?;
    member(&db, &owner_b, &b, "owner").await?;
    let invitee = user(&db, false).await?;
    let invitee_b = user(&db, false).await?;
    org_members::invite(
        &db,
        &a,
        &format!("{invitee}@test.invalid"),
        "member",
        &actor(&owner_a),
    )
    .await?;
    org_members::invite(
        &db,
        &b,
        &format!("{invitee_b}@test.invalid"),
        "member",
        &actor(&owner_b),
    )
    .await?;
    let t = bearer(&invitee)?;

    // Pending: no unit takes them yet.
    let u = unit(&db, &a, None, "eng").await?;
    let (status, body) = send(
        &app,
        "POST",
        &format!("/api/organizations/{a}/units/{u}/members"),
        Some(bearer(&owner_a)?.as_str()),
        Some(json!({ "userId": invitee })),
    )
    .await?;
    assert_eq!(status, 404, "a pending invitee in a unit: {body}");

    let (status, body) = accept(&app, &t, &b).await?;
    assert_eq!(status, 404, "another organisation's path: {body}");
    assert_eq!(code(&body), Some("not_found"));
    let (status, body) = accept(&app, &t, &a).await?;
    assert_eq!(status, 200, "the positive control: {body}");
    Ok(())
}

/// A unit member of another organisation, and a member of another organisation, are a 404 on
/// every unit-member and member route; the same calls in the caller's own organisation are not.
#[tokio::test]
async fn unit_members_of_another_organisation_are_a_404() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let (a, b) = (org(&db).await?, org(&db).await?);
    let owner_a = user(&db, false).await?;
    let owner_b = user(&db, false).await?;
    let x = user(&db, false).await?;
    member(&db, &owner_a, &a, "owner").await?;
    member(&db, &owner_b, &b, "owner").await?;
    member(&db, &x, &a, "member").await?;
    let unit_a = unit(&db, &a, None, "eng").await?;
    unit_member(&db, &a, &unit_a, &x, false).await?;
    let mx = member_id(&db, &a, &x).await?;
    let (ta, tb) = (bearer(&owner_a)?, bearer(&owner_b)?);

    let calls = |o: &str| {
        vec![
            (
                "GET",
                format!("/api/organizations/{o}/units/{unit_a}/members"),
                None,
            ),
            (
                "POST",
                format!("/api/organizations/{o}/units/{unit_a}/members"),
                Some(json!({ "userId": x, "isLead": true })),
            ),
            (
                "DELETE",
                format!("/api/organizations/{o}/units/{unit_a}/members"),
                Some(json!({ "userId": x })),
            ),
            (
                "DELETE",
                format!("/api/organizations/{o}/members/{mx}"),
                None,
            ),
        ]
    };
    for (method, uri, body) in calls(&b) {
        let (status, answer) = send(&app, method, &uri, Some(tb.as_str()), body).await?;
        assert_eq!(status, 404, "{method} {uri}: {answer}");
        assert_eq!(code(&answer), Some("not_found"), "{method} {uri}");
    }
    for (method, uri, body) in calls(&a) {
        let (status, answer) = send(&app, method, &uri, Some(ta.as_str()), body).await?;
        assert!(
            status == 200 || status == 201,
            "{method} {uri} in its own organisation: {status} {answer}"
        );
    }
    Ok(())
}

/// A lead may move a unit only between two places they manage: the unit's current parent and
/// its new one. Leading two teams in two departments does not let a lead carry one team across.
/// Deleting a unit, like creating one, needs its parent: a lead does not delete their own team.
#[tokio::test]
async fn a_lead_moves_and_deletes_only_inside_their_scope() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    let lead = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    member(&db, &lead, &o, "member").await?;
    let eng = unit_of_kind(&db, &o, None, "eng", UnitKind::Department).await?;
    let ops_dept = unit_of_kind(&db, &o, None, "ops", UnitKind::Department).await?;
    let web = unit(&db, &o, Some(&eng), "web").await?;
    let infra = unit(&db, &o, Some(&ops_dept), "infra").await?;
    let frontend = unit(&db, &o, Some(&web), "frontend").await?;
    let design = unit(&db, &o, Some(&web), "design").await?;
    unit_member(&db, &o, &web, &lead, true).await?;
    unit_member(&db, &o, &infra, &lead, true).await?;
    let tl = bearer(&lead)?;
    let parent_of = async |id: &str| -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar::<_, Option<String>>(
            r#"SELECT "parentId" FROM "OrgUnit" WHERE "id" = $1"#,
        )
        .bind(id)
        .fetch_one(&db)
        .await
    };

    // web leaves eng, which the lead does not manage.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/organizations/{o}/units/{web}"),
        Some(tl.as_str()),
        Some(json!({ "parentId": infra })),
    )
    .await?;
    assert_eq!(status, 403, "a team carried out of its department: {body}");
    assert_eq!(code(&body), Some("permission_denied"));
    assert_eq!(parent_of(&web).await?.as_deref(), Some(eng.as_str()));

    // The lead's own team is not theirs to delete: its parent is eng.
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/organizations/{o}/units/{infra}"),
        Some(tl.as_str()),
        None,
    )
    .await?;
    assert_eq!(status, 403, "a lead deleting their own team: {body}");

    // The positive control: inside web, both ends are the lead's.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/organizations/{o}/units/{design}"),
        Some(tl.as_str()),
        Some(json!({ "parentId": frontend })),
    )
    .await?;
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        parent_of(&design).await?.as_deref(),
        Some(frontend.as_str())
    );
    let (status, body) = send(
        &app,
        "DELETE",
        &format!("/api/organizations/{o}/units/{design}"),
        Some(tl.as_str()),
        None,
    )
    .await?;
    assert_eq!(status, 200, "{body}");
    // And an owner may carry web across.
    let (status, body) = send(
        &app,
        "PATCH",
        &format!("/api/organizations/{o}/units/{web}"),
        Some(bearer(&owner)?.as_str()),
        Some(json!({ "parentId": infra })),
    )
    .await?;
    assert_eq!(status, 200, "{body}");
    Ok(())
}
