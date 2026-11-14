//! The unit tree in the database: writes keep it a tree, also under concurrent moves.
//!
//! Set `TEST_DATABASE_URL` to a migrated database; without it each test skips (and fails in CI).

mod authz_common;

use std::sync::Arc;

use agents_core::authz::{GrantLevel, MemberSource, Subject, SubjectType, UnitKind};
use agents_store::units::{self, NewUnit};
use agents_store::{StoreError, grants, shares};
use authz_common::*;
use tokio::sync::Barrier;

fn new_unit<'a>(parent_id: Option<&'a str>, slug: &'a str) -> NewUnit<'a> {
    NewUnit {
        parent_id,
        kind: UnitKind::Team,
        name: slug,
        slug,
        external_id: None,
    }
}

#[tokio::test]
async fn unit_writes_keep_a_tree_and_clean_up_after_themselves() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let org_id = org(&db).await?;
    let dept = units::create(
        &db,
        &org_id,
        &NewUnit {
            kind: UnitKind::Department,
            ..new_unit(None, "eng")
        },
        None,
    )
    .await?;
    let team = units::create(&db, &org_id, &new_unit(Some(&dept.id), "web"), None).await?;
    let sub = units::create(&db, &org_id, &new_unit(Some(&team.id), "frontend"), None).await?;
    assert_eq!(team.parent_id.as_deref(), Some(dept.id.as_str()));

    // Slugs are unique among siblings, at the top level too (where the index cannot see it).
    assert!(matches!(
        units::create(&db, &org_id, &new_unit(None, "eng"), None).await,
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        units::create(&db, &org_id, &new_unit(Some(&dept.id), "web"), None).await,
        Err(StoreError::Conflict)
    ));
    units::create(&db, &org_id, &new_unit(Some(&team.id), "web"), None).await?;

    // No move closes a loop: under itself, under a child, under a grandchild.
    for parent in [&dept.id, &team.id, &sub.id] {
        assert!(matches!(
            units::move_to(&db, &org_id, &dept.id, Some(parent), None).await,
            Err(StoreError::Conflict)
        ));
    }
    // A legal move (positive control) and back to the top level.
    let moved = units::move_to(&db, &org_id, &sub.id, Some(&dept.id), None).await?;
    assert_eq!(moved.parent_id.as_deref(), Some(dept.id.as_str()));
    units::move_to(&db, &org_id, &sub.id, None, None).await?;
    let tree = units::tree(&db, &org_id).await?;
    assert_eq!(tree.ancestors(&team.id), vec![dept.id.clone()]);
    assert!(tree.descendants(&dept.id).contains(&team.id));

    // Delete: a unit with children stays; a leaf goes with its members, grants and shares.
    assert!(matches!(
        units::delete(&db, &org_id, &dept.id, None).await,
        Err(StoreError::Conflict)
    ));
    let u = user(&db).await?;
    member(&db, &u, &org_id, "member").await?;
    units::add_member(&db, &org_id, &sub.id, &u, false, MemberSource::Manual, None).await?;
    let agent = assistant(&db, &org_id, &u).await?;
    let on_unit = Subject {
        kind: SubjectType::Unit,
        id: sub.id.clone(),
    };
    grants::set(&db, &org_id, &agent, &on_unit, GrantLevel::Use, &u).await?;
    let chat = session(&db, &u, &org_id, &agent).await?;
    shares::create(&db, &org_id, &chat, &on_unit, &u).await?;
    units::delete(&db, &org_id, &sub.id, None).await?;
    assert!(grants::list(&db, &org_id, &agent).await?.is_empty());
    assert!(
        shares::list_for_session(&db, &org_id, &chat)
            .await?
            .is_empty()
    );
    assert!(units::memberships_of(&db, &org_id, &u).await?.is_empty());
    assert!(matches!(
        units::get(&db, &org_id, &sub.id).await,
        Err(StoreError::NotFound)
    ));

    // Deleting the organisation cascades through a whole tree (the parent key is NO ACTION).
    sqlx::query(r#"DELETE FROM "Organization" WHERE "id" = $1"#)
        .bind(&org_id)
        .execute(&db)
        .await?;
    assert!(units::list(&db, &org_id).await?.is_empty());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn concurrent_moves_cannot_make_a_cycle() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (mut refused, mut done) = (0, 0);
    for round in 0..12_u64 {
        let org_id = org(&db).await?;
        let mut ids = Vec::new();
        for i in 0..6 {
            ids.push(
                units::create(&db, &org_id, &new_unit(None, &format!("u{i}")), None)
                    .await?
                    .id,
            );
        }
        // Every ordered pair at once: (a under b) races (b under a), and longer loops form too.
        let mut moves = Vec::new();
        for a in &ids {
            for b in &ids {
                if a != b {
                    moves.push((a.clone(), b.clone()));
                }
            }
        }
        let mut rng = Rng(round + 1);
        for i in (1..moves.len()).rev() {
            moves.swap(i, rng.below(i + 1));
        }
        let barrier = Arc::new(Barrier::new(moves.len()));
        let mut tasks = tokio::task::JoinSet::new();
        for (unit, parent) in moves {
            let (db, org_id, barrier) = (db.clone(), org_id.clone(), barrier.clone());
            tasks.spawn(async move {
                barrier.wait().await;
                units::move_to(&db, &org_id, &unit, Some(&parent), None).await
            });
        }
        while let Some(result) = tasks.join_next().await {
            match result? {
                Ok(_) => done += 1,
                Err(StoreError::Conflict) => refused += 1,
                Err(e) => return Err(e.into()),
            }
        }
        // `tree` fails on a cycle: following parents must end at the top level for every unit.
        let tree = units::tree(&db, &org_id)
            .await
            .map_err(|e| format!("round {round}: {e}"))?;
        for id in &ids {
            assert!(
                !tree.ancestors(id).contains(id),
                "round {round}: {id} is its own ancestor"
            );
        }
    }
    // Both outcomes happened, so the race was real and the check fired.
    assert!(done > 0 && refused > 0, "done {done}, refused {refused}");
    Ok(())
}
