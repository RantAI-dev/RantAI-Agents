//! Integration tests against a database migrated with `bunx prisma migrate deploy`.
//! Set `TEST_DATABASE_URL`; without it each test prints why it skipped and passes.

use agents_store::assistants::{self, AssistantFields, Binding};
use agents_store::memory::{self, MemoryType};
use agents_store::{PgPool, StoreError, new_id};
use serde_json::json;

type R = Result<(), Box<dyn std::error::Error>>;

async fn db() -> Result<Option<PgPool>, sqlx::Error> {
    match std::env::var("TEST_DATABASE_URL") {
        Ok(url) if !url.is_empty() => Ok(Some(PgPool::connect(&url).await?)),
        _ if std::env::var_os("CI").is_some() => Err(sqlx::Error::Configuration(
            "TEST_DATABASE_URL must be set in CI: these tests may not skip there".into(),
        )),
        _ => {
            eprintln!("skipped: TEST_DATABASE_URL is not set");
            Ok(None)
        }
    }
}

async fn org(db: &PgPool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(r#"INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt") VALUES ($1,'t',$1,now(),now())"#)
        .bind(&id)
        .execute(db)
        .await?;
    Ok(id)
}

fn fields(name: &str) -> AssistantFields {
    AssistantFields {
        name: name.to_owned(),
        emoji: "🤖".to_owned(),
        system_prompt: "You are a helpful test assistant.".to_owned(),
        model: "openrouter/free".to_owned(),
        memory_config: Some(json!({"enabled": true})),
        tags: vec!["a".to_owned()],
        ..AssistantFields::default()
    }
}

#[tokio::test]
async fn assistant_crud_and_tenant_listing() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (a, b) = (org(&db).await?, org(&db).await?);
    let mine = assistants::create(&db, &a, "u1", &fields("mine")).await?;
    let theirs = assistants::create(&db, &b, "u2", &fields("theirs")).await?;

    let visible = assistants::list_for_org(&db, &a).await?;
    assert!(
        visible.iter().any(|r| r.id == mine.id),
        "owner sees its own assistant"
    );
    assert!(
        !visible.iter().any(|r| r.id == theirs.id),
        "another org's assistant is not listed"
    );

    let mut f = AssistantFields::from(&mine);
    f.name = "renamed".to_owned();
    let updated = assistants::update(&db, &mine.id, "u1", &f, mine.updated_at).await?;
    assert_eq!(updated.name, "renamed");
    assert_eq!(updated.updated_by.as_deref(), Some("u1"));

    // A stale version is a conflict, not a silent overwrite.
    let stale = assistants::update(&db, &mine.id, "u1", &f, mine.updated_at).await;
    assert!(matches!(stale, Err(StoreError::Conflict)));

    assistants::delete(&db, &mine.id).await?;
    assert!(matches!(
        assistants::get(&db, &mine.id).await,
        Err(StoreError::NotFound)
    ));
    Ok(())
}

#[tokio::test]
async fn bindings_replace_and_skill_priority() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let o = org(&db).await?;
    let a = assistants::create(&db, &o, "u1", &fields("b")).await?;
    let (s1, s2) = (new_id(), new_id());
    for s in [&s1, &s2] {
        sqlx::query(
            r#"INSERT INTO "Skill" ("id","name","displayName","description","content","source","organizationId","createdAt","updatedAt")
               VALUES ($1,$1,'d','d','c','custom',$2,now(),now())"#,
        )
        .bind(s)
        .bind(&o)
        .execute(&db)
        .await?;
    }
    assistants::replace_bindings(
        &db,
        &a.id,
        Binding::Skill,
        &[s2.clone(), s1.clone(), s2.clone()],
    )
    .await?;
    let got = assistants::list_bindings(&db, &a.id, Binding::Skill).await?;
    let ids: Vec<&str> = got.iter().map(|b| b.target_id.as_str()).collect();
    assert_eq!(
        ids,
        vec![s2.as_str(), s1.as_str()],
        "order kept, duplicate dropped"
    );

    assistants::replace_bindings(&db, &a.id, Binding::Skill, &[]).await?;
    assert!(
        assistants::list_bindings(&db, &a.id, Binding::Skill)
            .await?
            .is_empty()
    );
    Ok(())
}

#[tokio::test]
async fn default_is_per_organisation() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (a, b) = (org(&db).await?, org(&db).await?);
    let da = assistants::create(&db, &a, "u1", &fields("da")).await?;
    let db_ = assistants::create(&db, &b, "u2", &fields("db")).await?;
    assistants::set_org_default(&db, &a, &da.id).await?;
    assistants::set_org_default(&db, &b, &db_.id).await?;
    assert!(
        assistants::get(&db, &da.id).await?.is_system_default,
        "org B's default must not clear org A's"
    );

    let picked = resolved(&db, "nobody", &a).await?;
    assert_eq!(picked.assistant.map(|r| r.id), Some(da.id.clone()));

    // A preference pointing at another org's assistant is ignored.
    assistants::set_user_default(&db, "u9", Some(&db_.id)).await?;
    let picked = resolved(&db, "u9", &a).await?;
    assert_eq!(picked.assistant.map(|r| r.id), Some(da.id));
    Ok(())
}

/// The default an owner of `org` resolves to: an owner holds every grant-free permission.
async fn resolved(
    db: &agents_store::PgPool,
    user_id: &str,
    org: &str,
) -> Result<agents_store::assistants::ResolvedDefault, agents_store::StoreError> {
    let principal = agents_core::authz::Principal::new(
        user_id,
        org,
        agents_core::org::OrgRole::Owner,
        false,
        Vec::new(),
        &agents_core::authz::UnitTree::default(),
    );
    agents_store::access::resolve_default(db, &principal).await
}

#[tokio::test]
async fn concurrent_profile_writers_lose_nothing() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let user = format!("u_{}", new_id());
    const N: usize = 16;
    let mut set = tokio::task::JoinSet::new();
    for i in 0..N {
        let db = db.clone();
        let user = user.clone();
        set.spawn(async move {
            memory::update_profile(&db, &user, |current| {
                let mut value = current.cloned().unwrap_or_else(|| json!({"facts": []}));
                if let Some(facts) = value.get_mut("facts").and_then(|f| f.as_array_mut()) {
                    facts.push(json!(format!("fact {i}")));
                }
                Ok(Some(value))
            })
            .await
        });
    }
    while let Some(done) = set.join_next().await {
        done??;
    }
    let (value, _) = memory::load_profile(&db, &user)
        .await?
        .ok_or("no profile")?;
    let n = value
        .get("facts")
        .and_then(|f| f.as_array())
        .map_or(0, Vec::len);
    assert_eq!(n, N, "every concurrent write must survive");
    Ok(())
}

#[tokio::test]
async fn a_profile_update_that_writes_nothing_leaves_no_row() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let user = format!("u_{}", new_id());
    let stored = memory::update_profile(&db, &user, |current| {
        assert!(current.is_none(), "a new user has no profile");
        Ok(None)
    })
    .await?;
    assert!(stored.is_none());
    assert!(memory::load_profile(&db, &user).await?.is_none());
    Ok(())
}

#[tokio::test]
async fn memory_delete_is_scoped_to_owner() -> R {
    let Some(db) = db().await? else { return Ok(()) };
    let (u1, u2) = (format!("u_{}", new_id()), format!("u_{}", new_id()));
    let id = memory::insert_raw(&db, &u1, MemoryType::Working, "k", &json!({})).await?;
    assert!(
        matches!(
            memory::delete_one(&db, &u2, &id).await,
            Err(StoreError::NotFound)
        ),
        "other user cannot delete"
    );
    assert_eq!(
        memory::list(&db, &u1, None, 100).await?.len(),
        1,
        "row still there"
    );
    memory::delete_one(&db, &u1, &id).await?;
    assert!(
        memory::list(&db, &u1, Some(MemoryType::Working), 100)
            .await?
            .is_empty()
    );
    Ok(())
}
