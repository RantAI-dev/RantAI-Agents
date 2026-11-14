//! `/api/organizations/**` against a migrated database: tenancy, roles, team leads, the unit
//! tree, invitations and the audit log.
//!
//! Set `TEST_DATABASE_URL` to a migrated database; without it each test skips (and fails in CI).

mod common;
mod org_admin_fixtures;

use common::{R, bearer, code, router, send, user};
use org_admin_fixtures::{
    find, list, member, member_id, org, text, unit, unit_member, unit_of_kind,
};
use serde_json::{Value, json};

use agents_core::authz::UnitKind;
use agents_store::org_members;

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

/// A token for a user, as the mobile route issues it.
fn token(user_id: &str) -> String {
    bearer(user_id).unwrap_or_default()
}

fn not_found(body: &Value) -> bool {
    code(body) == Some("not_found")
}

fn denied(body: &Value) -> bool {
    code(body) == Some("permission_denied")
}

/// Another organisation's organisation, member, unit and audit are all a 404, and the same
/// calls against the caller's own organisation are the positive control.
#[tokio::test]
async fn another_organisations_rows_are_a_404() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let a = org(&db).await?;
    let b = org(&db).await?;
    let owner_a = user(&db, false).await?;
    let owner_b = user(&db, false).await?;
    member(&db, &owner_a, &a, "owner").await?;
    member(&db, &owner_b, &b, "owner").await?;
    let unit_a = unit(&db, &a, None, "eng").await?;
    let invited_a = org_members::invite(&db, &a, "invitee@test.invalid", "member", &owner_a)
        .await?
        .id;
    let ta = token(&owner_a);
    let tb = token(&owner_b);

    // A row of A addressed through B's path: the store's organisation scope refuses it.
    let (status, body) = call(
        &app,
        &tb,
        "PATCH",
        &format!("/api/organizations/{b}/members/{invited_a}"),
        Some(json!({ "role": "viewer" })),
    )
    .await;
    assert_eq!(status, 404, "another organisation's member: {body}");
    assert!(not_found(&body));
    let (status, body) = call(
        &app,
        &tb,
        "PATCH",
        &format!("/api/organizations/{b}/units/{unit_a}"),
        Some(json!({ "name": "mine" })),
    )
    .await;
    assert_eq!(status, 404, "another organisation's unit: {body}");
    assert!(not_found(&body));
    let (status, body) = call(
        &app,
        &tb,
        "DELETE",
        &format!("/api/organizations/{b}/units/{unit_a}"),
        None,
    )
    .await;
    assert_eq!(status, 404, "{body}");

    // A's own paths, as B: B is not an accepted member, so the organisation itself is a 404.
    for (method, uri, body) in [
        ("GET", format!("/api/organizations/{a}"), None),
        ("GET", format!("/api/organizations/{a}/members"), None),
        ("GET", format!("/api/organizations/{a}/units"), None),
        ("GET", format!("/api/organizations/{a}/audit"), None),
        (
            "PATCH",
            format!("/api/organizations/{a}"),
            Some(json!({ "name": "taken" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{a}/members/{invited_a}"),
            Some(json!({ "role": "viewer" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{a}/units/{unit_a}"),
            Some(json!({ "name": "taken" })),
        ),
    ] {
        let (status, answer) = call(&app, &tb, method, &uri, body).await;
        assert_eq!(
            status, 404,
            "{method} {uri} as another organisation: {answer}"
        );
        assert!(not_found(&answer), "{method} {uri}: {answer}");
    }

    // The positive control: the same calls from A's owner.
    for (method, uri, body) in [
        ("GET", format!("/api/organizations/{a}"), None),
        ("GET", format!("/api/organizations/{a}/members"), None),
        ("GET", format!("/api/organizations/{a}/units"), None),
        ("GET", format!("/api/organizations/{a}/audit"), None),
        (
            "PATCH",
            format!("/api/organizations/{a}"),
            Some(json!({ "name": "Mine" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{a}/members/{invited_a}"),
            Some(json!({ "role": "viewer" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{a}/units/{unit_a}"),
            Some(json!({ "name": "Engineering" })),
        ),
    ] {
        let (status, answer) = call(&app, &ta, method, &uri, body).await;
        assert_eq!(status, 200, "{method} {uri} as the owner: {answer}");
    }

    // The list is the caller's own organisations, never another's.
    let (status, body) = call(&app, &ta, "GET", "/api/organizations", None).await;
    assert_eq!(status, 200);
    let ids: Vec<String> = list(&body, "").iter().map(|o| text(o, "/id")).collect();
    assert!(ids.contains(&a) && !ids.contains(&b), "{body}");
    Ok(())
}

/// A member is refused every admin route with a 403; an admin does the same calls.
#[tokio::test]
async fn a_member_is_refused_and_an_admin_is_not() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    let admin = user(&db, false).await?;
    let plain = user(&db, false).await?;
    let target = user(&db, false).await?;
    let target2 = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    member(&db, &admin, &o, "admin").await?;
    member(&db, &plain, &o, "member").await?;
    member(&db, &target, &o, "member").await?;
    member(&db, &target2, &o, "member").await?;
    let target_member = member_id(&db, &o, &target).await?;
    let dept = unit_of_kind(&db, &o, None, "eng", UnitKind::Department).await?;
    let leaf = unit(&db, &o, None, "leaf").await?;
    let tp = token(&plain);
    let ta = token(&admin);

    // Every call a member makes is refused before the body is even read.
    let member_calls: Vec<(&str, String, Option<Value>)> = vec![
        (
            "PATCH",
            format!("/api/organizations/{o}"),
            Some(json!({ "name": "x" })),
        ),
        ("GET", format!("/api/organizations/{o}/members"), None),
        (
            "POST",
            format!("/api/organizations/{o}/members"),
            Some(json!({ "email": "nobody@test.invalid", "role": "member" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{o}/members/{target_member}"),
            Some(json!({ "role": "viewer" })),
        ),
        (
            "DELETE",
            format!("/api/organizations/{o}/members/{target_member}"),
            None,
        ),
        (
            "POST",
            format!("/api/organizations/{o}/units"),
            Some(json!({ "name": "sales", "kind": "team" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{o}/units/{dept}"),
            Some(json!({ "name": "renamed" })),
        ),
        (
            "DELETE",
            format!("/api/organizations/{o}/units/{leaf}"),
            None,
        ),
        (
            "GET",
            format!("/api/organizations/{o}/units/{dept}/members"),
            None,
        ),
        (
            "POST",
            format!("/api/organizations/{o}/units/{dept}/members"),
            Some(json!({ "userId": target2 })),
        ),
        (
            "DELETE",
            format!("/api/organizations/{o}/units/{dept}/members"),
            Some(json!({ "userId": target2 })),
        ),
        ("GET", format!("/api/organizations/{o}/audit"), None),
    ];
    for (method, uri, body) in member_calls {
        let (status, answer) = call(&app, &tp, method, &uri, body).await;
        assert_eq!(status, 403, "{method} {uri} as a member: {answer}");
        assert!(denied(&answer), "{method} {uri}: {answer}");
    }

    // An admin does each of them. The same bodies now apply.
    let admin_calls: Vec<(&str, String, Option<Value>)> = vec![
        (
            "PATCH",
            format!("/api/organizations/{o}"),
            Some(json!({ "name": "Admin Renamed" })),
        ),
        ("GET", format!("/api/organizations/{o}/members"), None),
        (
            "POST",
            format!("/api/organizations/{o}/members"),
            Some(json!({ "email": "invited@test.invalid", "role": "member" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{o}/members/{target_member}"),
            Some(json!({ "role": "viewer" })),
        ),
        (
            "POST",
            format!("/api/organizations/{o}/units"),
            Some(json!({ "name": "sales", "kind": "team" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{o}/units/{dept}"),
            Some(json!({ "name": "renamed" })),
        ),
        (
            "DELETE",
            format!("/api/organizations/{o}/units/{leaf}"),
            None,
        ),
        (
            "GET",
            format!("/api/organizations/{o}/units/{dept}/members"),
            None,
        ),
        (
            "POST",
            format!("/api/organizations/{o}/units/{dept}/members"),
            Some(json!({ "userId": target2 })),
        ),
        (
            "DELETE",
            format!("/api/organizations/{o}/units/{dept}/members"),
            Some(json!({ "userId": target2 })),
        ),
        ("GET", format!("/api/organizations/{o}/audit"), None),
        (
            "DELETE",
            format!("/api/organizations/{o}/members/{target_member}"),
            None,
        ),
    ];
    for (method, uri, body) in admin_calls {
        let (status, answer) = call(&app, &ta, method, &uri, body).await;
        assert!(
            (200..300).contains(&status),
            "{method} {uri} as an admin: {status} {answer}"
        );
    }

    // The admin's change and the member's refusal left the role as the admin set it.
    let (status, body) = call(
        &app,
        &ta,
        "GET",
        &format!("/api/organizations/{o}/members"),
        None,
    )
    .await;
    assert_eq!(status, 200);
    let listed = list(&body, "");
    assert!(
        listed.iter().all(|m| text(m, "/userId") != target),
        "the removed member is gone: {body}"
    );
    Ok(())
}

/// A team lead manages their own unit and everything below it, never a sibling, never the top
/// level.
#[tokio::test]
async fn a_lead_manages_their_team_and_nothing_else() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    let lead = user(&db, false).await?;
    let other = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    member(&db, &lead, &o, "member").await?;
    member(&db, &other, &o, "member").await?;
    let dept = unit_of_kind(&db, &o, None, "eng", UnitKind::Department).await?;
    let team = unit(&db, &o, Some(&dept), "web").await?;
    let sibling = unit(&db, &o, Some(&dept), "mobile").await?;
    let below = unit(&db, &o, Some(&team), "frontend").await?;
    unit_member(&db, &o, &team, &lead, true).await?;
    let tl = token(&lead);
    let to = token(&owner);

    // Below their own unit: a create, a rename and a membership are allowed.
    let (status, body) = call(
        &app,
        &tl,
        "POST",
        &format!("/api/organizations/{o}/units"),
        Some(json!({ "name": "Design", "kind": "team", "parentId": below })),
    )
    .await;
    assert_eq!(status, 201, "a lead creates under their team: {body}");
    let created = text(&body, "/id");
    let (status, body) = call(
        &app,
        &tl,
        "PATCH",
        &format!("/api/organizations/{o}/units/{created}"),
        Some(json!({ "name": "Design System" })),
    )
    .await;
    assert_eq!(status, 200, "a lead renames below their team: {body}");
    let (status, body) = call(
        &app,
        &tl,
        "POST",
        &format!("/api/organizations/{o}/units/{team}/members"),
        Some(json!({ "userId": other, "isLead": false })),
    )
    .await;
    assert_eq!(status, 201, "a lead adds a member: {body}");
    let (status, body) = call(
        &app,
        &tl,
        "DELETE",
        &format!("/api/organizations/{o}/units/{created}"),
        None,
    )
    .await;
    assert_eq!(status, 200, "a lead deletes below their team: {body}");

    // A sibling is beside them, not below: 403 on every write.
    for (method, uri, body) in [
        (
            "PATCH",
            format!("/api/organizations/{o}/units/{sibling}"),
            Some(json!({ "name": "taken" })),
        ),
        (
            "DELETE",
            format!("/api/organizations/{o}/units/{sibling}"),
            None,
        ),
        (
            "POST",
            format!("/api/organizations/{o}/units/{sibling}/members"),
            Some(json!({ "userId": other })),
        ),
        (
            "POST",
            format!("/api/organizations/{o}/units"),
            Some(json!({ "name": "under sibling", "kind": "team", "parentId": sibling })),
        ),
    ] {
        let (status, answer) = call(&app, &tl, method, &uri, body).await;
        assert_eq!(status, 403, "{method} {uri} as a lead: {answer}");
        assert!(denied(&answer), "{method} {uri}: {answer}");
    }

    // The organisation itself is never theirs: no top-level unit, no move to the top level.
    for (method, uri, body) in [
        (
            "POST",
            format!("/api/organizations/{o}/units"),
            Some(json!({ "name": "top", "kind": "department" })),
        ),
        (
            "PATCH",
            format!("/api/organizations/{o}/units/{team}"),
            Some(json!({ "parentId": null })),
        ),
    ] {
        let (status, answer) = call(&app, &tl, method, &uri, body).await;
        assert_eq!(status, 403, "{method} {uri} as a lead: {answer}");
        assert!(denied(&answer));
    }

    // The positive control: an owner does what the lead could not.
    let (status, body) = call(
        &app,
        &to,
        "PATCH",
        &format!("/api/organizations/{o}/units/{sibling}"),
        Some(json!({ "name": "Mobile" })),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let (status, body) = call(
        &app,
        &to,
        "POST",
        &format!("/api/organizations/{o}/units"),
        Some(json!({ "name": "top", "kind": "department" })),
    )
    .await;
    assert_eq!(status, 201, "{body}");

    // A lead may read the tree.
    let (status, body) = call(
        &app,
        &tl,
        "GET",
        &format!("/api/organizations/{o}/units"),
        None,
    )
    .await;
    assert_eq!(status, 200, "{body}");
    Ok(())
}

/// A move that would close a loop is a 409; a legal move is the positive control.
#[tokio::test]
async fn a_unit_cycle_is_a_conflict() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    let dept = unit_of_kind(&db, &o, None, "eng", UnitKind::Department).await?;
    let team = unit(&db, &o, Some(&dept), "web").await?;
    let to = token(&owner);

    for (unit_id, parent) in [(&team, &team), (&dept, &team)] {
        let (status, body) = call(
            &app,
            &to,
            "PATCH",
            &format!("/api/organizations/{o}/units/{unit_id}"),
            Some(json!({ "parentId": parent })),
        )
        .await;
        assert_eq!(status, 409, "{unit_id} under {parent}: {body}");
        assert_eq!(code(&body), Some("conflict"), "{body}");
    }

    // A legal move out of the tree and back is fine.
    let (status, body) = call(
        &app,
        &to,
        "PATCH",
        &format!("/api/organizations/{o}/units/{team}"),
        Some(json!({ "parentId": null })),
    )
    .await;
    assert_eq!(status, 200, "a move to the top level: {body}");
    assert!(body.pointer("/parentId").is_some_and(Value::is_null));
    let (status, body) = call(
        &app,
        &to,
        "PATCH",
        &format!("/api/organizations/{o}/units/{team}"),
        Some(json!({ "parentId": dept })),
    )
    .await;
    assert_eq!(status, 200, "a move back under the department: {body}");
    assert_eq!(text(&body, "/parentId"), dept);
    Ok(())
}

/// Every change leaves an audit row, with the actor, the resource and the IP; the list pages by
/// cursor.
#[tokio::test]
async fn every_change_leaves_an_audit_row() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    let other = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    member(&db, &other, &o, "member").await?;
    let to = token(&owner);
    let headers = [("x-forwarded-for", "203.0.113.7")];

    let (status, _) = common::send_with(
        &app,
        "PATCH",
        &format!("/api/organizations/{o}"),
        Some(to.as_str()),
        Some(json!({ "name": "Audited" })),
        &headers,
    )
    .await?;
    assert_eq!(status, 200);
    let (status, body) = call(
        &app,
        &to,
        "POST",
        &format!("/api/organizations/{o}/members"),
        Some(json!({ "email": "audit-invite@test.invalid", "role": "member" })),
    )
    .await;
    assert_eq!(status, 201, "{body}");
    let invited = text(&body, "/id");

    // A role change needs the member list first; `other` is a member, so it is straightforward.
    let (_, members) = call(
        &app,
        &to,
        "GET",
        &format!("/api/organizations/{o}/members"),
        None,
    )
    .await;
    let Some(other_row) = find(list(&members, ""), "userId", &other) else {
        return Err("the member row of the other user is missing".into());
    };
    let other_member = text(other_row, "/id");
    let (status, body) = call(
        &app,
        &to,
        "PATCH",
        &format!("/api/organizations/{o}/members/{other_member}"),
        Some(json!({ "role": "admin" })),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let (status, body) = call(
        &app,
        &to,
        "DELETE",
        &format!("/api/organizations/{o}/members/{invited}"),
        None,
    )
    .await;
    assert_eq!(status, 200, "{body}");

    let (status, body) = call(
        &app,
        &to,
        "POST",
        &format!("/api/organizations/{o}/units"),
        Some(json!({ "name": "Audited Unit", "kind": "team" })),
    )
    .await;
    assert_eq!(status, 201, "{body}");
    let created = text(&body, "/id");
    let (status, _) = call(
        &app,
        &to,
        "PATCH",
        &format!("/api/organizations/{o}/units/{created}"),
        Some(json!({ "name": "Audited Unit 2" })),
    )
    .await;
    assert_eq!(status, 200);
    let (status, body) = call(
        &app,
        &to,
        "POST",
        &format!("/api/organizations/{o}/units/{created}/members"),
        Some(json!({ "userId": other, "isLead": true })),
    )
    .await;
    assert_eq!(status, 201, "{body}");
    let (status, _) = call(
        &app,
        &to,
        "DELETE",
        &format!("/api/organizations/{o}/units/{created}/members"),
        Some(json!({ "userId": other })),
    )
    .await;
    assert_eq!(status, 200);
    let (status, _) = call(
        &app,
        &to,
        "DELETE",
        &format!("/api/organizations/{o}/units/{created}"),
        None,
    )
    .await;
    assert_eq!(status, 200);

    let (status, body) = call(
        &app,
        &to,
        "GET",
        &format!("/api/organizations/{o}/audit"),
        None,
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let rows = list(&body, "/data");
    let actions: Vec<String> = rows.iter().map(|r| text(r, "/action")).collect();
    for expected in [
        "org.update",
        "org.member.invite",
        "org.member.role_change",
        "org.member.remove",
        "org.unit.create",
        "org.unit.update",
        "org.unit.delete",
        "org.unit.member.add",
        "org.unit.member.remove",
    ] {
        assert!(
            actions.iter().any(|a| a == expected),
            "{expected} is missing: {actions:?}"
        );
    }
    let Some(update) = rows.iter().find(|r| text(r, "/action") == "org.update") else {
        return Err("the org.update row is missing".into());
    };
    assert_eq!(text(update, "/userId"), owner);
    assert_eq!(text(update, "/ipAddress"), "203.0.113.7");
    assert_eq!(text(update, "/detail/name"), "Audited");
    assert_eq!(text(update, "/resource"), format!("org:{o}"));
    assert!(
        body.pointer("/nextCursor").is_some_and(Value::is_null),
        "one page: {body}"
    );

    // The cursor pages: two at a time, none repeated.
    let (status, first) = call(
        &app,
        &to,
        "GET",
        &format!("/api/organizations/{o}/audit?limit=2"),
        None,
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(list(&first, "/data").len(), 2);
    let cursor = text(&first, "/nextCursor");
    assert!(!cursor.is_empty(), "a second page follows: {first}");
    let (status, second) = call(
        &app,
        &to,
        "GET",
        &format!("/api/organizations/{o}/audit?limit=2&cursor={cursor}"),
        None,
    )
    .await;
    assert_eq!(status, 200);
    let first_ids: Vec<String> = list(&first, "/data")
        .iter()
        .map(|r| text(r, "/id"))
        .collect();
    let second_ids: Vec<String> = list(&second, "/data")
        .iter()
        .map(|r| text(r, "/id"))
        .collect();
    assert!(
        second_ids.iter().all(|id| !first_ids.contains(id)),
        "{first} then {second}"
    );
    assert_eq!(actions.len(), 9, "{actions:?}");
    Ok(())
}

/// An invitation is pending until the invitee accepts it; only the invitee can, and a second
/// invitation for the same address is a 409.
#[tokio::test]
async fn an_invitation_waits_for_its_invitee() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    let invitee = user(&db, false).await?;
    let stranger = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    let invitee_email = format!("{invitee}@test.invalid");
    let to = token(&owner);
    let (status, body) = call(
        &app,
        &to,
        "POST",
        &format!("/api/organizations/{o}/members"),
        Some(json!({ "email": invitee_email, "role": "member" })),
    )
    .await;
    assert_eq!(status, 201, "{body}");
    assert_eq!(body.pointer("/isPending"), Some(&json!(true)), "{body}");
    assert!(body.pointer("/acceptedAt").is_some_and(Value::is_null));

    // The same address twice is a 409.
    let (status, body) = call(
        &app,
        &to,
        "POST",
        &format!("/api/organizations/{o}/members"),
        Some(json!({ "email": invitee_email, "role": "member" })),
    )
    .await;
    assert_eq!(status, 409, "{body}");
    assert_eq!(code(&body), Some("conflict"));

    // A stranger has no invitation to accept.
    let (status, body) = call(
        &app,
        &token(&stranger),
        "POST",
        &format!("/api/organizations/{o}/members/accept"),
        None,
    )
    .await;
    assert_eq!(status, 404, "{body}");
    assert!(not_found(&body));

    // The invitee accepts, and is a member afterwards.
    let (status, body) = call(
        &app,
        &token(&invitee),
        "POST",
        &format!("/api/organizations/{o}/members/accept"),
        None,
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body.pointer("/isPending"), Some(&json!(false)));
    assert_eq!(text(&body, "/userId"), invitee);
    let (status, body) = call(
        &app,
        &to,
        "GET",
        &format!("/api/organizations/{o}/members"),
        None,
    )
    .await;
    assert_eq!(status, 200);
    assert!(
        list(&body, "").iter().any(|m| text(m, "/userId") == invitee
            && m.pointer("/acceptedAt").is_some_and(Value::is_string)),
        "{body}"
    );
    // Accepting twice finds no pending row.
    let (status, body) = call(
        &app,
        &token(&invitee),
        "POST",
        &format!("/api/organizations/{o}/members/accept"),
        None,
    )
    .await;
    assert_eq!(status, 404, "{body}");
    Ok(())
}

/// The member list carries each member's direct unit memberships.
#[tokio::test]
async fn the_member_list_carries_unit_memberships() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    let member_user = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    member(&db, &member_user, &o, "member").await?;
    let u = unit(&db, &o, None, "eng").await?;
    unit_member(&db, &o, &u, &member_user, true).await?;
    let (status, body) = call(
        &app,
        &token(&owner),
        "GET",
        &format!("/api/organizations/{o}/members"),
        None,
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let Some(listed) = find(list(&body, ""), "userId", &member_user) else {
        return Err("the member row is missing".into());
    };
    let Some(first) = list(listed, "/units").first() else {
        return Err("the unit membership is missing".into());
    };
    assert_eq!(text(first, "/unitId"), u);
    assert_eq!(text(first, "/role"), "lead");
    assert_eq!(text(first, "/source"), "manual");
    Ok(())
}

/// A user who is not an accepted member of the organisation cannot join a unit.
#[tokio::test]
async fn a_unit_takes_only_accepted_members() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    let outsider = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    let u = unit(&db, &o, None, "eng").await?;
    let (status, body) = call(
        &app,
        &token(&owner),
        "POST",
        &format!("/api/organizations/{o}/units/{u}/members"),
        Some(json!({ "userId": outsider })),
    )
    .await;
    assert_eq!(status, 404, "{body}");
    let (status, body) = call(
        &app,
        &token(&owner),
        "POST",
        &format!("/api/organizations/{o}/units/{u}/members"),
        Some(json!({ "userId": owner })),
    )
    .await;
    assert_eq!(status, 201, "the positive control: {body}");
    Ok(())
}

/// The organisation's settings carry the password sign-in switch.
#[tokio::test]
async fn the_password_switch_is_part_of_the_settings() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    let to = token(&owner);
    // Fresh, because the slug is unique across the whole table and the test database is shared.
    let slug = format!("acme-{}", agents_store::new_id());
    let (status, body) = call(
        &app,
        &to,
        "PATCH",
        &format!("/api/organizations/{o}"),
        Some(json!({ "passwordLoginEnabled": false, "slug": slug })),
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body.pointer("/passwordLoginEnabled"), Some(&json!(false)));
    assert_eq!(text(&body, "/slug"), slug);
    let (status, body) = call(&app, &to, "GET", &format!("/api/organizations/{o}"), None).await;
    assert_eq!(status, 200);
    assert_eq!(body.pointer("/passwordLoginEnabled"), Some(&json!(false)));
    // A slug another organisation has is a 409.
    let other = org(&db).await?;
    let other_owner = user(&db, false).await?;
    member(&db, &other_owner, &other, "owner").await?;
    let (status, body) = call(
        &app,
        &token(&other_owner),
        "PATCH",
        &format!("/api/organizations/{other}"),
        Some(json!({ "slug": slug })),
    )
    .await;
    assert_eq!(status, 409, "{body}");
    Ok(())
}

/// A role a caller may not hand out, and a body with a field the API does not know, are 400s
/// with the field named.
#[tokio::test]
async fn a_bad_body_names_every_bad_field() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    let to = token(&owner);
    let (status, body) = call(
        &app,
        &to,
        "POST",
        &format!("/api/organizations/{o}/members"),
        Some(json!({ "email": "not-an-address", "role": "owner", "nickname": "x" })),
    )
    .await;
    assert_eq!(status, 400, "{body}");
    let codes: Vec<String> = list(&body, "/error/errors")
        .iter()
        .map(|e| text(e, "/field"))
        .collect();
    assert!(codes.iter().any(|c| c == "/email"), "{body}");
    assert!(codes.iter().any(|c| c == "/role"), "{body}");
    assert!(codes.iter().any(|c| c == "/nickname"), "{body}");
    let (status, body) = call(
        &app,
        &to,
        "GET",
        &format!("/api/organizations/{o}/audit?limit=-1"),
        None,
    )
    .await;
    assert_eq!(status, 400, "{body}");
    Ok(())
}
