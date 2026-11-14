//! Fixtures shared by the `authz*` integration tests. Every test makes its own organisations
//! with fresh ids, so the shared test database is never reset.

#![allow(dead_code, reason = "each test binary uses a different subset")]

use agents_store::assistants::{self, AssistantFields};
use agents_store::{PgPool, new_id, sessions};

pub type R = Result<(), Box<dyn std::error::Error>>;

pub async fn db() -> Result<Option<PgPool>, sqlx::Error> {
    match std::env::var("TEST_DATABASE_URL") {
        Ok(url) if !url.is_empty() => Ok(Some(
            sqlx::postgres::PgPoolOptions::new()
                .max_connections(40)
                .connect(&url)
                .await?,
        )),
        _ if std::env::var_os("CI").is_some() => Err(sqlx::Error::Configuration(
            "TEST_DATABASE_URL must be set in CI: these tests may not skip there".into(),
        )),
        _ => {
            eprintln!("skipped: TEST_DATABASE_URL is not set");
            Ok(None)
        }
    }
}

pub async fn org(db: &PgPool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(r#"INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt") VALUES ($1,'t',$1,now(),now())"#)
        .bind(&id)
        .execute(db)
        .await?;
    Ok(id)
}

/// A user with no password: an SSO-only account, which the schema now allows.
pub async fn user(db: &PgPool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Agent" ("id","email","name","updatedAt") VALUES ($1, $1 || '@authz.test', 'u', now())"#,
    )
    .bind(&id)
    .execute(db)
    .await?;
    Ok(id)
}

/// An accepted membership.
pub async fn member(
    db: &PgPool,
    user_id: &str,
    org_id: &str,
    role: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@authz.test',$3,$4,now())"#,
    )
    .bind(new_id())
    .bind(user_id)
    .bind(org_id)
    .bind(role)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn assistant(
    db: &PgPool,
    org_id: &str,
    by: &str,
) -> Result<String, agents_store::StoreError> {
    let f = AssistantFields {
        name: "a".to_owned(),
        emoji: "🤖".to_owned(),
        system_prompt: "You are a test assistant.".to_owned(),
        model: "openrouter/free".to_owned(),
        ..AssistantFields::default()
    };
    Ok(assistants::create(db, org_id, by, &f).await?.id)
}

/// A global assistant: built in, or org-less and not built in.
pub async fn global_assistant(
    db: &PgPool,
    built_in: bool,
) -> Result<String, Box<dyn std::error::Error>> {
    let holder = org(db).await?;
    let id = assistant(db, &holder, "system").await?;
    sqlx::query(
        r#"UPDATE "Assistant" SET "organizationId" = NULL, "isBuiltIn" = $2 WHERE "id" = $1"#,
    )
    .bind(&id)
    .bind(built_in)
    .execute(db)
    .await?;
    Ok(id)
}

/// A session of `user_id` in `org_id`.
pub async fn session(
    db: &PgPool,
    user_id: &str,
    org_id: &str,
    assistant_id: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let s = sessions::create_session(db, user_id, assistant_id, "t").await?;
    sqlx::query(r#"UPDATE "DashboardSession" SET "organizationId" = $2 WHERE "id" = $1"#)
        .bind(&s.id)
        .bind(org_id)
        .execute(db)
        .await?;
    Ok(s.id)
}

/// Writes a grant row directly, skipping the store's checks: what a bug or a bad import could
/// leave behind. The SQL filters must still ignore it.
pub async fn raw_grant(
    db: &PgPool,
    row_org: &str,
    assistant_id: &str,
    subject_type: &str,
    subject_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "AssistantGrant" ("id","organizationId","assistantId","subjectType","subjectId","level","grantedBy","updatedAt")
           VALUES ($1,$2,$3,$4,$5,'use','rogue',now()) ON CONFLICT DO NOTHING"#,
    )
    .bind(new_id())
    .bind(row_org)
    .bind(assistant_id)
    .bind(subject_type)
    .bind(subject_id)
    .execute(db)
    .await?;
    Ok(())
}

/// The same for a share row.
pub async fn raw_share(
    db: &PgPool,
    row_org: &str,
    session_id: &str,
    subject_type: &str,
    subject_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "ChatShare" ("id","organizationId","sessionId","subjectType","subjectId","sharedBy","updatedAt")
           VALUES ($1,$2,$3,$4,$5,'rogue',now()) ON CONFLICT DO NOTHING"#,
    )
    .bind(new_id())
    .bind(row_org)
    .bind(session_id)
    .bind(subject_type)
    .bind(subject_id)
    .execute(db)
    .await?;
    Ok(())
}

/// A raw membership of a user in a unit of `org_id`, for a user who may not be in that org.
pub async fn raw_unit_member(
    db: &PgPool,
    org_id: &str,
    unit_id: &str,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OrgUnitMember" ("organizationId","unitId","userId","updatedAt")
           VALUES ($1,$2,$3,now()) ON CONFLICT DO NOTHING"#,
    )
    .bind(org_id)
    .bind(unit_id)
    .bind(user_id)
    .execute(db)
    .await?;
    Ok(())
}

/// A small deterministic generator (no new crates); a failing seed is printed and replayable.
pub struct Rng(pub u64);

impl Rng {
    pub fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    pub fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n.max(1) as u64)).unwrap_or(0)
    }

    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> Option<&'a T> {
        items.get(self.below(items.len()))
    }

    pub fn chance(&mut self, percent: usize) -> bool {
        self.below(100) < percent
    }
}
