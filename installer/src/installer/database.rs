use std::thread;
use std::time::Duration;
use tokio::sync::mpsc::Sender;

use crate::app::InstallConfig;
use super::executor::InstallMessage;
use super::run_command;

/// Run Prisma database migrations and seed.
pub async fn run_database_migrations(config: &InstallConfig, tx: &Sender<InstallMessage>) -> Result<(), String> {
    let install_dir = &config.install_dir;

    // ── Step 1: Wait for PostgreSQL to be ready ──
    tx.send(InstallMessage::Progress("Waiting for PostgreSQL to accept connections...".into()))
        .await
        .ok();

    wait_for_postgres(config)?;

    // ── Step 2: Find bun/bunx binary ──
    let bun = find_bun_binary()?;

    // Build DATABASE_URL for the migration command
    let database_url = format!(
        "postgresql://{}:{}@{}:{}/{}",
        config.db_user,
        config.db_password,
        config.db_host,
        config.db_port,
        config.db_name,
    );

    // ── Step 3: Run prisma migrate deploy ──
    tx.send(InstallMessage::Progress("Running Prisma migrations (prisma migrate deploy)...".into()))
        .await
        .ok();

    // Use bun to run prisma via npx-like invocation
    let migrate_output = std::process::Command::new(&bun)
        .args(["x", "prisma", "migrate", "deploy"])
        .current_dir(install_dir)
        .env("DATABASE_URL", &database_url)
        .output()
        .map_err(|e| format!("Failed to run prisma migrate: {}", e))?;

    if !migrate_output.status.success() {
        let stderr = String::from_utf8_lossy(&migrate_output.stderr);
        // If migrate deploy fails, try db push as fallback (handles shadow DB issues)
        tx.send(InstallMessage::Log(
            crate::app::LogLevel::Warning,
            format!("prisma migrate deploy failed ({}), trying db push fallback...", stderr.lines().next().unwrap_or("unknown error")),
        ))
        .await
        .ok();

        let push_output = std::process::Command::new(&bun)
            .args(["x", "prisma", "db", "push", "--accept-data-loss"])
            .current_dir(install_dir)
            .env("DATABASE_URL", &database_url)
            .output()
            .map_err(|e| format!("Failed to run prisma db push: {}", e))?;

        if !push_output.status.success() {
            let push_err = String::from_utf8_lossy(&push_output.stderr);
            return Err(format!("Database migration failed: {}", push_err));
        }
    }

    tx.send(InstallMessage::Progress("Database migrations applied".into()))
        .await
        .ok();

    // ── Step 4: Run seed (optional, don't fail on error) ──
    tx.send(InstallMessage::Progress("Running database seed...".into()))
        .await
        .ok();

    let seed_output = std::process::Command::new(&bun)
        .args(["x", "prisma", "db", "seed"])
        .current_dir(install_dir)
        .env("DATABASE_URL", &database_url)
        .output();

    match seed_output {
        Ok(output) if output.status.success() => {
            tx.send(InstallMessage::Progress("Database seeded successfully".into()))
                .await
                .ok();
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!("Database seed returned non-zero (may be normal): {}", stderr.lines().next().unwrap_or("")),
            ))
            .await
            .ok();
        }
        Err(e) => {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!("Could not run database seed: {}", e),
            ))
            .await
            .ok();
        }
    }

    Ok(())
}

/// Wait for PostgreSQL to accept connections using pg_isready or TCP probe.
fn wait_for_postgres(config: &InstallConfig) -> Result<(), String> {
    let host = &config.db_host;
    let port: u16 = config.db_port.parse().unwrap_or(5432);
    let max_attempts = 30;
    let delay = Duration::from_secs(2);

    for attempt in 1..=max_attempts {
        // Try pg_isready first (more reliable)
        if super::command_exists("pg_isready") {
            let result = run_command(
                "pg_isready",
                &["-h", host, "-p", &config.db_port, "-U", &config.db_user],
            );
            if result.is_ok() {
                return Ok(());
            }
        } else {
            // Fall back to TCP probe
            let addr = format!("{}:{}", host, port);
            if let Ok(addr) = addr.parse::<std::net::SocketAddr>() {
                if std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(2)).is_ok() {
                    // Small extra delay after TCP connects — PG may not be accepting queries yet
                    thread::sleep(Duration::from_secs(1));
                    return Ok(());
                }
            }
        }

        if attempt < max_attempts {
            thread::sleep(delay);
        }
    }

    Err(format!(
        "PostgreSQL at {}:{} did not become ready after {} attempts",
        host, port, max_attempts
    ))
}

/// Find the bun binary (shared helper).
fn find_bun_binary() -> Result<String, String> {
    if super::command_exists("bun") {
        return Ok("bun".to_string());
    }

    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let candidates = [
        format!("{home}/.bun/bin/bun"),
        "/usr/local/bin/bun".to_string(),
        "/opt/bun/bin/bun".to_string(),
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Ok(path.clone());
        }
    }

    Err("Bun binary not found".to_string())
}
