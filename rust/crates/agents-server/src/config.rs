//! Configuration from the environment. Names match the Next.js app so one `.env` serves both.

use agents_llm::provider::{self, Provider, ProviderConfig, Route};
use agents_llm::types::LlmError;

/// Where the wizard's and the chat's model is served from.
///
/// The provider is chosen by the model id, the way `provider::route` does it. The two
/// overrides (`AGENTS_LLM_BASE_URL`, `AGENTS_LLM_API_KEY`) are new: the old app had none. They
/// send every model to one endpoint (a local gateway, or a stub server in a test).
#[derive(Debug, Clone, Default)]
pub struct LlmSettings {
    /// Overrides the provider's base URL.
    pub base_url: Option<String>,
    /// Overrides the provider's key.
    pub api_key: Option<String>,
    /// The keys the providers need (`OPENROUTER_API_KEY`, `MINIMAX_API_KEY`).
    pub provider: ProviderConfig,
}

impl LlmSettings {
    /// Where a model id is served from.
    ///
    /// # Errors
    /// The provider of that model has no key.
    pub fn route(&self, model_id: &str) -> Result<Route, LlmError> {
        let route = match provider::route(model_id, &self.provider) {
            Ok(route) => route,
            // Both overrides set: the endpoint has its own key, the provider's is not needed.
            Err(LlmError::MissingApiKey { .. })
                if self.base_url.is_some() && self.api_key.is_some() =>
            {
                Route {
                    provider: Provider::new("", ""),
                    model: provider::house_backend_model(model_id).to_owned(),
                }
            }
            Err(error) => return Err(error),
        };
        Ok(Route {
            provider: self.endpoint(route.provider),
            model: route.model,
        })
    }

    /// The routed provider, pointed at the configured endpoint.
    fn endpoint(&self, mut routed: Provider) -> Provider {
        if let Some(base_url) = &self.base_url {
            routed.base_url = base_url.clone();
        }
        if let Some(api_key) = &self.api_key {
            routed.api_key = api_key.clone();
        }
        routed
    }
}

/// How a chat waits for the user's decision on a gated tool call.
///
/// The wait polls the database (`agents_store::approvals`), so no connection is held between
/// two reads, and the decision may reach any instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ToolApprovalTiming {
    /// How long the call waits before it counts as not approved (`DEFAULT_APPROVAL_TIMEOUT_MS`:
    /// proxies drop an idle stream after about 100 s, and no bytes flow while it waits).
    pub timeout: std::time::Duration,
    /// How often the decision is read.
    pub poll: std::time::Duration,
}

impl Default for ToolApprovalTiming {
    fn default() -> Self {
        Self {
            timeout: std::time::Duration::from_secs(90),
            poll: std::time::Duration::from_millis(500),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub bind: String,
    pub db_max_connections: u32,
    /// `AUTH_SECRET` then `NEXTAUTH_SECRET`, the names Auth.js reads. At least one is required.
    pub auth_secrets: Vec<String>,
    /// Where the wizard's and the chat's model is served from.
    pub llm: LlmSettings,
    /// How many model calls one chat may make. The platform default, the way
    /// `resolveMaxSteps` decided it.
    pub chat_max_steps: u32,
    /// The most model calls an assistant's own `maxSteps` may ask for
    /// (`RANTAI_MAX_STEPS_HARD_CAP`).
    pub chat_max_steps_cap: u32,
    /// Whether the identity and date block is part of the system prompt
    /// (`PLATFORM_CONTEXT_INSTRUCTION=off` removes it).
    pub platform_context: bool,
    /// `AUTH_URL`, else `NEXTAUTH_URL`: the origin browsers use. It decides the session cookie's
    /// `__Secure-` prefix and the SSO redirect URI, as it does for Auth.js.
    pub public_url: Option<String>,
    /// `CREDENTIAL_ENCRYPTION_KEY`, the key the TypeScript `Credential` feature uses.
    pub credential_key: Option<agents_auth::credential::CredentialKey>,
    /// The single identity provider of an on-prem install, from `AUTH_OIDC_*`.
    pub env_provider: Option<crate::sso::env::EnvProvider>,
    /// `SSO_ALLOW_PRIVATE_NETWORKS` (default `false`): whether the providers organisation admins
    /// configure may sit on loopback, private, link-local or metadata addresses. An on-prem
    /// install with an internal Keycloak sets `true`; the cloud never does.
    pub sso_allow_private_networks: bool,
    /// `TRUSTED_PROXIES` (default empty): the proxies whose `X-Forwarded-For` is believed.
    pub trusted_proxies: Vec<agents_core::net::Cidr>,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("{0} is not set")]
    Missing(&'static str),
    #[error("{0} is not a valid number")]
    NotANumber(&'static str),
    #[error("{0} is not valid: {1}")]
    Invalid(&'static str, String),
    #[error(transparent)]
    Sso(#[from] crate::sso::env::EnvError),
}

fn var(name: &'static str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

/// `true` or `false` from the environment; anything else stops the process.
fn var_bool(name: &'static str, default: bool) -> Result<bool, ConfigError> {
    match var(name).map(|v| v.trim().to_ascii_lowercase()).as_deref() {
        None => Ok(default),
        Some("true") => Ok(true),
        Some("false") => Ok(false),
        Some(other) => Err(ConfigError::Invalid(name, other.to_owned())),
    }
}

/// `TRUSTED_PROXIES`: comma-separated addresses or CIDR ranges.
fn trusted_proxies(raw: Option<String>) -> Result<Vec<agents_core::net::Cidr>, ConfigError> {
    agents_core::net::parse_cidrs(raw.as_deref().unwrap_or_default())
        .map_err(|bad| ConfigError::Invalid("TRUSTED_PROXIES", bad))
}

/// A positive whole number from the environment.
fn var_count(name: &'static str, default: u32) -> Result<u32, ConfigError> {
    match var(name) {
        Some(raw) => raw
            .parse::<u32>()
            .ok()
            .filter(|value| *value > 0)
            .ok_or(ConfigError::NotANumber(name)),
        None => Ok(default),
    }
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = var("DATABASE_URL").ok_or(ConfigError::Missing("DATABASE_URL"))?;
        let port = var("AGENTS_PORT").unwrap_or_else(|| "8090".to_owned());
        let bind = format!(
            "{}:{port}",
            var("AGENTS_HOST").unwrap_or_else(|| "0.0.0.0".to_owned())
        );
        let db_max_connections = match var("AGENTS_DB_MAX_CONNECTIONS") {
            Some(v) => v
                .parse()
                .map_err(|_| ConfigError::NotANumber("AGENTS_DB_MAX_CONNECTIONS"))?,
            None => 10,
        };
        let mut auth_secrets: Vec<String> = Vec::new();
        for s in ["AUTH_SECRET", "NEXTAUTH_SECRET"]
            .into_iter()
            .filter_map(var)
        {
            if !auth_secrets.contains(&s) {
                auth_secrets.push(s);
            }
        }
        if auth_secrets.is_empty() {
            return Err(ConfigError::Missing("AUTH_SECRET or NEXTAUTH_SECRET"));
        }
        let llm = LlmSettings {
            base_url: var("AGENTS_LLM_BASE_URL"),
            api_key: var("AGENTS_LLM_API_KEY"),
            provider: ProviderConfig {
                openrouter_api_key: var("OPENROUTER_API_KEY"),
                minimax_api_key: var("MINIMAX_API_KEY"),
                minimax_base_url: var("MINIMAX_BASE_URL"),
            },
        };
        let chat_max_steps = var_count(
            "RANTAI_DEFAULT_MAX_STEPS",
            agents_core::chat::step_budget::PLATFORM_DEFAULT,
        )?;
        let chat_max_steps_cap = var_count(
            "RANTAI_MAX_STEPS_HARD_CAP",
            agents_core::chat::step_budget::HARD_CAP,
        )?;
        let platform_context = !matches!(
            var("PLATFORM_CONTEXT_INSTRUCTION")
                .map(|value| value.trim().to_ascii_lowercase())
                .as_deref(),
            Some("off") | Some("false") | Some("0")
        );
        let public_url = match var("AUTH_URL").or_else(|| var("NEXTAUTH_URL")) {
            Some(url) => Some(public_origin(&url)?),
            None => None,
        };
        let credential_key =
            match var(agents_auth::credential::KEY_ENV) {
                Some(raw) => Some(agents_auth::credential::CredentialKey::parse(&raw).map_err(
                    |e| ConfigError::Invalid("CREDENTIAL_ENCRYPTION_KEY", e.to_string()),
                )?),
                None => None,
            };
        let env_provider = crate::sso::env::from_vars(var)?;
        let sso_allow_private_networks = var_bool("SSO_ALLOW_PRIVATE_NETWORKS", false)?;
        let trusted_proxies = trusted_proxies(var("TRUSTED_PROXIES"))?;
        Ok(Self {
            database_url,
            bind,
            db_max_connections,
            auth_secrets,
            llm,
            chat_max_steps,
            chat_max_steps_cap,
            platform_context,
            public_url,
            credential_key,
            env_provider,
            sso_allow_private_networks,
            trusted_proxies,
        })
    }
}

/// The origin of `AUTH_URL` (`https://app.example.com`): Auth.js reads only the origin and the
/// protocol from it here.
fn public_origin(url: &str) -> Result<String, ConfigError> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|e| ConfigError::Invalid("AUTH_URL", e.to_string()))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(ConfigError::Invalid("AUTH_URL", url.to_owned()));
    }
    Ok(parsed.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trusted_proxies_parse_or_stop_the_process() {
        assert!(trusted_proxies(None).is_ok_and(|v| v.is_empty()));
        assert!(trusted_proxies(Some("10.0.0.0/8, ::1".into())).is_ok_and(|v| v.len() == 2));
        assert!(matches!(
            trusted_proxies(Some("10.0.0.0/8,nope".into())),
            Err(ConfigError::Invalid("TRUSTED_PROXIES", _))
        ));
    }

    #[test]
    fn the_configured_endpoint_replaces_the_routed_one() -> Result<(), LlmError> {
        let settings = LlmSettings {
            base_url: Some("http://127.0.0.1:9/v1".to_owned()),
            api_key: Some("stub-key".to_owned()),
            provider: ProviderConfig {
                openrouter_api_key: Some("or-key".to_owned()),
                ..ProviderConfig::default()
            },
        };
        let route = settings.route("openai/gpt-4o-mini")?;
        assert_eq!(route.provider.base_url, "http://127.0.0.1:9/v1");
        assert_eq!(route.provider.api_key, "stub-key");
        assert_eq!(route.model, "openai/gpt-4o-mini");
        Ok(())
    }

    #[test]
    fn without_an_override_the_routed_provider_stays() -> Result<(), LlmError> {
        let settings = LlmSettings {
            provider: ProviderConfig {
                openrouter_api_key: Some("or-key".to_owned()),
                ..ProviderConfig::default()
            },
            ..LlmSettings::default()
        };
        let route = settings.route("openai/gpt-4o-mini")?;
        assert_eq!(route.provider.base_url, provider::OPENROUTER_BASE_URL);
        assert_eq!(route.provider.api_key, "or-key");
        Ok(())
    }

    #[test]
    fn an_endpoint_with_its_own_key_needs_no_provider_key() -> Result<(), LlmError> {
        let settings = LlmSettings {
            base_url: Some("http://127.0.0.1:9/v1".to_owned()),
            api_key: Some("gateway-key".to_owned()),
            ..LlmSettings::default()
        };
        let route = settings.route("rantai/swift")?;
        assert_eq!(route.provider.base_url, "http://127.0.0.1:9/v1");
        assert_eq!(route.provider.api_key, "gateway-key");
        assert_eq!(route.model, "MiniMax-M2.7");
        // Without the endpoint's key the provider's key is still required.
        let settings = LlmSettings {
            base_url: Some("http://127.0.0.1:9/v1".to_owned()),
            ..LlmSettings::default()
        };
        assert!(settings.route("openai/gpt-4o-mini").is_err());
        Ok(())
    }
}
