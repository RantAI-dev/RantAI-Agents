use std::process::ExitCode;

use agents_server::{app, config::Config};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            tracing::error!(error = %e, "agents-server stopped");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::from_env()?;
    // Lazy: the process starts (and /healthz answers) even while Postgres is still coming up.
    let db = PgPoolOptions::new()
        .max_connections(config.db_max_connections)
        .connect_lazy(&config.database_url)?;
    let listener = tokio::net::TcpListener::bind(&config.bind).await?;
    tracing::info!(bind = %config.bind, "agents-server listening");
    let auth = agents_server::auth::AuthConfig {
        secrets: config.auth_secrets.clone(),
    };
    let mut state = agents_server::AppState::new(db, auth);
    state.wizard = std::sync::Arc::new(agents_server::policy::ConfiguredWizard::new(
        agents_server::policy::WIZARD_MODEL_ID,
        config.llm.provider.minimax_api_key.is_some(),
    ));
    state.llm = config.llm.clone();
    state.chat_max_steps = config.chat_max_steps;
    state.chat_max_steps_cap = config.chat_max_steps_cap;
    state.platform_context = config.platform_context;
    state.signin = std::sync::Arc::new(agents_server::signin::SignIn {
        public_url: config.public_url.clone(),
        credential_key: config.credential_key.clone(),
        env_provider: config.env_provider.clone(),
        ..agents_server::signin::SignIn::default()
    });
    axum::serve(listener, app(state))
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! { () = ctrl_c => {}, () = term => {} }
}
