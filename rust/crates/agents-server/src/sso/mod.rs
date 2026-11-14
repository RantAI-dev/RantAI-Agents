//! OIDC single sign-on: provider settings and presets, the provider client, the provider from the
//! environment, and turning a provider id into everything a sign-in needs.

pub mod client;
pub mod config;
pub mod env;

use agents_auth::credential::{self, CredentialKey};
use agents_contracts::error_codes::ErrorCode;
use agents_store::identity::{self, ProviderRow, ProviderWrite};
use serde::{Deserialize, Serialize};

use crate::AppState;
use crate::http::ApiError;
use config::OidcConfig;
use env::{ENV_PROVIDER_ID, EnvProvider};

/// A provider ready for a sign-in: its settings with the secret decrypted.
#[derive(Debug, Clone)]
pub struct Provider {
    pub id: String,
    pub organization_id: String,
    pub name: String,
    pub config: OidcConfig,
    pub client_secret: Option<String>,
    pub email_domains: Vec<String>,
    pub jit_provisioning: bool,
    pub default_role: String,
}

/// What `client_secret_encrypted` holds once decrypted, the shape `encryptCredential` is given.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecretBox {
    client_secret: String,
}

fn internal(what: &str, e: &dyn std::fmt::Display) -> ApiError {
    tracing::error!(error = %e, what, "sso provider lookup failed");
    ApiError::new(ErrorCode::Internal)
}

/// Encrypts a client secret for storage.
pub fn seal_secret(key: &CredentialKey, secret: &str) -> Result<String, ApiError> {
    let plain = serde_json::to_vec(&SecretBox {
        client_secret: secret.to_owned(),
    })
    .map_err(|e| internal("secret", &e))?;
    let iv = crate::signin::random::<16>().map_err(|e| internal("random", &e))?;
    Ok(credential::encrypt(&plain, key, &iv))
}

fn open_secret(key: Option<&CredentialKey>, sealed: &str) -> Result<String, ApiError> {
    let key = key.ok_or_else(|| {
        tracing::error!("a provider has a client secret but CREDENTIAL_ENCRYPTION_KEY is not set");
        ApiError::new(ErrorCode::Unavailable)
    })?;
    let plain = credential::decrypt(sealed, key).map_err(|e| internal("secret", &e))?;
    let boxed: SecretBox = serde_json::from_slice(&plain).map_err(|e| internal("secret", &e))?;
    Ok(boxed.client_secret)
}

/// The provider from the environment, when it is in force: configured, and its organisation has
/// no enabled provider of its own.
pub async fn env_provider_in_force(state: &AppState) -> Result<Option<&EnvProvider>, ApiError> {
    let Some(env) = state.signin.env_provider.as_ref() else {
        return Ok(None);
    };
    let own = identity::has_enabled(&state.db, &env.organization_id, ENV_PROVIDER_ID)
        .await
        .map_err(|e| internal("providers", &e))?;
    Ok((!own).then_some(env))
}

/// The row identities of the environment's provider point at, written from the environment.
async fn ensure_env_row(state: &AppState, env: &EnvProvider) -> Result<(), ApiError> {
    let config = serde_json::to_value(&env.config).map_err(|e| internal("env", &e))?;
    let write = ProviderWrite {
        kind: "oidc",
        name: &env.name,
        enabled: true,
        config: &config,
        email_domains: &env.email_domains,
        jit_provisioning: env.jit_provisioning,
        default_role: &env.default_role,
    };
    let existing = identity::find(&state.db, ENV_PROVIDER_ID)
        .await
        .map_err(|e| internal("env", &e))?;
    let result = match existing {
        Some(row) if row.organization_id == env.organization_id => {
            identity::update(&state.db, &env.organization_id, ENV_PROVIDER_ID, &write)
                .await
                .map(|_| ())
        }
        Some(_) => {
            // AUTH_OIDC_ORG_ID changed: the old row's identities belonged to another org.
            identity::delete_any(&state.db, ENV_PROVIDER_ID)
                .await
                .map_err(|e| internal("env", &e))?;
            identity::create(
                &state.db,
                &env.organization_id,
                Some(ENV_PROVIDER_ID),
                &write,
            )
            .await
            .map(|_| ())
        }
        None => identity::create(
            &state.db,
            &env.organization_id,
            Some(ENV_PROVIDER_ID),
            &write,
        )
        .await
        .map(|_| ()),
    };
    match result {
        Ok(()) => Ok(()),
        // Another instance wrote it first.
        Err(identity::WriteError::Store(agents_store::StoreError::Db(sqlx::Error::Database(
            d,
        )))) if d.is_unique_violation() => Ok(()),
        Err(identity::WriteError::DomainTaken(domain)) => {
            tracing::error!(
                domain,
                "AUTH_OIDC_EMAIL_DOMAINS claims a domain of another org"
            );
            Err(ApiError::new(ErrorCode::Unavailable))
        }
        Err(identity::WriteError::Store(e)) => Err(internal("env", &e)),
    }
}

fn from_env(env: &EnvProvider) -> Provider {
    Provider {
        id: ENV_PROVIDER_ID.to_owned(),
        organization_id: env.organization_id.clone(),
        name: env.name.clone(),
        config: env.config.clone(),
        client_secret: env.client_secret.clone(),
        email_domains: env.email_domains.clone(),
        jit_provisioning: env.jit_provisioning,
        default_role: env.default_role.clone(),
    }
}

/// An enabled OIDC row as a provider. `None` for a disabled, SAML or unreadable row.
pub fn from_row(
    row: ProviderRow,
    key: Option<&CredentialKey>,
) -> Result<Option<Provider>, ApiError> {
    if !row.enabled || row.kind != "oidc" {
        return Ok(None);
    }
    let Ok(config) = serde_json::from_value::<OidcConfig>(row.config) else {
        tracing::warn!(provider_id = %row.id, "a provider's config cannot be read");
        return Ok(None);
    };
    let client_secret = match &config.client_secret_encrypted {
        Some(sealed) => Some(open_secret(key, sealed)?),
        None => None,
    };
    Ok(Some(Provider {
        id: row.id,
        organization_id: row.organization_id,
        name: row.name,
        config,
        client_secret,
        email_domains: row.email_domains,
        jit_provisioning: row.jit_provisioning,
        default_role: row.default_role,
    }))
}

/// The provider a sign-in route names, if it may be used now.
pub async fn resolve(state: &AppState, id: &str) -> Result<Option<Provider>, ApiError> {
    if id == ENV_PROVIDER_ID {
        let Some(env) = env_provider_in_force(state).await? else {
            return Ok(None);
        };
        ensure_env_row(state, env).await?;
        return Ok(Some(from_env(env)));
    }
    let row = identity::find(&state.db, id)
        .await
        .map_err(|e| internal("providers", &e))?;
    match row {
        // The env row is only used through the environment's settings, above.
        Some(row) if row.id != ENV_PROVIDER_ID => {
            from_row(row, state.signin.credential_key.as_ref())
        }
        _ => Ok(None),
    }
}

/// The provider that signs in `email`'s domain, if any: an enabled OIDC provider of the
/// database, else the environment's.
pub async fn for_email(state: &AppState, email: &str) -> Result<Option<Provider>, ApiError> {
    let Some((_, domain)) = email.trim().rsplit_once('@') else {
        return Ok(None);
    };
    let domain = domain.to_ascii_lowercase();
    let rows = identity::for_domain(&state.db, &domain)
        .await
        .map_err(|e| internal("providers", &e))?;
    for row in rows.into_iter().filter(|r| r.id != ENV_PROVIDER_ID) {
        if let Some(p) = from_row(row, state.signin.credential_key.as_ref())? {
            return Ok(Some(p));
        }
    }
    if let Some(env) = env_provider_in_force(state).await?
        && env.email_domains.contains(&domain)
    {
        return Ok(Some(from_env(env)));
    }
    Ok(None)
}
