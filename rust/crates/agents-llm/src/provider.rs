//! Which provider a model id goes to, and what that provider needs.
//!
//! Ported from `src/lib/llm/provider.ts` and `src/lib/llm/house-models.ts`:
//! - a house model id (`rantai/…`) is white-labelled and served by MiniMax directly, under the
//!   upstream model name it stands for;
//! - every other id goes to OpenRouter.
//!
//! The environment is read by the caller, not here: this module is a pure function of the model
//! id and the [`ProviderConfig`] the caller filled in.

use std::fmt;

use crate::types::LlmError;

/// The OpenRouter endpoint. The AI SDK's provider used the same one.
pub const OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";

/// The MiniMax endpoint. `MINIMAX_BASE_URL` overrides it; the China-region hosts
/// (`api.minimaxi.com/.chat`) are not the default.
pub const MINIMAX_BASE_URL: &str = "https://api.minimax.io/v1";

/// The white-labelled house model ids and the upstream model each one stands for.
///
/// The display names, the synthetic prices and the context windows live in `house-models.ts` and
/// belong to `agents-core` (see the port ledger); routing only needs the id and the upstream
/// name.
const HOUSE_BACKEND_MODELS: &[(&str, &str)] = &[
    ("rantai/nano", "MiniMax-M2.5"),
    ("rantai/swift", "MiniMax-M2.7"),
    ("rantai/prime", "MiniMax-M3"),
];

/// Whether this id is a white-labelled house model served by a direct provider.
#[must_use]
pub fn is_house_model(id: &str) -> bool {
    HOUSE_BACKEND_MODELS.iter().any(|(house, _)| *house == id)
}

/// The white-labelled house model ids and the upstream model each one stands for.
///
/// The display names and the context windows live with the catalogue (the cloud edition
/// owns it); a caller that only needs the ids reads them here.
#[must_use]
pub fn house_models() -> &'static [(&'static str, &'static str)] {
    HOUSE_BACKEND_MODELS
}

/// The upstream model name a house id stands for. Other ids pass through.
#[must_use]
pub fn house_backend_model(id: &str) -> &str {
    HOUSE_BACKEND_MODELS
        .iter()
        .find(|(house, _)| *house == id)
        .map_or(id, |(_, backend)| *backend)
}

/// Where a chat completion goes.
#[derive(Clone)]
pub struct Provider {
    /// The API root, without the `/chat/completions` suffix.
    pub base_url: String,
    /// The key sent as `Authorization: Bearer …`. Never logged.
    pub api_key: String,
    /// Extra headers to send, e.g. `HTTP-Referer` for OpenRouter.
    pub extra_headers: Vec<(String, String)>,
}

impl Provider {
    /// A provider with no extra headers.
    #[must_use]
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            api_key: api_key.into(),
            extra_headers: Vec::new(),
        }
    }

    /// Add a header every request to this provider carries.
    #[must_use]
    pub fn with_header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.extra_headers.push((name.into(), value.into()));
        self
    }

    /// The URL of the chat-completions endpoint.
    #[must_use]
    pub fn chat_completions_url(&self) -> String {
        format!("{}/chat/completions", self.base_url.trim_end_matches('/'))
    }
}

/// The key is redacted: a provider is logged, and the log must not carry a secret.
impl fmt::Debug for Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let names: Vec<&str> = self
            .extra_headers
            .iter()
            .map(|(name, _)| name.as_str())
            .collect();
        f.debug_struct("Provider")
            .field("base_url", &self.base_url)
            .field("api_key", &"[redacted]")
            .field("extra_headers", &names)
            .finish()
    }
}

/// The keys and endpoints the caller reads from the environment.
#[derive(Clone, Debug, Default)]
pub struct ProviderConfig {
    /// `OPENROUTER_API_KEY`.
    pub openrouter_api_key: Option<String>,
    /// `MINIMAX_API_KEY`.
    pub minimax_api_key: Option<String>,
    /// `MINIMAX_BASE_URL`. The default is [`MINIMAX_BASE_URL`].
    pub minimax_base_url: Option<String>,
}

/// Where a model id goes: the provider to call and the model name to send it.
#[derive(Clone, Debug)]
pub struct Route {
    /// The provider that serves the model.
    pub provider: Provider,
    /// The model name that provider knows the model by.
    pub model: String,
}

/// Route a model id to its provider, the way `getChatProvider()` does.
///
/// House ids go to MiniMax under the upstream model name; everything else goes to OpenRouter.
/// A model whose provider has no key is an error: the old code threw, and a request without a
/// key only fails later and less clearly.
pub fn route(model_id: &str, config: &ProviderConfig) -> Result<Route, LlmError> {
    if is_house_model(model_id) {
        let Some(key) = config
            .minimax_api_key
            .as_deref()
            .filter(|key| !key.is_empty())
        else {
            return Err(LlmError::MissingApiKey {
                provider: "minimax",
            });
        };
        let base_url = config
            .minimax_base_url
            .as_deref()
            .filter(|url| !url.is_empty())
            .unwrap_or(MINIMAX_BASE_URL);
        return Ok(Route {
            provider: Provider::new(base_url, key),
            model: house_backend_model(model_id).to_owned(),
        });
    }

    let Some(key) = config
        .openrouter_api_key
        .as_deref()
        .filter(|key| !key.is_empty())
    else {
        return Err(LlmError::MissingApiKey {
            provider: "openrouter",
        });
    };
    Ok(Route {
        provider: Provider::new(OPENROUTER_BASE_URL, key),
        model: model_id.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> ProviderConfig {
        ProviderConfig {
            openrouter_api_key: Some("or-key".to_owned()),
            minimax_api_key: Some("mm-key".to_owned()),
            minimax_base_url: None,
        }
    }

    #[test]
    fn a_house_id_goes_to_minimax_under_its_upstream_name() -> Result<(), LlmError> {
        let route = route("rantai/swift", &config())?;
        assert_eq!(route.model, "MiniMax-M2.7");
        assert_eq!(route.provider.base_url, MINIMAX_BASE_URL);
        assert_eq!(route.provider.api_key, "mm-key");
        Ok(())
    }

    #[test]
    fn every_house_id_has_an_upstream_name() -> Result<(), LlmError> {
        for (house, backend) in HOUSE_BACKEND_MODELS {
            let route = route(house, &config())?;
            assert_eq!(&route.model, backend);
        }
        Ok(())
    }

    #[test]
    fn any_other_id_goes_to_openrouter_unchanged() -> Result<(), LlmError> {
        let route = route("openai/gpt-4o-mini", &config())?;
        assert_eq!(route.model, "openai/gpt-4o-mini");
        assert_eq!(route.provider.base_url, OPENROUTER_BASE_URL);
        assert_eq!(route.provider.api_key, "or-key");
        Ok(())
    }

    #[test]
    fn a_house_id_without_a_minimax_key_is_an_error() {
        let config = ProviderConfig {
            openrouter_api_key: Some("or-key".to_owned()),
            ..ProviderConfig::default()
        };
        let error = route("rantai/swift", &config)
            .err()
            .unwrap_or(LlmError::Cancelled);
        assert!(matches!(
            error,
            LlmError::MissingApiKey {
                provider: "minimax"
            }
        ));
    }

    #[test]
    fn any_other_id_without_an_openrouter_key_is_an_error() {
        let error = route("openai/gpt-4o-mini", &ProviderConfig::default())
            .err()
            .unwrap_or(LlmError::Cancelled);
        assert!(matches!(
            error,
            LlmError::MissingApiKey {
                provider: "openrouter"
            }
        ));
    }

    #[test]
    fn an_empty_key_counts_as_no_key() {
        let config = ProviderConfig {
            openrouter_api_key: Some(String::new()),
            ..ProviderConfig::default()
        };
        assert!(route("openai/gpt-4o-mini", &config).is_err());
    }

    #[test]
    fn the_minimax_base_url_can_be_overridden() -> Result<(), LlmError> {
        let config = ProviderConfig {
            minimax_base_url: Some("https://api.minimaxi.com/v1".to_owned()),
            ..config()
        };
        let route = route("rantai/nano", &config)?;
        assert_eq!(route.provider.base_url, "https://api.minimaxi.com/v1");
        assert_eq!(route.model, "MiniMax-M2.5");
        Ok(())
    }

    #[test]
    fn the_url_has_no_double_slash() {
        let provider = Provider::new("http://127.0.0.1:8089/v1/", "key");
        assert_eq!(
            provider.chat_completions_url(),
            "http://127.0.0.1:8089/v1/chat/completions"
        );
    }

    #[test]
    fn the_key_is_not_in_the_debug_output() {
        let provider = Provider::new("https://example.test", "super-secret");
        let printed = format!("{provider:?}");
        assert!(!printed.contains("super-secret"));
        assert!(printed.contains("[redacted]"));
    }
}
