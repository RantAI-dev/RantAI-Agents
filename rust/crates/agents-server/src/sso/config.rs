//! An OIDC provider's settings (`IdentityProvider.config`) and the presets.
//!
//! A preset only fills defaults (docs/design/identity-and-access.md §3.5):
//! - `keycloak`: the issuer is the realm URL, `https://<host>/realms/<realm>`.
//! - `entra`: the issuer is `https://login.microsoftonline.com/<tenant id>/v2.0`. The tenant must be
//!   one tenant's GUID: the multi-tenant `common`, `organizations` and `consumers` endpoints issue
//!   tokens from any tenant, so a fixed issuer cannot be checked, and they are refused.
//! - `google`: the issuer is `https://accounts.google.com`; with `hostedDomain` the `hd` parameter
//!   is sent and the token's `hd` claim must equal it (the parameter alone is only a UI hint).
//! - `generic`: any provider with discovery: the issuer, or the discovery URL.

use std::collections::BTreeMap;

use agents_auth::oidc::id_token::IdTokenClaims;
use agents_core::org::OrgRole;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Preset {
    Keycloak,
    Entra,
    Google,
    Generic,
}

impl Preset {
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "keycloak" => Some(Self::Keycloak),
            "entra" => Some(Self::Entra),
            "google" => Some(Self::Google),
            "generic" => Some(Self::Generic),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Keycloak => "keycloak",
            Self::Entra => "entra",
            Self::Google => "google",
            Self::Generic => "generic",
        }
    }
}

pub const GOOGLE_ISSUER: &str = "https://accounts.google.com";
const ENTRA_MULTI_TENANT: [&str; 3] = ["common", "organizations", "consumers"];
const DEFAULT_SCOPES: [&str; 3] = ["openid", "email", "profile"];
pub const DEFAULT_GROUPS_CLAIM: &str = "groups";

/// The stored settings. The client secret is stored encrypted, the way `encryptCredential`
/// stores a credential: `{"clientSecret": "..."}` encrypted as one value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OidcConfig {
    pub preset: Preset,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issuer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discovery_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hosted_domain: Option<String>,
    pub client_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_secret_encrypted: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scopes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub groups_claim: Option<String>,
    /// IdP group → organisation role (`admin`, `member` or `viewer`; never `owner`).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub role_mapping: BTreeMap<String, String>,
    /// `env` on the row that stands for the provider from the environment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Why the settings cannot be used. The text is for an admin.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ConfigError {
    #[error("the issuer is missing")]
    MissingIssuer,
    #[error("the Entra ID tenant must be one tenant's id, not common, organizations or consumers")]
    MultiTenantEntra,
    #[error("the Entra ID tenant id is missing or is not a GUID")]
    BadTenant,
}

/// A GUID, `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
#[must_use]
pub fn is_guid(s: &str) -> bool {
    let groups: Vec<&str> = s.split('-').collect();
    groups.len() == 5
        && groups
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(g, n)| g.len() == n && g.bytes().all(|b| b.is_ascii_hexdigit()))
}

impl OidcConfig {
    /// The issuer the token must carry.
    pub fn issuer(&self) -> Result<String, ConfigError> {
        match self.preset {
            Preset::Google => Ok(GOOGLE_ISSUER.to_owned()),
            Preset::Entra => {
                let tenant = self.tenant_id.as_deref().unwrap_or_default().trim();
                if ENTRA_MULTI_TENANT.contains(&tenant.to_ascii_lowercase().as_str()) {
                    return Err(ConfigError::MultiTenantEntra);
                }
                if !is_guid(tenant) {
                    return Err(ConfigError::BadTenant);
                }
                Ok(format!(
                    "https://login.microsoftonline.com/{}/v2.0",
                    tenant.to_ascii_lowercase()
                ))
            }
            Preset::Keycloak | Preset::Generic => self
                .issuer
                .as_deref()
                .map(str::trim)
                .filter(|i| !i.is_empty())
                .map(str::to_owned)
                .ok_or(ConfigError::MissingIssuer),
        }
    }

    /// Where discovery is read from.
    pub fn discovery_url(&self) -> Result<String, ConfigError> {
        if let Some(url) = self
            .discovery_url
            .as_deref()
            .filter(|u| !u.trim().is_empty())
        {
            return Ok(url.trim().to_owned());
        }
        Ok(format!(
            "{}/.well-known/openid-configuration",
            self.issuer()?.trim_end_matches('/')
        ))
    }

    /// The `scope` parameter; `openid` is always in it.
    #[must_use]
    pub fn scope(&self) -> String {
        let mut scopes: Vec<&str> = if self.scopes.is_empty() {
            DEFAULT_SCOPES.to_vec()
        } else {
            self.scopes.iter().map(String::as_str).collect()
        };
        if !scopes.contains(&"openid") {
            scopes.insert(0, "openid");
        }
        scopes.join(" ")
    }

    /// Parameters the preset adds to the authorisation request.
    #[must_use]
    pub fn extra_auth_params(&self) -> Vec<(&'static str, String)> {
        match (self.preset, &self.hosted_domain) {
            (Preset::Google, Some(hd)) if !hd.is_empty() => vec![("hd", hd.clone())],
            _ => Vec::new(),
        }
    }

    #[must_use]
    pub fn groups_claim(&self) -> &str {
        self.groups_claim
            .as_deref()
            .filter(|c| !c.is_empty())
            .unwrap_or(DEFAULT_GROUPS_CLAIM)
    }

    /// The role the user's groups give: the strongest mapped one, or none when no group is
    /// mapped (the membership then keeps its role, or gets `defaultRole`).
    #[must_use]
    pub fn mapped_role(&self, groups: &[String]) -> Option<OrgRole> {
        let rank = |r: OrgRole| match r {
            OrgRole::Admin => 3,
            OrgRole::Member => 2,
            OrgRole::Viewer => 1,
            OrgRole::Owner => 0,
        };
        groups
            .iter()
            .filter_map(|g| self.role_mapping.get(g))
            .filter_map(|r| OrgRole::parse(r))
            .filter(|r| *r != OrgRole::Owner)
            .max_by_key(|r| rank(*r))
    }

    /// The email and whether it is verified, as the preset's provider says it.
    ///
    /// Entra ID sends no `email_verified`: its `email` is an unverified directory attribute, and
    /// trusting it is the "nOAuth" takeover. Only the optional `xms_edov` claim (email domain
    /// owner verified) counts as verified there.
    #[must_use]
    pub fn email(&self, claims: &IdTokenClaims) -> (Option<String>, bool) {
        let email = claims.email.clone().or_else(|| match self.preset {
            Preset::Entra => claims
                .string("preferred_username")
                .filter(|u| u.contains('@'))
                .map(str::to_owned),
            _ => None,
        });
        let verified = match self.preset {
            Preset::Entra => claims.is_true("xms_edov"),
            _ => claims.email_verified,
        };
        (email.map(|e| e.trim().to_owned()), verified)
    }

    /// The preset's own claim checks, after the signature and the standard claims.
    #[must_use]
    pub fn claims_fit(&self, claims: &IdTokenClaims) -> bool {
        match (self.preset, self.hosted_domain.as_deref()) {
            (Preset::Google, Some(hd)) if !hd.is_empty() => claims
                .string("hd")
                .is_some_and(|got| got.eq_ignore_ascii_case(hd)),
            _ => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(preset: Preset) -> OidcConfig {
        OidcConfig {
            preset,
            issuer: None,
            discovery_url: None,
            tenant_id: None,
            hosted_domain: None,
            client_id: "c".into(),
            client_secret_encrypted: None,
            scopes: Vec::new(),
            groups_claim: None,
            role_mapping: BTreeMap::new(),
            source: None,
        }
    }

    #[test]
    fn entra_needs_one_tenant() {
        let mut c = config(Preset::Entra);
        c.tenant_id = Some("common".into());
        assert_eq!(c.issuer(), Err(ConfigError::MultiTenantEntra));
        c.tenant_id = Some("contoso.onmicrosoft.com".into());
        assert_eq!(c.issuer(), Err(ConfigError::BadTenant));
        c.tenant_id = Some("72F988BF-86F1-41AF-91AB-2D7CD011DB47".into());
        assert_eq!(
            c.issuer().ok().as_deref(),
            Some("https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0")
        );
    }

    #[test]
    fn keycloak_discovery_hangs_off_the_realm() {
        let mut c = config(Preset::Keycloak);
        c.issuer = Some("https://kc.test/realms/acme/".into());
        assert_eq!(
            c.discovery_url().ok().as_deref(),
            Some("https://kc.test/realms/acme/.well-known/openid-configuration")
        );
        assert_eq!(c.scope(), "openid email profile");
    }

    #[test]
    fn the_strongest_mapped_role_wins_and_owner_is_never_mapped() {
        let mut c = config(Preset::Generic);
        c.role_mapping.insert("staff".into(), "member".into());
        c.role_mapping.insert("it".into(), "admin".into());
        c.role_mapping.insert("boss".into(), "owner".into());
        let groups = |g: &[&str]| g.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
        assert_eq!(
            c.mapped_role(&groups(&["staff", "it"])),
            Some(OrgRole::Admin)
        );
        assert_eq!(c.mapped_role(&groups(&["boss"])), None);
        assert_eq!(c.mapped_role(&groups(&["other"])), None);
    }
}
