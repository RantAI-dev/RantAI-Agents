//! The seed of the agent RBAC route tests: organisations, units, memberships and grants.
//!
//! Included by `agent_rbac.rs`, `agent_rbac_grants.rs` and `agent_rbac_chat.rs`
//! (`docs/design/identity-and-access.md` §3.3).

#![allow(dead_code, reason = "three test files use parts of it")]

use agents_core::authz::{MemberSource, UnitKind};
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
) -> Result<String, sqlx::Error> {
    let row = units::create(
        db,
        org_id,
        &NewUnit {
            parent_id: parent,
            kind,
            name: slug,
            slug,
            external_id: None,
        },
    )
    .await
    .map_err(store)?;
    Ok(row.id)
}

/// Puts a user in a unit; returns nothing.
pub async fn unit_member(
    db: &PgPool,
    org_id: &str,
    unit_id: &str,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    units::add_member(db, org_id, unit_id, user_id, false, MemberSource::Manual)
        .await
        .map_err(store)?;
    Ok(())
}

/// An assistant of an organisation; returns its id.
pub async fn assistant(db: &PgPool, org_id: &str) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Assistant" ("id","name","systemPrompt","model","organizationId","isBuiltIn",
             "knowledgeBaseGroupIds","openingQuestions","tags","createdAt","updatedAt")
           VALUES ($1,'t','You are a test assistant.','rantai/nano',$2,false,'{}','{}','{}',now(),now())"#,
    )
    .bind(&id)
    .bind(org_id)
    .execute(db)
    .await?;
    Ok(id)
}

/// A built-in assistant; returns its id.
pub async fn built_in(db: &PgPool) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "Assistant" ("id","name","systemPrompt","model","isBuiltIn",
             "knowledgeBaseGroupIds","openingQuestions","tags","createdAt","updatedAt")
           VALUES ($1,'t','You are a test assistant.','rantai/nano',true,'{}','{}','{}',now(),now())"#,
    )
    .bind(&id)
    .execute(db)
    .await?;
    Ok(id)
}

/// A grant on an assistant; returns its id.
pub async fn grant(
    db: &PgPool,
    org_id: &str,
    assistant_id: &str,
    subject_type: &str,
    subject_id: &str,
    level: &str,
) -> Result<String, sqlx::Error> {
    let id = new_id();
    sqlx::query(
        r#"INSERT INTO "AssistantGrant" ("id","organizationId","assistantId","subjectType",
             "subjectId","level","grantedBy","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,'test',now(),now())
           ON CONFLICT ("assistantId","subjectType","subjectId")
             DO UPDATE SET "level" = EXCLUDED."level""#,
    )
    .bind(&id)
    .bind(org_id)
    .bind(assistant_id)
    .bind(subject_type)
    .bind(subject_id)
    .bind(level)
    .execute(db)
    .await?;
    Ok(id)
}

/// The ids a list answer carries (`{"data": [...]}` or a bare array).
pub fn ids(body: &serde_json::Value) -> Vec<String> {
    let items = body
        .get("data")
        .or(Some(body))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    items
        .iter()
        .filter_map(|item| {
            item.get("id")
                .or_else(|| item.get("assistantId"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .collect()
}

fn store(error: agents_store::StoreError) -> sqlx::Error {
    match error {
        agents_store::StoreError::Db(error) => error,
        agents_store::StoreError::NotFound => sqlx::Error::RowNotFound,
        agents_store::StoreError::Conflict => sqlx::Error::Protocol("conflict".to_owned()),
    }
}
