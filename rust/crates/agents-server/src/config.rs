//! Configuration from the environment. Names match the Next.js app so one `.env` serves both.

use crate::llm::LlmConfig;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub bind: String,
    pub db_max_connections: u32,
    /// `AUTH_SECRET` then `NEXTAUTH_SECRET`, the names Auth.js reads. At least one is required.
    pub auth_secrets: Vec<String>,
    /// Where the model is called and with which key.
    pub llm: LlmConfig,
    /// How many model calls one chat may make. The platform default, the way
    /// `resolveMaxSteps` decided it.
    pub chat_max_steps: u32,
    /// Whether the identity and date block is part of the system prompt
    /// (`PLATFORM_CONTEXT_INSTRUCTION=off` removes it).
    pub platform_context: bool,
}

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
        let llm = LlmConfig {
            base_url: var("AGENTS_LLM_BASE_URL"),
            api_key: var("AGENTS_LLM_API_KEY"),
            openrouter_api_key: var("OPENROUTER_API_KEY"),
            minimax_api_key: var("MINIMAX_API_KEY"),
            minimax_base_url: var("MINIMAX_BASE_URL"),
        };
        let chat_max_steps = var_count("RANTAI_DEFAULT_MAX_STEPS", 20)?;
        let platform_context = !matches!(
            var("PLATFORM_CONTEXT_INSTRUCTION")
                .map(|value| value.trim().to_ascii_lowercase())
                .as_deref(),
            Some("off") | Some("false") | Some("0")
        );
        Ok(Self {
            database_url,
            bind,
            db_max_connections,
            auth_secrets,
            llm,
            chat_max_steps,
            platform_context,
        })
    }
}
