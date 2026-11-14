//! Finishing an SSO sign-in: find or link or create the user, their membership and their
//! identity-provider units, in one transaction.
//!
//! Rules (docs/design/identity-and-access.md §3.5):
//! - An identity is found by `(providerId, subject)`, never by email alone.
//! - An existing user without an identity for this provider is linked only when the provider
//!   asserts the email is verified, the email's domain is one the provider claims, the user is
//!   not a platform admin, and the user is in this organisation or in none. Otherwise the
//!   provider of one organisation could take over an account of another.
//! - With `jitProvisioning` a new user (no password) and their membership are created.
//! - Units with `source = idp` follow the groups claim at every login; manual rows stay.
//!
//! **Replay.** The flow carries the database time it started at. The identity's `lastLoginAt` is
//! moved to now only if it is older than that, under a row lock: a second callback from the same
//! flow (a replayed `state`) finds a login after its start and is refused, and two at once cannot
//! both pass. The flow state itself never touches the server, so this is what makes it single
//! use. A second flow started before the first finished is refused the same way; it starts over.

use chrono::NaiveDateTime;
use serde_json::json;
use sqlx::{PgPool, Postgres, Transaction};

use crate::access::lock_subjects;
use crate::audit::{self, AuditEntry};
use crate::{StoreError, StoreResult, new_id};

/// What the provider asserted, and what the provider allows.
#[derive(Debug, Clone)]
pub struct SsoLogin<'a> {
    pub provider_id: &'a str,
    pub organization_id: &'a str,
    /// The provider's domains, lower case.
    pub email_domains: &'a [String],
    pub jit_provisioning: bool,
    pub default_role: &'a str,
    pub subject: &'a str,
    pub email: &'a str,
    pub email_verified: bool,
    pub name: Option<&'a str>,
    /// The groups claim. `None` when the token had none: the `idp` units are left as they are.
    pub groups: Option<&'a [String]>,
    /// The org role the provider's group mapping gives, if any.
    pub mapped_role: Option<&'a str>,
    /// When the flow started, by [`crate::identity::db_now`].
    pub flow_started_at: NaiveDateTime,
    pub ip_address: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct SignedInUser {
    pub id: String,
    pub email: String,
    pub name: String,
    /// The platform role, `USER` or `ADMIN`.
    pub role: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SsoOutcome {
    SignedIn {
        user: SignedInUser,
        created: bool,
        linked: bool,
    },
    /// The flow already produced a login.
    Replayed,
    /// An account with this email exists and may not be linked to this provider.
    LinkRefused,
    /// No account, and the provider does not create one.
    NotProvisioned,
    Suspended,
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: String,
    email: String,
    name: String,
    role: String,
    suspended: bool,
}

const USER_COLUMNS: &str =
    r#""id","email","name","role"::text AS role,("suspendedAt" IS NOT NULL) AS suspended"#;

/// Signs the user in, or says why not. Nothing is written unless the outcome is `SignedIn`.
pub async fn complete(db: &PgPool, login: &SsoLogin<'_>) -> StoreResult<SsoOutcome> {
    let mut tx = db.begin().await?;
    let now = sqlx::query_scalar::<_, NaiveDateTime>(
        "SELECT date_trunc('milliseconds', now() AT TIME ZONE 'UTC')",
    )
    .fetch_one(&mut *tx)
    .await?;

    let existing = sqlx::query_as::<_, (String, String)>(
        r#"SELECT "id","userId" FROM "UserIdentity" WHERE "providerId" = $1 AND "subject" = $2
           FOR UPDATE"#,
    )
    .bind(login.provider_id)
    .bind(login.subject)
    .fetch_optional(&mut *tx)
    .await?;

    let (user, created, linked) = if let Some((identity_id, user_id)) = existing {
        let moved = sqlx::query(
            r#"UPDATE "UserIdentity" SET "lastLoginAt" = $2, "email" = $3, "updatedAt" = $2
               WHERE "id" = $1 AND ("lastLoginAt" IS NULL OR "lastLoginAt" < $4)"#,
        )
        .bind(&identity_id)
        .bind(now)
        .bind(login.email)
        .bind(login.flow_started_at)
        .execute(&mut *tx)
        .await?;
        if moved.rows_affected() == 0 {
            return Ok(SsoOutcome::Replayed);
        }
        let sql = format!(r#"SELECT {USER_COLUMNS} FROM "Agent" WHERE "id" = $1"#);
        let user = sqlx::query_as::<_, UserRow>(&sql)
            .bind(&user_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::NotFound)?;
        (user, false, false)
    } else {
        let sql = format!(r#"SELECT {USER_COLUMNS} FROM "Agent" WHERE lower("email") = lower($1)"#);
        let by_email = sqlx::query_as::<_, UserRow>(&sql)
            .bind(login.email)
            .fetch_optional(&mut *tx)
            .await?;
        let (user, created) = match by_email {
            Some(user) => {
                if !may_link(&mut tx, login, &user).await? {
                    return Ok(SsoOutcome::LinkRefused);
                }
                (user, false)
            }
            None if login.jit_provisioning => (create_user(&mut tx, login, now).await?, true),
            None => return Ok(SsoOutcome::NotProvisioned),
        };
        let inserted = sqlx::query_scalar::<_, String>(
            r#"INSERT INTO "UserIdentity" ("id","userId","providerId","subject","email","lastLoginAt","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$6,$6)
               ON CONFLICT ("providerId","subject") DO NOTHING RETURNING "id""#,
        )
        .bind(new_id())
        .bind(&user.id)
        .bind(login.provider_id)
        .bind(login.subject)
        .bind(login.email)
        .bind(now)
        .fetch_optional(&mut *tx)
        .await?;
        // Another callback of the same flow created the identity first.
        if inserted.is_none() {
            return Ok(SsoOutcome::Replayed);
        }
        (user, created, !created)
    };

    if user.suspended {
        return Ok(SsoOutcome::Suspended);
    }
    if !ensure_membership(&mut tx, login, &user, now).await? {
        return Ok(SsoOutcome::NotProvisioned);
    }
    if let Some(groups) = login.groups {
        sync_groups(&mut tx, login.organization_id, &user.id, groups, now).await?;
    }
    sqlx::query(r#"UPDATE "Agent" SET "lastActiveAt" = $2 WHERE "id" = $1"#)
        .bind(&user.id)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &AuditEntry {
            organization_id: login.organization_id,
            user_id: Some(&user.id),
            action: "sso.login",
            resource: &format!("user:{}", user.id),
            detail: json!({ "providerId": login.provider_id, "created": created, "linked": linked }),
            ip_address: login.ip_address,
            risk_level: if linked { "medium" } else { "low" },
        },
    )
    .await?;
    tx.commit().await?;
    Ok(SsoOutcome::SignedIn {
        user: SignedInUser {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        },
        created,
        linked,
    })
}

/// The link rule in the module comment.
async fn may_link(
    tx: &mut Transaction<'_, Postgres>,
    login: &SsoLogin<'_>,
    user: &UserRow,
) -> StoreResult<bool> {
    let domain = login
        .email
        .rsplit_once('@')
        .map(|(_, d)| d.to_ascii_lowercase());
    let domain_ok = domain.is_some_and(|d| login.email_domains.contains(&d));
    if !login.email_verified || !domain_ok || user.role == "ADMIN" {
        return Ok(false);
    }
    Ok(sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (SELECT 1 FROM "OrganizationMember" WHERE "userId" = $1 AND "organizationId" = $2)
               OR NOT EXISTS (SELECT 1 FROM "OrganizationMember" WHERE "userId" = $1 AND "acceptedAt" IS NOT NULL)"#,
    )
    .bind(&user.id)
    .bind(login.organization_id)
    .fetch_one(&mut **tx)
    .await?)
}

async fn create_user(
    tx: &mut Transaction<'_, Postgres>,
    login: &SsoLogin<'_>,
    now: NaiveDateTime,
) -> StoreResult<UserRow> {
    let name = login
        .name
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .or_else(|| login.email.split('@').next())
        .unwrap_or(login.email);
    let sql = format!(
        r#"INSERT INTO "Agent" ("id","email","name","passwordHash","createdAt","updatedAt")
           VALUES ($1,$2,$3,NULL,$4,$4) RETURNING {USER_COLUMNS}"#
    );
    sqlx::query_as::<_, UserRow>(&sql)
        .bind(new_id())
        .bind(login.email.to_ascii_lowercase())
        .bind(name)
        .bind(now)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| match &e {
            sqlx::Error::Database(d) if d.is_unique_violation() => StoreError::Conflict,
            _ => StoreError::Db(e),
        })
}

/// The user's membership of the provider's organisation: created with JIT, a pending invite
/// accepted, and the mapped role applied. An owner keeps their role: the provider cannot demote
/// the organisation's owner. `false` when there is none and JIT is off.
async fn ensure_membership(
    tx: &mut Transaction<'_, Postgres>,
    login: &SsoLogin<'_>,
    user: &UserRow,
    now: NaiveDateTime,
) -> StoreResult<bool> {
    let current = sqlx::query_as::<_, (String, String)>(
        r#"SELECT "id","role" FROM "OrganizationMember" WHERE "userId" = $1 AND "organizationId" = $2
           FOR UPDATE"#,
    )
    .bind(&user.id)
    .bind(login.organization_id)
    .fetch_optional(&mut **tx)
    .await?;
    match current {
        None if !login.jit_provisioning => Ok(false),
        None => {
            sqlx::query(
                r#"INSERT INTO "OrganizationMember" ("id","userId","userEmail","userName","organizationId","role","invitedAt","acceptedAt")
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$7)"#,
            )
            .bind(new_id())
            .bind(&user.id)
            .bind(&user.email)
            .bind(&user.name)
            .bind(login.organization_id)
            .bind(login.mapped_role.unwrap_or(login.default_role))
            .bind(now)
            .execute(&mut **tx)
            .await?;
            Ok(true)
        }
        Some((id, role)) => {
            let role = match login.mapped_role {
                Some(mapped) if role != "owner" => mapped.to_owned(),
                _ => role,
            };
            sqlx::query(
                r#"UPDATE "OrganizationMember" SET "role" = $2, "acceptedAt" = COALESCE("acceptedAt", $3)
                   WHERE "id" = $1"#,
            )
            .bind(&id)
            .bind(&role)
            .bind(now)
            .execute(&mut **tx)
            .await?;
            Ok(true)
        }
    }
}

/// The `idp` unit memberships become exactly the units whose `externalId` is in `groups`.
/// A manual membership is never removed, and never turned into an `idp` one.
async fn sync_groups(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    user_id: &str,
    groups: &[String],
    now: NaiveDateTime,
) -> StoreResult<()> {
    lock_subjects(tx, org_id).await?;
    sqlx::query(
        r#"DELETE FROM "OrgUnitMember" m
           WHERE m."organizationId" = $1 AND m."userId" = $2 AND m."source" = 'idp'
             AND NOT EXISTS (SELECT 1 FROM "OrgUnit" u
                             WHERE u."id" = m."unitId" AND u."organizationId" = $1
                               AND u."externalId" = ANY($3))"#,
    )
    .bind(org_id)
    .bind(user_id)
    .bind(groups)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        r#"INSERT INTO "OrgUnitMember" ("organizationId","unitId","userId","role","source","createdAt","updatedAt")
           SELECT $1, u."id", $2, 'member', 'idp', $4, $4 FROM "OrgUnit" u
           WHERE u."organizationId" = $1 AND u."externalId" = ANY($3)
           ON CONFLICT ("unitId","userId") DO NOTHING"#,
    )
    .bind(org_id)
    .bind(user_id)
    .bind(groups)
    .bind(now)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
