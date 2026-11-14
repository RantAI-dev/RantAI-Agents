//! Configuration from the environment. Names match the Next.js app so one `.env` serves both.

use agents_llm::provider::{self, Provider, ProviderConfig, Route};
use agents_llm::types::LlmError;

/// Where the wizard's model is served from.
///
/// The base URL and the key are settings, so a deployment can point the wizard at a proxy
/// and a test at a stub server without touching the code. Without them the provider is
/// chosen by the model id, the way `provider::route` does it.
#[derive(Debug, Clone, Default)]
pub struct LlmSettings {
    /// Overrides the provider's base URL (`AGENTS_LLM_BASE_URL`).
    pub base_url: Option<String>,
    /// Overrides the provider's key (`AGENTS_LLM_API_KEY`).
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
        let route = provider::route(model_id, &self.provider)?;
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

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub bind: String,
    pub db_max_connections: u32,
    /// `AUTH_SECRET` then `NEXTAUTH_SECRET`, the names Auth.js reads. At least one is required.
    pub auth_secrets: Vec<String>,
    /// Where the wizard's model is served from.
    pub llm: LlmSettings,
    /// The model the wizard runs on (`AGENTS_WIZARD_MODEL_ID`).
    pub wizard_model: String,
}

/// The model the wizard ran on before the setting existed.
const DEFAULT_WIZARD_MODEL: &str = "anthropic/claude-sonnet-4.6";

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("{0} is not set")]
    Missing(&'static str),
    #[error("{0} is not a valid number")]
    NotANumber(&'static str),
}

fn var(name: &'static str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
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
        let wizard_model =
            var("AGENTS_WIZARD_MODEL_ID").unwrap_or_else(|| DEFAULT_WIZARD_MODEL.to_owned());
        Ok(Self {
            database_url,
            bind,
            db_max_connections,
            auth_secrets,
            llm,
            wizard_model,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
