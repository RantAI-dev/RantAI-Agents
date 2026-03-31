use tokio::sync::mpsc::Sender;

use super::executor::InstallMessage;
use super::{command_exists, run_command, run_sudo};
use crate::app::InstallConfig;

/// Detect the system package manager.
enum PackageManager {
    Apt,
    Dnf,
    Yum,
}

fn detect_package_manager() -> Result<PackageManager, String> {
    if command_exists("apt-get") {
        Ok(PackageManager::Apt)
    } else if command_exists("dnf") {
        Ok(PackageManager::Dnf)
    } else if command_exists("yum") {
        Ok(PackageManager::Yum)
    } else {
        Err("No supported package manager found (apt-get, dnf, yum)".to_string())
    }
}

/// Install system dependencies, Docker (if needed), and Bun runtime.
pub async fn install_dependencies(
    config: &InstallConfig,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    let pm = detect_package_manager()?;

    // ── Step 1: Install basic system packages ──
    tx.send(InstallMessage::Progress(
        "Installing system packages (curl, git, unzip)...".into(),
    ))
    .await
    .ok();

    match pm {
        PackageManager::Apt => {
            run_sudo("apt-get", &["update", "-qq"])?;
            run_sudo(
                "apt-get",
                &[
                    "install",
                    "-y",
                    "-qq",
                    "curl",
                    "git",
                    "unzip",
                    "ca-certificates",
                    "gnupg",
                    "lsb-release",
                ],
            )?;
        }
        PackageManager::Dnf => {
            run_sudo(
                "dnf",
                &[
                    "install",
                    "-y",
                    "-q",
                    "curl",
                    "git",
                    "unzip",
                    "ca-certificates",
                ],
            )?;
        }
        PackageManager::Yum => {
            run_sudo(
                "yum",
                &[
                    "install",
                    "-y",
                    "-q",
                    "curl",
                    "git",
                    "unzip",
                    "ca-certificates",
                ],
            )?;
        }
    }

    tx.send(InstallMessage::Progress("System packages installed".into()))
        .await
        .ok();

    // ── Step 2: Install Docker if needed and not present ──
    if config.mode.includes_docker_services() && !command_exists("docker") {
        tx.send(InstallMessage::Progress("Installing Docker...".into()))
            .await
            .ok();

        install_docker(&pm).await?;

        tx.send(InstallMessage::Progress(
            "Docker installed successfully".into(),
        ))
        .await
        .ok();
    } else if config.mode.includes_docker_services() {
        tx.send(InstallMessage::Progress(
            "Docker already installed, skipping".into(),
        ))
        .await
        .ok();
    }

    // ── Step 3: Install Bun runtime ──
    if config.mode.includes_native_app() {
        if !command_exists("bun") {
            tx.send(InstallMessage::Progress("Installing Bun runtime...".into()))
                .await
                .ok();

            install_bun().await?;

            tx.send(InstallMessage::Progress("Bun runtime installed".into()))
                .await
                .ok();
        } else {
            tx.send(InstallMessage::Progress(
                "Bun runtime already installed, skipping".into(),
            ))
            .await
            .ok();
        }
    }

    Ok(())
}

/// Install Docker via the official apt repository (Debian/Ubuntu) or dnf/yum.
async fn install_docker(pm: &PackageManager) -> Result<(), String> {
    match pm {
        PackageManager::Apt => {
            // Add Docker's official GPG key
            run_sudo("mkdir", &["-p", "/etc/apt/keyrings"])?;

            run_command(
                "sh",
                &["-c", "curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo $ID)/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes"],
            )?;

            // Set up the repository
            run_command(
                "sh",
                &[
                    "-c",
                    r#"echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo $ID) $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null"#,
                ],
            )?;

            run_sudo("apt-get", &["update", "-qq"])?;
            run_sudo(
                "apt-get",
                &[
                    "install",
                    "-y",
                    "-qq",
                    "docker-ce",
                    "docker-ce-cli",
                    "containerd.io",
                    "docker-compose-plugin",
                ],
            )?;
        }
        PackageManager::Dnf => {
            run_sudo(
                "dnf",
                &[
                    "config-manager",
                    "--add-repo",
                    "https://download.docker.com/linux/centos/docker-ce.repo",
                ],
            )?;
            run_sudo(
                "dnf",
                &[
                    "install",
                    "-y",
                    "docker-ce",
                    "docker-ce-cli",
                    "containerd.io",
                    "docker-compose-plugin",
                ],
            )?;
        }
        PackageManager::Yum => {
            run_sudo(
                "yum-config-manager",
                &["--add-repo", "https://download.docker.com/linux/centos/docker-ce.repo"],
            ).or_else(|_| {
                run_command("sh", &["-c", "curl -fsSL https://download.docker.com/linux/centos/docker-ce.repo | sudo tee /etc/yum.repos.d/docker-ce.repo > /dev/null"])
            })?;
            run_sudo(
                "yum",
                &[
                    "install",
                    "-y",
                    "docker-ce",
                    "docker-ce-cli",
                    "containerd.io",
                    "docker-compose-plugin",
                ],
            )?;
        }
    }

    // Start and enable Docker
    run_sudo("systemctl", &["start", "docker"])?;
    run_sudo("systemctl", &["enable", "docker"])?;

    // Add current user to docker group if not root
    if !super::is_root() {
        if let Ok(user) = std::env::var("USER") {
            let _ = run_sudo("usermod", &["-aG", "docker", &user]);
        }
    }

    Ok(())
}

/// Install Bun via the official install script.
async fn install_bun() -> Result<(), String> {
    run_command("sh", &["-c", "curl -fsSL https://bun.sh/install | bash"])?;

    // Verify bun is available (it installs to ~/.bun/bin)
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let bun_path = format!("{home}/.bun/bin/bun");
    if std::path::Path::new(&bun_path).exists() {
        Ok(())
    } else if command_exists("bun") {
        Ok(())
    } else {
        Err("Bun installed but binary not found. You may need to restart your shell.".to_string())
    }
}
