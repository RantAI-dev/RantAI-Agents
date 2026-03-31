use std::fs;
use std::thread;
use std::time::Duration;
use tokio::sync::mpsc::Sender;

use crate::app::InstallConfig;
use super::executor::InstallMessage;
use super::run_command;

/// Start infrastructure services via docker compose.
pub async fn start_infrastructure(config: &InstallConfig, tx: &Sender<InstallMessage>) -> Result<(), String> {
    let compose_dir = format!("{}/docker", config.data_dir);
    fs::create_dir_all(&compose_dir)
        .map_err(|e| format!("Failed to create docker directory {}: {}", compose_dir, e))?;

    let compose_path = format!("{}/docker-compose.yml", compose_dir);

    tx.send(InstallMessage::Progress("Generating docker-compose.yml...".into()))
        .await
        .ok();

    let compose_content = generate_compose(config);
    fs::write(&compose_path, &compose_content)
        .map_err(|e| format!("Failed to write docker-compose.yml: {}", e))?;

    tx.send(InstallMessage::Progress("Starting Docker services...".into()))
        .await
        .ok();

    run_command("docker", &["compose", "-f", &compose_path, "up", "-d"])?;

    tx.send(InstallMessage::Progress("Waiting for services to become healthy...".into()))
        .await
        .ok();

    wait_for_services(config, tx).await?;

    Ok(())
}

/// Generate docker-compose.yml content based on config.
fn generate_compose(config: &InstallConfig) -> String {
    let mut services = String::new();
    let mut volumes = String::from("\nvolumes:\n");

    // ── PostgreSQL (always included) ──
    services.push_str(&format!(
        r#"  postgres:
    image: postgres:16
    container_name: rantai-agents-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: {db_user}
      POSTGRES_PASSWORD: {db_pass}
      POSTGRES_DB: {db_name}
    ports:
      - "{db_port}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U {db_user} -d {db_name}"]
      interval: 10s
      timeout: 5s
      retries: 5

"#,
        db_user = config.db_user,
        db_pass = config.db_password,
        db_name = config.db_name,
        db_port = config.db_port,
    ));
    volumes.push_str("  postgres_data:\n");

    // ── SurrealDB (always included) ──
    services.push_str(&format!(
        r#"  surrealdb:
    image: surrealdb/surrealdb:latest
    container_name: rantai-agents-surrealdb
    restart: unless-stopped
    user: root
    command: start --user {surreal_user} --pass {surreal_pass} file:/data/database.db
    ports:
      - "8000:8000"
    volumes:
      - surrealdb_data:/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

"#,
        surreal_user = config.surrealdb_user,
        surreal_pass = config.surrealdb_pass,
    ));
    volumes.push_str("  surrealdb_data:\n");

    // ── RustFS (always included) ──
    services.push_str(&format!(
        r#"  rustfs:
    image: rustfs/rustfs:latest
    container_name: rantai-agents-rustfs
    restart: unless-stopped
    environment:
      RUSTFS_ROOT_USER: {s3_key}
      RUSTFS_ROOT_PASSWORD: {s3_secret}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - rustfs_data:/data

"#,
        s3_key = config.s3_access_key,
        s3_secret = config.s3_secret_key,
    ));
    volumes.push_str("  rustfs_data:\n");

    // ── Ollama (optional) ──
    if config.enable_ollama {
        services.push_str(
            r#"  ollama:
    image: ollama/ollama:latest
    container_name: rantai-agents-ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:11434/api/tags || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

"#,
        );
        volumes.push_str("  ollama_data:\n");
    }

    // ── Piston (optional) ──
    if config.enable_piston {
        services.push_str(
            r#"  piston:
    image: ghcr.io/engineer-man/piston
    container_name: rantai-agents-piston
    restart: unless-stopped
    privileged: true
    ports:
      - "2000:2000"
    environment:
      - PISTON_RUN_TIMEOUT=15000
      - PISTON_COMPILE_TIMEOUT=15000
      - PISTON_RUN_MEMORY_LIMIT=256000000
      - PISTON_OUTPUT_MAX_SIZE=4194304
    volumes:
      - piston_packages:/piston/packages
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:2000/api/v2/runtimes || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

"#,
        );
        volumes.push_str("  piston_packages:\n");
    }

    // ── SearXNG (optional) ──
    if config.enable_searxng {
        services.push_str(
            r#"  searxng:
    image: searxng/searxng:latest
    container_name: rantai-agents-searxng
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - searxng_data:/etc/searxng
    environment:
      - SEARXNG_BASE_URL=http://localhost:8080/
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

"#,
        );
        volumes.push_str("  searxng_data:\n");
    }

    format!("services:\n{services}{volumes}")
}

/// Wait for critical services (postgres, surrealdb, rustfs) to become healthy.
async fn wait_for_services(config: &InstallConfig, tx: &Sender<InstallMessage>) -> Result<(), String> {
    let max_attempts = 30;
    let delay = Duration::from_secs(2);

    // Wait for PostgreSQL
    tx.send(InstallMessage::Progress("Waiting for PostgreSQL...".into()))
        .await
        .ok();
    wait_for_tcp("localhost", config.db_port.parse().unwrap_or(5432), max_attempts, delay)?;

    // Wait for SurrealDB
    tx.send(InstallMessage::Progress("Waiting for SurrealDB...".into()))
        .await
        .ok();
    wait_for_http("http://localhost:8000/health", max_attempts, delay)?;

    // Wait for RustFS
    tx.send(InstallMessage::Progress("Waiting for RustFS...".into()))
        .await
        .ok();
    wait_for_tcp("localhost", 9000, max_attempts / 2, delay)?;

    // Wait for optional services (fewer retries — they're non-critical)
    if config.enable_ollama {
        tx.send(InstallMessage::Progress("Waiting for Ollama...".into()))
            .await
            .ok();
        if let Err(e) = wait_for_http("http://localhost:11434/api/tags", 15, delay) {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!("Ollama slow to start: {}", e),
            ))
            .await
            .ok();
        }
    }

    if config.enable_piston {
        tx.send(InstallMessage::Progress("Waiting for Piston...".into()))
            .await
            .ok();
        if let Err(e) = wait_for_http("http://localhost:2000/api/v2/runtimes", 15, delay) {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!("Piston slow to start: {}", e),
            ))
            .await
            .ok();
        }
    }

    if config.enable_searxng {
        tx.send(InstallMessage::Progress("Waiting for SearXNG...".into()))
            .await
            .ok();
        if let Err(e) = wait_for_http("http://localhost:8080/healthz", 15, delay) {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!("SearXNG slow to start: {}", e),
            ))
            .await
            .ok();
        }
    }

    Ok(())
}

/// Wait for a TCP port to be accepting connections.
fn wait_for_tcp(host: &str, port: u16, max_attempts: u32, delay: Duration) -> Result<(), String> {
    for attempt in 1..=max_attempts {
        if std::net::TcpStream::connect_timeout(
            &format!("{}:{}", host, port).parse().map_err(|e| format!("Bad address: {}", e))?,
            Duration::from_secs(2),
        )
        .is_ok()
        {
            return Ok(());
        }
        if attempt < max_attempts {
            thread::sleep(delay);
        }
    }
    Err(format!(
        "{}:{} did not become available after {} attempts",
        host, port, max_attempts
    ))
}

/// Wait for an HTTP endpoint to return a successful status.
fn wait_for_http(url: &str, max_attempts: u32, delay: Duration) -> Result<(), String> {
    for attempt in 1..=max_attempts {
        match run_command("curl", &["-sf", "--max-time", "3", url]) {
            Ok(_) => return Ok(()),
            Err(_) => {
                if attempt < max_attempts {
                    thread::sleep(delay);
                }
            }
        }
    }
    Err(format!(
        "{} did not become healthy after {} attempts",
        url, max_attempts
    ))
}
