//! Fixtures for the organisation admin route tests: an organisation, its members and its units.
//!
//! Every test makes its own rows with fresh ids, so the shared test database is never reset.

#![allow(dead_code, reason = "each test binary uses a different subset")]

use agents_core::authz::UnitKind;
use agents_store::units::{self, NewUnit};
use agents_store::{PgPool, new_id};

pub type R = Result<(), Box<dyn std::error::Error>>;

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

/// An accepted membership of a user in an organisation.
pub async fn member(
    db: &PgPool,
    user_id: &str,
    org_id: &str,
    role: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","organizationId","role","acceptedAt")
           VALUES ($1,$2,$2 || '@test.invalid',$3,$4,now())"#,
    )
    .bind(new_id())
    .bind(user_id)
    .bind(org_id)
    .bind(role)
    .execute(db)
    .await?;
    Ok(())
}

/// The id of the membership row of a user in an organisation.
pub async fn member_id(db: &PgPool, org_id: &str, user_id: &str) -> Result<String, sqlx::Error> {
    sqlx::query_scalar::<_, String>(
        r#"SELECT "id" FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2"#,
    )
    .bind(org_id)
    .bind(user_id)
    .fetch_one(db)
    .await
}

/// A unit; returns its id.
pub async fn unit(
    db: &PgPool,
    org_id: &str,
    parent_id: Option<&str>,
    slug: &str,
) -> Result<String, agents_store::StoreError> {
    unit_of_kind(db, org_id, parent_id, slug, UnitKind::Team).await
}

/// A unit of a named kind; returns its id.
pub async fn unit_of_kind(
    db: &PgPool,
    org_id: &str,
    parent_id: Option<&str>,
    slug: &str,
    kind: UnitKind,
) -> Result<String, agents_store::StoreError> {
    Ok(units::create(
        db,
        org_id,
        &NewUnit {
            parent_id,
            kind,
            name: slug,
            slug,
            external_id: None,
        },
    )
    .await?
    .id)
}

/// Puts a user in a unit; `is_lead` gives them the unit and everything below it.
pub async fn unit_member(
    db: &PgPool,
    org_id: &str,
    unit_id: &str,
    user_id: &str,
    is_lead: bool,
) -> Result<(), agents_store::StoreError> {
    units::add_member(
        db,
        org_id,
        unit_id,
        user_id,
        is_lead,
        agents_core::authz::MemberSource::Manual,
    )
    .await?;
    Ok(())
}
