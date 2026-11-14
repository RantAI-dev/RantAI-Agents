//! The seed of the chat-sharing route tests: organisations, units, memberships, agents and
//! chats (`docs/design/identity-and-access.md` §3.4).
//!
//! Included by `chat_sharing.rs`. Every test makes its own rows with fresh ids, so the shared
//! test database is never reset.

#![allow(dead_code, reason = "the test binary uses a subset per test")]

use agents_core::authz::{GrantLevel, MemberSource, Subject, SubjectType, UnitKind};
use agents_store::units::{self, NewUnit};
use agents_store::{PgPool, new_id};

use super::common;

/// An organisation row; returns its id.
pub async fn org(db: &PgPool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt")
           VALUES ($1,'t',$1,now(),now())"#,
    )
    .bind(&id)
    .execute(db)
    .await?;
    Ok(id)
}

/// A user who is an accepted member of `org_id` with `role`; returns their id.
pub async fn member_of(db: &PgPool, org_id: &str, role: &str) -> Result<String, sqlx::Error> {
    let id = common::user(db, false).await?;
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,$4,now())"#,
    )
    .bind(new_id())
    .bind(&id)
    .bind(org_id)
    .bind(role)
    .execute(db)
    .await?;
    Ok(id)
}

/// A department or a team, under `parent` when one is named; returns its id.
pub async fn unit(
    db: &PgPool,
    org_id: &str,
    parent: Option<&str>,
    kind: UnitKind,
    slug: &str,
) -> Result<String, agents_store::StoreError> {
    Ok(units::create(
        db,
        org_id,
        &NewUnit {
            parent_id: parent,
            kind,
            name: slug,
            slug,
            external_id: None,
        },
        None,
    )
    .await?
    .id)
}

/// Puts a user in a unit.
pub async fn unit_member(
    db: &PgPool,
    org_id: &str,
    unit_id: &str,
    user_id: &str,
) -> Result<(), agents_store::StoreError> {
    units::add_member(
        db,
        org_id,
        unit_id,
        user_id,
        false,
        MemberSource::Manual,
        None,
    )
    .await?;
    Ok(())
}

/// An agent of an organisation; returns its id.
pub async fn assistant(db: &PgPool, organization_id: Option<&str>) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Assistant" ("id","name","systemPrompt","model","organizationId","isBuiltIn",
             "knowledgeBaseGroupIds","openingQuestions","tags","createdAt","updatedAt")
           VALUES ($1,'Test Agent','You are a test assistant.','rantai/nano',$2,false,'{}','{}','{}',now(),now())"#,
    )
    .bind(&id)
    .bind(organization_id)
    .execute(db)
    .await?;
    Ok(id)
}

/// Gives `subject` the `use` permission on an agent.
pub async fn grant_use(
    db: &PgPool,
    org_id: &str,
    assistant_id: &str,
    subject: Subject,
) -> Result<(), agents_store::StoreError> {
    agents_store::grants::set(db, org_id, assistant_id, &subject, GrantLevel::Use, "test").await?;
    Ok(())
}

/// A chat of `owner` in `org_id` (or with no organisation); returns its id.
pub async fn session(
    db: &PgPool,
    owner: &str,
    org_id: Option<&str>,
    assistant_id: &str,
    title: &str,
) -> Result<String, agents_store::StoreError> {
    Ok(
        agents_store::sessions::create_session(db, owner, org_id, assistant_id, title)
            .await?
            .id,
    )
}

/// A share to a unit.
pub fn unit_subject(unit_id: &str) -> Subject {
    Subject {
        kind: SubjectType::Unit,
        id: unit_id.to_owned(),
    }
}

/// A share to a user.
pub fn user_subject(user_id: &str) -> Subject {
    Subject {
        kind: SubjectType::User,
        id: user_id.to_owned(),
    }
}
