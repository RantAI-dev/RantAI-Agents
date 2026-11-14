//! The provider from the environment, for an on-prem install with one identity provider and no
//! admin UI step (docs/operations/sso.md lists the variables).
//!
//! It is used only while its organisation has no enabled provider of its own. Identities need a
//! provider row to point at, so the first sign-in writes one with the fixed id
//! [`ENV_PROVIDER_ID`] and `config.source = "env"`; the environment stays the source of truth
//! (the row is rewritten from it) and the admin API will not edit or delete it.

use std::collections::BTreeMap;

use agents_core::org::OrgRole;

use super::config::{OidcConfig, Preset};

pub const ENV_PROVIDER_ID: &str = "env-oidc";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvProvider {
    pub organization_id: String,
    pub name: String,
    /// The settings, without the secret (that stays in [`Self::client_secret`]).
    pub config: OidcConfig,
    pub client_secret: Option<String>,
    /// Lower case.
    pub email_domains: Vec<String>,
    pub jit_provisioning: bool,
    pub default_role: String,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum EnvError {
    #[error("{0} is required when AUTH_OIDC_ISSUER or AUTH_OIDC_TENANT_ID is set")]
    Missing(&'static str),
    #[error("{0} is not valid: {1}")]
    Invalid(&'static str, String),
}

fn list(raw: Option<String>) -> Vec<String> {
    raw.map(|r| {
        r.split([',', ' '])
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect()
    })
    .unwrap_or_default()
}

/// Reads `AUTH_OIDC_*` through `var`. `None` when no provider is configured.
pub fn from_vars(
    var: impl Fn(&'static str) -> Option<String>,
) -> Result<Option<EnvProvider>, EnvError> {
    let preset = match var("AUTH_OIDC_PRESET") {
        Some(p) => Preset::parse(&p.to_ascii_lowercase())
            .ok_or(EnvError::Invalid("AUTH_OIDC_PRESET", p))?,
        None => Preset::Generic,
    };
    let issuer = var("AUTH_OIDC_ISSUER");
    let tenant_id = var("AUTH_OIDC_TENANT_ID");
    let any = issuer.is_some()
        || tenant_id.is_some()
        || var("AUTH_OIDC_CLIENT_ID").is_some()
        || matches!(preset, Preset::Google) && var("AUTH_OIDC_PRESET").is_some();
    if !any {
        return Ok(None);
    }
    let client_id = var("AUTH_OIDC_CLIENT_ID").ok_or(EnvError::Missing("AUTH_OIDC_CLIENT_ID"))?;
    let organization_id = var("AUTH_OIDC_ORG_ID").ok_or(EnvError::Missing("AUTH_OIDC_ORG_ID"))?;
    let default_role = var("AUTH_OIDC_DEFAULT_ROLE").unwrap_or_else(|| "member".to_owned());
    if !matches!(
        OrgRole::parse(&default_role),
        Some(OrgRole::Admin | OrgRole::Member | OrgRole::Viewer)
    ) {
        return Err(EnvError::Invalid("AUTH_OIDC_DEFAULT_ROLE", default_role));
    }
    let jit_provisioning = match var("AUTH_OIDC_JIT").as_deref() {
        None | Some("false") => false,
        Some("true") => true,
        Some(other) => return Err(EnvError::Invalid("AUTH_OIDC_JIT", other.to_owned())),
    };
    let mut role_mapping = BTreeMap::new();
    for pair in list(var("AUTH_OIDC_ROLE_MAPPING")) {
        let (group, role) = pair
            .split_once('=')
            .ok_or_else(|| EnvError::Invalid("AUTH_OIDC_ROLE_MAPPING", pair.clone()))?;
        if !matches!(
            OrgRole::parse(role),
            Some(OrgRole::Admin | OrgRole::Member | OrgRole::Viewer)
        ) {
            return Err(EnvError::Invalid("AUTH_OIDC_ROLE_MAPPING", pair.clone()));
        }
        role_mapping.insert(group.to_owned(), role.to_owned());
    }
    let config = OidcConfig {
        preset,
        issuer,
        discovery_url: var("AUTH_OIDC_DISCOVERY_URL"),
        tenant_id,
        hosted_domain: var("AUTH_OIDC_HOSTED_DOMAIN"),
        client_id,
        client_secret_encrypted: None,
        scopes: list(var("AUTH_OIDC_SCOPES")),
        groups_claim: var("AUTH_OIDC_GROUPS_CLAIM"),
        role_mapping,
        source: Some("env".to_owned()),
    };
    config
        .issuer()
        .map_err(|e| EnvError::Invalid("AUTH_OIDC_ISSUER", e.to_string()))?;
    Ok(Some(EnvProvider {
        organization_id,
        name: var("AUTH_OIDC_NAME").unwrap_or_else(|| "Single sign-on".to_owned()),
        config,
        client_secret: var("AUTH_OIDC_CLIENT_SECRET"),
        email_domains: list(var("AUTH_OIDC_EMAIL_DOMAINS"))
            .into_iter()
            .map(|d| d.to_ascii_lowercase())
            .collect(),
        jit_provisioning,
        default_role,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&'static str) -> Option<String> + 'a {
        move |name| {
            pairs
                .iter()
                .find(|(k, _)| *k == name)
                .map(|(_, v)| (*v).to_owned())
        }
    }

    #[test]
    fn nothing_set_is_no_provider() {
        assert_eq!(from_vars(vars(&[])), Ok(None));
    }

    #[test]
    fn a_keycloak_provider_reads_every_variable() -> Result<(), String> {
        let p = from_vars(vars(&[
            ("AUTH_OIDC_PRESET", "keycloak"),
            ("AUTH_OIDC_ISSUER", "https://kc.test/realms/acme"),
            ("AUTH_OIDC_CLIENT_ID", "rantai"),
            ("AUTH_OIDC_CLIENT_SECRET", "s"),
            ("AUTH_OIDC_ORG_ID", "org1"),
            ("AUTH_OIDC_EMAIL_DOMAINS", "Acme.test, acme.example"),
            ("AUTH_OIDC_JIT", "true"),
            ("AUTH_OIDC_ROLE_MAPPING", "it=admin,staff=member"),
        ]));
        let Ok(Some(p)) = p else {
            return Err(format!("expected a provider, got {p:?}"));
        };
        assert_eq!(p.email_domains, ["acme.test", "acme.example"]);
        assert!(p.jit_provisioning);
        assert_eq!(p.config.role_mapping.len(), 2);
        Ok(())
    }

    #[test]
    fn a_half_configured_provider_stops_startup() {
        assert_eq!(
            from_vars(vars(&[("AUTH_OIDC_ISSUER", "https://x.test")])),
            Err(EnvError::Missing("AUTH_OIDC_CLIENT_ID"))
        );
        assert!(
            from_vars(vars(&[
                ("AUTH_OIDC_PRESET", "entra"),
                ("AUTH_OIDC_TENANT_ID", "common"),
                ("AUTH_OIDC_CLIENT_ID", "c"),
                ("AUTH_OIDC_ORG_ID", "o"),
            ]))
            .is_err()
        );
    }
}
