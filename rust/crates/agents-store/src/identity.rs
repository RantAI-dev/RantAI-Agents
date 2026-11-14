//! `IdentityProvider`: the SSO providers of an organisation.
//!
//! Every admin function takes the organisation id and scopes by it; another organisation's
//! provider is `None` or `NotFound`. Access rules live in `agents_core::authz`: callers check
//! first. The sign-in itself is in [`crate::sso_login`].
//!
//! An email domain belongs to one organisation: a provider may not claim a domain another
//! organisation's provider already claims. Creates and updates take one advisory lock for that
//! check, so two organisations cannot claim the same domain at the same moment.

use chrono::NaiveDateTime;
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};

use crate::{StoreError, StoreResult, new_id, now};

#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
#[sqlx(rename_all = "camelCase")]
pub struct ProviderRow {
    pub id: String,
    pub organization_id: String,
    /// `oidc` or `saml`.
    pub kind: String,
    pub name: String,
    pub enabled: bool,
    /// The provider's settings. Secrets inside are encrypted like a `Credential`.
    pub config: Value,
    /// Lower case.
    pub email_domains: Vec<String>,
    pub jit_provisioning: bool,
    pub default_role: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// The fields a create or an update writes.
#[derive(Debug, Clone, PartialEq)]
pub struct ProviderWrite<'a> {
    pub kind: &'a str,
    pub name: &'a str,
    pub enabled: bool,
    pub config: &'a Value,
    pub email_domains: &'a [String],
    pub jit_provisioning: bool,
    pub default_role: &'a str,
}

pub(crate) const PROVIDER_COLUMNS: &str = r#""id","organizationId","kind","name","enabled","config","emailDomains","jitProvisioning","defaultRole","createdAt","updatedAt""#;

/// The database's clock, as Prisma stores an instant (UTC, milliseconds). The SSO flow and the
/// login that finishes it both read this clock, so their order does not depend on which
/// instance's clock is right.
pub async fn db_now(db: &PgPool) -> StoreResult<NaiveDateTime> {
    Ok(sqlx::query_scalar::<_, NaiveDateTime>(
        "SELECT date_trunc('milliseconds', now() AT TIME ZONE 'UTC')",
    )
    .fetch_one(db)
    .await?)
}

/// The organisation's providers, oldest first.
pub async fn list(db: &PgPool, org_id: &str) -> StoreResult<Vec<ProviderRow>> {
    let sql = format!(
        r#"SELECT {PROVIDER_COLUMNS} FROM "IdentityProvider" WHERE "organizationId" = $1
           ORDER BY "createdAt" ASC, "id" ASC"#
    );
    Ok(sqlx::query_as::<_, ProviderRow>(&sql)
        .bind(org_id)
        .fetch_all(db)
        .await?)
}

/// One provider of the organisation.
pub async fn get(db: &PgPool, org_id: &str, id: &str) -> StoreResult<Option<ProviderRow>> {
    let sql = format!(
        r#"SELECT {PROVIDER_COLUMNS} FROM "IdentityProvider" WHERE "id" = $1 AND "organizationId" = $2"#
    );
    Ok(sqlx::query_as::<_, ProviderRow>(&sql)
        .bind(id)
        .bind(org_id)
        .fetch_optional(db)
        .await?)
}

/// A provider by id alone, for the sign-in routes, which run before anyone is signed in.
pub async fn find(db: &PgPool, id: &str) -> StoreResult<Option<ProviderRow>> {
    let sql = format!(r#"SELECT {PROVIDER_COLUMNS} FROM "IdentityProvider" WHERE "id" = $1"#);
    Ok(sqlx::query_as::<_, ProviderRow>(&sql)
        .bind(id)
        .fetch_optional(db)
        .await?)
}

/// The enabled providers that claim `domain`, oldest first.
pub async fn for_domain(db: &PgPool, domain: &str) -> StoreResult<Vec<ProviderRow>> {
    let sql = format!(
        r#"SELECT {PROVIDER_COLUMNS} FROM "IdentityProvider"
           WHERE "enabled" = true AND lower($1) = ANY("emailDomains")
           ORDER BY "createdAt" ASC, "id" ASC"#
    );
    Ok(sqlx::query_as::<_, ProviderRow>(&sql)
        .bind(domain)
        .fetch_all(db)
        .await?)
}

/// Whether the organisation has an enabled provider other than `except`.
pub async fn has_enabled(db: &PgPool, org_id: &str, except: &str) -> StoreResult<bool> {
    Ok(sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "IdentityProvider"
             WHERE "organizationId" = $1 AND "enabled" = true AND "id" <> $2)"#,
    )
    .bind(org_id)
    .bind(except)
    .fetch_one(db)
    .await?)
}

async fn lock_domains(tx: &mut Transaction<'_, Postgres>) -> StoreResult<()> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('identity_provider_domains', 0))")
        .execute(&mut **tx)
        .await?;
    Ok(())
}

/// The first of `domains` another organisation's provider already claims.
async fn claimed_elsewhere(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    domains: &[String],
) -> StoreResult<Option<String>> {
    Ok(sqlx::query_scalar::<_, String>(
        r#"SELECT d FROM unnest($2::text[]) AS d
           WHERE EXISTS (SELECT 1 FROM "IdentityProvider" p
                         WHERE p."organizationId" <> $1 AND d = ANY(p."emailDomains"))
           ORDER BY d LIMIT 1"#,
    )
    .bind(org_id)
    .bind(domains)
    .fetch_optional(&mut **tx)
    .await?)
}

/// Why a write was refused.
#[derive(Debug)]
pub enum WriteError {
    /// Another organisation's provider claims this domain.
    DomainTaken(String),
    Store(StoreError),
}

impl From<StoreError> for WriteError {
    fn from(e: StoreError) -> Self {
        Self::Store(e)
    }
}

impl From<sqlx::Error> for WriteError {
    fn from(e: sqlx::Error) -> Self {
        Self::Store(StoreError::Db(e))
    }
}

/// Creates a provider with a new id, or with `id` when the caller fixes it (the provider from
/// the environment).
pub async fn create(
    db: &PgPool,
    org_id: &str,
    id: Option<&str>,
    write: &ProviderWrite<'_>,
) -> Result<ProviderRow, WriteError> {
    let mut tx = db.begin().await?;
    lock_domains(&mut tx).await?;
    if let Some(domain) = claimed_elsewhere(&mut tx, org_id, write.email_domains).await? {
        return Err(WriteError::DomainTaken(domain));
    }
    let ts = now();
    let sql = format!(
        r#"INSERT INTO "IdentityProvider" ({PROVIDER_COLUMNS})
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING {PROVIDER_COLUMNS}"#
    );
    let row = sqlx::query_as::<_, ProviderRow>(&sql)
        .bind(id.map_or_else(new_id, str::to_owned))
        .bind(org_id)
        .bind(write.kind)
        .bind(write.name)
        .bind(write.enabled)
        .bind(write.config)
        .bind(write.email_domains)
        .bind(write.jit_provisioning)
        .bind(write.default_role)
        .bind(ts)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// Replaces a provider's fields. `None` when it is not the organisation's.
pub async fn update(
    db: &PgPool,
    org_id: &str,
    id: &str,
    write: &ProviderWrite<'_>,
) -> Result<Option<ProviderRow>, WriteError> {
    let mut tx = db.begin().await?;
    lock_domains(&mut tx).await?;
    if let Some(domain) = claimed_elsewhere(&mut tx, org_id, write.email_domains).await? {
        return Err(WriteError::DomainTaken(domain));
    }
    let sql = format!(
        r#"UPDATE "IdentityProvider" SET "kind" = $3, "name" = $4, "enabled" = $5, "config" = $6,
             "emailDomains" = $7, "jitProvisioning" = $8, "defaultRole" = $9, "updatedAt" = $10
           WHERE "id" = $1 AND "organizationId" = $2 RETURNING {PROVIDER_COLUMNS}"#
    );
    let row = sqlx::query_as::<_, ProviderRow>(&sql)
        .bind(id)
        .bind(org_id)
        .bind(write.kind)
        .bind(write.name)
        .bind(write.enabled)
        .bind(write.config)
        .bind(write.email_domains)
        .bind(write.jit_provisioning)
        .bind(write.default_role)
        .bind(now())
        .fetch_optional(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(row)
}

/// Deletes a provider and, with the foreign key, the identities linked through it. `false` when
/// it is not the organisation's.
pub async fn delete(db: &PgPool, org_id: &str, id: &str) -> StoreResult<bool> {
    let done =
        sqlx::query(r#"DELETE FROM "IdentityProvider" WHERE "id" = $1 AND "organizationId" = $2"#)
            .bind(id)
            .bind(org_id)
            .execute(db)
            .await?;
    Ok(done.rows_affected() > 0)
}

/// Deletes a provider whatever its organisation: only for the environment's row, when
/// `AUTH_OIDC_ORG_ID` moved it to another organisation.
pub async fn delete_any(db: &PgPool, id: &str) -> StoreResult<()> {
    sqlx::query(r#"DELETE FROM "IdentityProvider" WHERE "id" = $1"#)
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}
