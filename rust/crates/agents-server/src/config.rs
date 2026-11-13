//! Configuration from the environment. Names match the Next.js app so one `.env` serves both.

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub bind: String,
    pub db_max_connections: u32,
    /// `AUTH_SECRET` then `NEXTAUTH_SECRET`, the names Auth.js reads. At least one is required.
    pub auth_secrets: Vec<String>,
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
        Ok(Self {
            database_url,
            bind,
            db_max_connections,
            auth_secrets,
        })
    }
}
