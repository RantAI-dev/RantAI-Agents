//! Where the model is called: the endpoint, the key and the model name.
//!
//! The base URL and the key come from the environment, so a test can point them at a local
//! stub server. With no override the model id decides the provider, the way
//! `getChatProvider()` did: a house model (`rantai/…`) goes to MiniMax under its upstream name,
//! every other id goes to OpenRouter.

use agents_llm::provider::{Provider, ProviderConfig, Route};
use agents_llm::types::LlmError;

/// The endpoints and the keys a deployment talks to.
#[derive(Debug, Clone, Default)]
pub struct LlmConfig {
    /// Overrides the provider's base URL. The tests point it at a local stub.
    pub base_url: Option<String>,
    /// The key sent to that base URL.
    pub api_key: Option<String>,
    /// `OPENROUTER_API_KEY`.
    pub openrouter_api_key: Option<String>,
    /// `MINIMAX_API_KEY`.
    pub minimax_api_key: Option<String>,
    /// `MINIMAX_BASE_URL`.
    pub minimax_base_url: Option<String>,
}

impl LlmConfig {
    /// The provider that serves a model id, and the name that provider knows it by.
    ///
    /// An override wins over the model catalogue: the deployment (or the test) says where the
    /// calls go.
    pub fn route(&self, model_id: &str) -> Result<Route, LlmError> {
        if let Some(base_url) = self.base_url.as_deref().filter(|url| !url.is_empty()) {
            return Ok(Route {
                provider: Provider::new(base_url, self.api_key.clone().unwrap_or_default()),
                model: model_id.to_owned(),
            });
        }
        agents_llm::provider::route(
            model_id,
            &ProviderConfig {
                openrouter_api_key: self.openrouter_api_key.clone(),
                minimax_api_key: self.minimax_api_key.clone(),
                minimax_base_url: self.minimax_base_url.clone(),
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_override_sends_every_model_to_the_same_endpoint() {
        let config = LlmConfig {
            base_url: Some("http://127.0.0.1:9/v1".to_owned()),
            api_key: Some("test-key".to_owned()),
            ..LlmConfig::default()
        };
        let route = config
            .route("rantai/nano")
            .expect("the override needs no key");
        assert_eq!(route.provider.base_url, "http://127.0.0.1:9/v1");
        assert_eq!(route.provider.api_key, "test-key");
        assert_eq!(route.model, "rantai/nano");
    }

    #[test]
    fn without_an_override_the_model_id_decides_the_provider() {
        let config = LlmConfig {
            openrouter_api_key: Some("or-key".to_owned()),
            minimax_api_key: Some("mm-key".to_owned()),
            ..LlmConfig::default()
        };
        let route = config.route("rantai/swift").expect("a house model");
        assert_eq!(route.model, "MiniMax-M2.7");
        let route = config.route("openai/gpt-4o-mini").expect("openrouter");
        assert_eq!(route.model, "openai/gpt-4o-mini");
    }

    #[test]
    fn a_model_without_a_key_is_an_error() {
        let config = LlmConfig::default();
        assert!(config.route("openai/gpt-4o-mini").is_err());
    }
}
