use std::fs;
use tokio::sync::mpsc::Sender;

use super::executor::InstallMessage;
use super::{run_command, run_sudo};
use crate::app::InstallConfig;

const SERVICE_NAME: &str = "rantai-agents";
const SERVICE_USER: &str = "rantai-agents";

/// Install and enable the systemd service for RantAI Agents.
pub async fn install_services(
    config: &InstallConfig,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    let install_dir = &config.install_dir;

    // ── Step 1: Create system user ──
    tx.send(InstallMessage::Progress(format!(
        "Creating system user '{}'...",
        SERVICE_USER
    )))
    .await
    .ok();

    create_service_user()?;

    // ── Step 2: Set directory ownership ──
    tx.send(InstallMessage::Progress(
        "Setting directory ownership...".into(),
    ))
    .await
    .ok();

    run_sudo(
        "chown",
        &["-R", &format!("{SERVICE_USER}:{SERVICE_USER}"), install_dir],
    )?;
    run_sudo(
        "chown",
        &[
            "-R",
            &format!("{SERVICE_USER}:{SERVICE_USER}"),
            &config.data_dir,
        ],
    )?;

    // Ensure .env is readable by service user but not world-readable
    let env_path = format!("{install_dir}/.env");
    if std::path::Path::new(&env_path).exists() {
        run_sudo(
            "chown",
            &[&format!("{SERVICE_USER}:{SERVICE_USER}"), &env_path],
        )?;
        run_sudo("chmod", &["600", &env_path])?;
    }

    // ── Step 3: Find bun binary for ExecStart ──
    let bun_path = find_bun_absolute_path()?;

    // ── Step 4: Write systemd unit file ──
    tx.send(InstallMessage::Progress(
        "Writing systemd service unit...".into(),
    ))
    .await
    .ok();

    let unit_content = generate_unit_file(install_dir, &bun_path);
    let unit_path = format!("/etc/systemd/system/{SERVICE_NAME}.service");

    // Write via temp file + sudo mv to handle permissions
    let tmp_path = format!("/tmp/{SERVICE_NAME}.service");
    fs::write(&tmp_path, &unit_content)
        .map_err(|e| format!("Failed to write temp unit file: {}", e))?;
    run_sudo("mv", &[&tmp_path, &unit_path])?;
    run_sudo("chmod", &["644", &unit_path])?;

    // ── Step 5: Reload systemd, enable and start ──
    tx.send(InstallMessage::Progress(
        "Enabling and starting systemd service...".into(),
    ))
    .await
    .ok();

    run_sudo("systemctl", &["daemon-reload"])?;
    run_sudo("systemctl", &["enable", SERVICE_NAME])?;
    run_sudo("systemctl", &["start", SERVICE_NAME])?;

    // Quick check that the service started
    std::thread::sleep(std::time::Duration::from_secs(2));
    let status = run_command("systemctl", &["is-active", SERVICE_NAME]);
    match status {
        Ok(out) if out.trim() == "active" => {
            tx.send(InstallMessage::Progress(format!(
                "Service '{}' is running",
                SERVICE_NAME
            )))
            .await
            .ok();
        }
        _ => {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!(
                    "Service '{}' may not have started cleanly. Check: systemctl status {}",
                    SERVICE_NAME, SERVICE_NAME
                ),
            ))
            .await
            .ok();
        }
    }

    Ok(())
}

/// Create the rantai-agents system user if it doesn't exist.
fn create_service_user() -> Result<(), String> {
    // Check if user already exists
    let check = run_command("id", &[SERVICE_USER]);
    if check.is_ok() {
        return Ok(());
    }

    run_sudo(
        "useradd",
        &[
            "--system",
            "--no-create-home",
            "--shell",
            "/usr/sbin/nologin",
            "--comment",
            "RantAI Agents Service",
            SERVICE_USER,
        ],
    )?;

    Ok(())
}

/// Generate the systemd unit file content with security hardening.
fn generate_unit_file(install_dir: &str, bun_path: &str) -> String {
    format!(
        r#"[Unit]
Description=RantAI Agents Platform
Documentation=https://github.com/RantAI-dev/RantAI-Agents
After=network.target docker.service postgresql.service
Wants=docker.service

[Service]
Type=simple
User={user}
Group={user}
WorkingDirectory={install_dir}
EnvironmentFile={install_dir}/.env
ExecStart={bun_path} run start
Restart=on-failure
RestartSec=10
TimeoutStartSec=120
TimeoutStopSec=30

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier={service}

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true

# Allow write access to install and data dirs
ReadWritePaths={install_dir}

[Install]
WantedBy=multi-user.target
"#,
        user = SERVICE_USER,
        install_dir = install_dir,
        bun_path = bun_path,
        service = SERVICE_NAME,
    )
}

/// Find the absolute path to the bun binary.
fn find_bun_absolute_path() -> Result<String, String> {
    // Try `which bun` first
    if let Ok(output) = run_command("which", &["bun"]) {
        let path = output.trim().to_string();
        if !path.is_empty() {
            return Ok(path);
        }
    }

    // Check common locations
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

    Err("Cannot find bun binary — absolute path required for systemd".to_string())
}
