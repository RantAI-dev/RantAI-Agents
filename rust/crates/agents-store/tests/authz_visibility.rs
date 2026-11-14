//! The SQL list filters agree with `authz::authorize`, exhaustively, over a generated
//! organisation; and nothing of another organisation leaks into them.
//!
//! Set `TEST_DATABASE_URL` to a migrated database; without it each test skips (and fails in CI).

mod authz_common;

use std::collections::BTreeSet;

use agents_core::authz::{
    Decision, GrantLevel, MemberSource, Permission, Resource, Subject, SubjectType, UnitKind,
    authorize,
};
use agents_store::units::{self, NewUnit};
use agents_store::{PgPool, StoreError, access, grants, shares};
use authz_common::*;

/// One generated world: org A (the one under test) and org B (the neighbour), with users in
/// both, raw rows that a buggy write could leave behind, and every id the test compares over.
struct World {
    org_a: String,
    org_b: String,
    /// Users who hold a membership of org A (some of them also of org B).
    users_a: Vec<String>,
    assistants: Vec<String>,
    sessions: Vec<String>,
}

async fn make_units(
    db: &PgPool,
    org: &str,
    n: usize,
    rng: &mut Rng,
) -> Result<Vec<String>, StoreError> {
    let mut ids: Vec<String> = Vec::new();
    for i in 0..n {
        // Mostly hang under the newest units, so the tree is several levels deep.
        let parent = if i == 0 || rng.chance(15) {
            None
        } else {
            let lo = i.saturating_sub(3);
            ids.get(lo + rng.below(i - lo)).cloned()
        };
        let kind = if parent.is_none() {
            UnitKind::Department
        } else {
            UnitKind::Team
        };
        let slug = format!("u{i}");
        let row = units::create(
            db,
            org,
            &NewUnit {
                parent_id: parent.as_deref(),
                kind,
                name: &slug,
                slug: &slug,
                external_id: None,
            },
        )
        .await?;
        ids.push(row.id);
    }
    Ok(ids)
}

fn subject(kind: SubjectType, id: &str) -> Subject {
    Subject {
        kind,
        id: id.to_owned(),
    }
}

async fn world(db: &PgPool, seed: u64) -> Result<World, Box<dyn std::error::Error>> {
    let mut rng = Rng(seed);
    let (org_a, org_b) = (org(db).await?, org(db).await?);
    let units_a = make_units(db, &org_a, 14, &mut rng).await?;
    let units_b = make_units(db, &org_b, 5, &mut rng).await?;

    let roles = [
        "owner", "admin", "member", "member", "member", "viewer", "viewer",
    ];
    let mut users_a = Vec::new();
    for i in 0..12 {
        let u = user(db).await?;
        let role = if i == 0 {
            "owner"
        } else {
            *rng.pick(&roles).unwrap_or(&"member")
        };
        member(db, &u, &org_a, role).await?;
        for _ in 0..rng.below(4) {
            if let Some(unit) = rng.pick(&units_a) {
                units::add_member(db, &org_a, unit, &u, rng.chance(25), MemberSource::Manual)
                    .await?;
            }
        }
        users_a.push(u);
    }
    let mut users_b = Vec::new();
    for _ in 0..3 {
        let u = user(db).await?;
        member(db, &u, &org_b, "member").await?;
        users_b.push(u);
    }
    // Two users in both orgs: a member of B's units must gain nothing in A from it.
    for u in users_a.iter().take(2) {
        member(db, u, &org_b, "member").await?;
        if let Some(unit) = units_b.first() {
            units::add_member(db, &org_b, unit, u, false, MemberSource::Manual).await?;
        }
        users_b.push(u.clone());
    }

    let mut assistants_a = Vec::new();
    for _ in 0..16 {
        assistants_a.push(assistant(db, &org_a, "builder").await?);
    }
    let mut assistants_b = Vec::new();
    for _ in 0..4 {
        assistants_b.push(assistant(db, &org_b, "builder").await?);
    }
    let built_in = global_assistant(db, true).await?;
    let orgless = global_assistant(db, false).await?;

    for _ in 0..30 {
        let (Some(a), level) = (
            rng.pick(&assistants_a),
            if rng.chance(20) {
                GrantLevel::Manage
            } else {
                GrantLevel::Use
            },
        ) else {
            continue;
        };
        let s = match rng.below(10) {
            0 => subject(SubjectType::Org, &org_a),
            1..=5 => subject(
                SubjectType::Unit,
                rng.pick(&units_a).map_or("", String::as_str),
            ),
            _ => subject(
                SubjectType::User,
                rng.pick(&users_a).map_or("", String::as_str),
            ),
        };
        grants::set(db, &org_a, a, &s, level, "admin").await?;
    }
    // Org B grants its own agents to everyone who is in it, including the dual users.
    for (a, u) in assistants_b.iter().zip(users_b.iter().cycle()) {
        grants::set(
            db,
            &org_b,
            a,
            &subject(SubjectType::User, u),
            GrantLevel::Use,
            "admin",
        )
        .await?;
    }
    if let (Some(a), Some(last), Some(second), Some(b_unit), Some(b_agent)) = (
        assistants_a.first(),
        assistants_a.last(),
        assistants_a.iter().rev().nth(1),
        units_b.first(),
        assistants_b.first(),
    ) {
        for u in &users_a {
            // A row filed under org B on an A agent, naming an A user.
            raw_grant(db, &org_b, a, "user", u).await?;
        }
        // A row in org A naming B's unit (the dual users are in it) and B's org.
        raw_grant(db, &org_a, last, "unit", b_unit).await?;
        raw_grant(db, &org_a, second, "org", &org_b).await?;
        // A row in org A on B's agent.
        raw_grant(db, &org_a, b_agent, "org", &org_a).await?;
    }

    let mut sessions_a = Vec::new();
    for u in &users_a {
        for _ in 0..rng.below(3) {
            let agent = rng.pick(&assistants_a).cloned().unwrap_or_default();
            sessions_a.push(session(db, u, &org_a, &agent).await?);
        }
    }
    for s in &sessions_a {
        for _ in 0..rng.below(3) {
            let sub = match rng.below(8) {
                0 => subject(SubjectType::Org, &org_a),
                1..=4 => subject(
                    SubjectType::Unit,
                    rng.pick(&units_a).map_or("", String::as_str),
                ),
                _ => subject(
                    SubjectType::User,
                    rng.pick(&users_a).map_or("", String::as_str),
                ),
            };
            shares::create(db, &org_a, s, &sub, "owner").await?;
            if rng.chance(20) {
                shares::revoke(db, &org_a, s, &sub).await?;
            }
        }
    }
    let mut sessions_b = Vec::new();
    for u in &users_b {
        let agent = assistants_b.first().cloned().unwrap_or_default();
        let s = session(db, u, &org_b, &agent).await?;
        shares::create(db, &org_b, &s, &subject(SubjectType::Org, &org_b), u).await?;
        sessions_b.push(s);
    }
    if let (Some(s), Some(b_unit)) = (sessions_a.first(), units_b.first()) {
        for u in &users_a {
            raw_share(db, &org_b, s, "user", u).await?;
        }
        raw_share(db, &org_a, s, "unit", b_unit).await?;
    }
    if let Some(s) = sessions_b.first() {
        raw_share(db, &org_a, s, "org", &org_a).await?;
    }

    let mut assistants = assistants_a;
    assistants.extend(assistants_b);
    assistants.extend([built_in, orgless]);
    let mut sessions = sessions_a;
    sessions.extend(sessions_b);
    Ok(World {
        org_a,
        org_b,
        users_a,
        assistants,
        sessions,
    })
}

#[tokio::test]
async fn sql_visibility_equals_authorize_over_every_pair() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (mut allowed, mut denied, mut shared, mut unshared) = (0, 0, 0, 0);
    for seed in [7_u64, 1_234_567, 99_991] {
        let w = world(&db, seed).await?;
        let universe: BTreeSet<&str> = w.assistants.iter().map(String::as_str).collect();
        let chats: BTreeSet<&str> = w.sessions.iter().map(String::as_str).collect();
        for u in &w.users_a {
            let p = access::principal(&db, u, &w.org_a)
                .await?
                .ok_or("a member has a principal")?;

            let rows = access::visible_assistants(&db, &p).await?;
            for r in &rows {
                assert!(
                    r.is_built_in || r.organization_id.as_deref() == Some(w.org_a.as_str()),
                    "seed {seed}: {} of another org is listed",
                    r.id
                );
            }
            let sql: BTreeSet<&str> = rows
                .iter()
                .map(|r| r.id.as_str())
                .filter(|id| universe.contains(id))
                .collect();
            let mut pure = BTreeSet::new();
            for a in &w.assistants {
                let agent = grants::agent_ref(&db, &w.org_a, a).await?;
                if authorize(&p, Permission::AgentsUse, &Resource::Agent(&agent)) == Decision::Allow
                {
                    pure.insert(a.as_str());
                    allowed += 1;
                } else {
                    denied += 1;
                }
            }
            assert_eq!(
                sql, pure,
                "seed {seed}: agents of user {u} (role {:?})",
                p.role
            );

            let sql_chats: BTreeSet<String> = access::sessions_shared_with(&db, &p)
                .await?
                .into_iter()
                .map(|s| s.id)
                .filter(|id| chats.contains(id.as_str()))
                .collect();
            let mut pure_chats = BTreeSet::new();
            for s in &w.sessions {
                let Ok(chat) = shares::chat_ref(&db, &w.org_a, s).await else {
                    continue;
                };
                if chat.owner_id != p.user_id
                    && authorize(&p, Permission::ChatsReadShared, &Resource::Chat(&chat))
                        == Decision::Allow
                {
                    pure_chats.insert(s.clone());
                    shared += 1;
                } else {
                    unshared += 1;
                }
            }
            assert_eq!(sql_chats, pure_chats, "seed {seed}: chats shared with {u}");
        }
        assert!(!w.org_b.is_empty());
    }
    // The comparison only means something if both answers occur often.
    assert!(
        allowed > 50 && denied > 50,
        "allowed {allowed}, denied {denied}"
    );
    assert!(
        shared > 10 && unshared > 10,
        "shared {shared}, unshared {unshared}"
    );
    Ok(())
}

#[tokio::test]
async fn another_orgs_grants_units_and_shares_never_leak() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (a, b) = (org(&db).await?, org(&db).await?);
    let (dual, b_only) = (user(&db).await?, user(&db).await?);
    member(&db, &dual, &a, "member").await?;
    member(&db, &dual, &b, "member").await?;
    member(&db, &b_only, &b, "member").await?;
    let unit = |slug: &'static str| NewUnit {
        parent_id: None,
        kind: UnitKind::Team,
        name: slug,
        slug,
        external_id: None,
    };
    let a_unit = units::create(&db, &a, &unit("ua")).await?.id;
    let b_unit = units::create(&db, &b, &unit("ub")).await?.id;
    let a_agent = assistant(&db, &a, "x").await?;
    let b_agent = assistant(&db, &b, "x").await?;
    let b_session = session(&db, &b_only, &b, &b_agent).await?;
    let a_session = session(&db, &dual, &a, &a_agent).await?;

    // Positive controls: each write succeeds inside its own org.
    units::add_member(&db, &b, &b_unit, &dual, false, MemberSource::Manual).await?;
    grants::set(
        &db,
        &b,
        &b_agent,
        &subject(SubjectType::Unit, &b_unit),
        GrantLevel::Use,
        "x",
    )
    .await?;
    shares::create(
        &db,
        &b,
        &b_session,
        &subject(SubjectType::User, &dual),
        &b_only,
    )
    .await?;
    let in_b = access::principal(&db, &dual, &b)
        .await?
        .ok_or("member of b")?;
    assert!(
        access::visible_assistants(&db, &in_b)
            .await?
            .iter()
            .any(|r| r.id == b_agent)
    );
    assert!(
        access::sessions_shared_with(&db, &in_b)
            .await?
            .iter()
            .any(|s| s.id == b_session)
    );

    // The same user acting in A sees none of it.
    let in_a = access::principal(&db, &dual, &a)
        .await?
        .ok_or("member of a")?;
    assert!(
        in_a.reach().is_empty(),
        "B's unit is not in A's reach: {:?}",
        in_a.reach()
    );
    assert!(
        !access::visible_assistants(&db, &in_a)
            .await?
            .iter()
            .any(|r| r.id == b_agent)
    );
    assert!(access::sessions_shared_with(&db, &in_a).await?.is_empty());
    let b_ref = grants::agent_ref(&db, &a, &b_agent).await?;
    assert_eq!(
        authorize(&in_a, Permission::AgentsUse, &Resource::Agent(&b_ref)),
        Decision::NotFound
    );
    assert!(
        b_ref.grants.is_empty(),
        "B's grants are not loaded for a caller in A"
    );

    // Writes from A never name B's things, and are told they do not exist.
    let nf = |r: Result<_, StoreError>| matches!(r, Err(StoreError::NotFound));
    assert!(nf(grants::set(
        &db,
        &a,
        &a_agent,
        &subject(SubjectType::Unit, &b_unit),
        GrantLevel::Use,
        "x"
    )
    .await
    .map(drop)));
    assert!(nf(grants::set(
        &db,
        &a,
        &a_agent,
        &subject(SubjectType::User, &b_only),
        GrantLevel::Use,
        "x"
    )
    .await
    .map(drop)));
    assert!(nf(grants::set(
        &db,
        &a,
        &a_agent,
        &subject(SubjectType::Org, &b),
        GrantLevel::Use,
        "x"
    )
    .await
    .map(drop)));
    assert!(nf(grants::set(
        &db,
        &a,
        &b_agent,
        &subject(SubjectType::Org, &a),
        GrantLevel::Use,
        "x"
    )
    .await
    .map(drop)));
    assert!(grants::list(&db, &a, &b_agent).await?.is_empty());
    assert!(nf(shares::create(
        &db,
        &a,
        &b_session,
        &subject(SubjectType::Org, &a),
        "x"
    )
    .await
    .map(drop)));
    assert!(nf(shares::create(
        &db,
        &a,
        &a_session,
        &subject(SubjectType::Unit, &b_unit),
        "x"
    )
    .await
    .map(drop)));
    assert!(nf(units::create(
        &db,
        &a,
        &NewUnit {
            parent_id: Some(&b_unit),
            ..unit("child")
        }
    )
    .await
    .map(drop)));
    assert!(nf(units::move_to(&db, &a, &a_unit, Some(&b_unit))
        .await
        .map(drop)));
    assert!(nf(units::move_to(&db, &a, &b_unit, None).await.map(drop)));
    assert!(nf(units::add_member(
        &db,
        &a,
        &b_unit,
        &dual,
        false,
        MemberSource::Manual
    )
    .await
    .map(drop)));
    assert!(nf(units::add_member(
        &db,
        &a,
        &a_unit,
        &b_only,
        false,
        MemberSource::Manual
    )
    .await
    .map(drop)));
    assert!(nf(units::delete(&db, &a, &b_unit).await));
    assert!(nf(grants::revoke(
        &db,
        &a,
        &b_agent,
        &subject(SubjectType::Unit, &b_unit)
    )
    .await));
    assert!(nf(shares::revoke(
        &db,
        &a,
        &b_session,
        &subject(SubjectType::User, &dual)
    )
    .await));
    assert!(
        units::list(&db, &a)
            .await?
            .iter()
            .all(|u| u.organization_id == a)
    );
    assert!(units::members(&db, &a, &b_unit).await?.is_empty());
    assert!(
        shares::list_for_session(&db, &a, &b_session)
            .await?
            .is_empty()
    );
    assert!(access::principal(&db, &b_only, &a).await?.is_none());
    // Positive control for the writes above: the same calls inside A succeed.
    units::add_member(&db, &a, &a_unit, &dual, true, MemberSource::Manual).await?;
    grants::set(
        &db,
        &a,
        &a_agent,
        &subject(SubjectType::Unit, &a_unit),
        GrantLevel::Use,
        "x",
    )
    .await?;
    let in_a = access::principal(&db, &dual, &a)
        .await?
        .ok_or("member of a")?;
    assert!(
        access::visible_assistants(&db, &in_a)
            .await?
            .iter()
            .any(|r| r.id == a_agent)
    );
    Ok(())
}
