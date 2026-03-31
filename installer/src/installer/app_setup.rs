use std::fs;
use std::path::Path;
use tokio::sync::mpsc::Sender;

use super::executor::InstallMessage;
use super::{run_command, run_sudo};
use crate::app::InstallConfig;

const REPO_URL: &str = "https://github.com/RantAI-dev/RantAI-Agents.git";
const SUBMODULE_RANTAICLAW_URL: &str = "https://github.com/RantAI-dev/RantaiClaw.git";
const SUBMODULE_COMMUNITY_URL: &str = "https://github.com/RantAI-dev/RantAI-Agents-Community.git";

/// Clone the repository, initialize submodules, install dependencies, and build.
pub async fn setup_application(
    config: &InstallConfig,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    let install_dir = &config.install_dir;

    // ── Step 1: Clone repository ──
    if Path::new(&format!("{install_dir}/.git")).exists() {
        tx.send(InstallMessage::Progress(
            "Repository already cloned, pulling latest...".into(),
        ))
        .await
        .ok();
        run_command("git", &["-C", install_dir, "pull", "--ff-only"]).or_else(|_| {
            // If pull fails (diverged), just reset to origin
            run_command("git", &["-C", install_dir, "fetch", "origin"])?;
            run_command(
                "git",
                &["-C", install_dir, "reset", "--hard", "origin/main"],
            )
        })?;
    } else {
        tx.send(InstallMessage::Progress(format!(
            "Cloning repository to {}...",
            install_dir
        )))
        .await
        .ok();

        // Ensure parent directory exists
        if let Some(parent) = Path::new(install_dir).parent() {
            run_sudo("mkdir", &["-p", &parent.to_string_lossy()])?;
        }
        run_sudo("mkdir", &["-p", install_dir])?;

        // Set ownership to current user for the clone
        if !super::is_root() {
            if let Ok(user) = std::env::var("USER") {
                let _ = run_sudo("chown", &["-R", &format!("{}:{}", user, user), install_dir]);
            }
        }

        run_command("git", &["clone", "--depth", "1", REPO_URL, install_dir])?;
    }

    // ── Step 2: Rewrite .gitmodules SSH URLs to HTTPS ──
    tx.send(InstallMessage::Progress(
        "Configuring submodule URLs for HTTPS...".into(),
    ))
    .await
    .ok();

    rewrite_submodule_urls(install_dir)?;

    // ── Step 3: Initialize and update submodules ──
    tx.send(InstallMessage::Progress(
        "Initializing git submodules...".into(),
    ))
    .await
    .ok();

    run_command("git", &["-C", install_dir, "submodule", "init"])?;
    run_command(
        "git",
        &["-C", install_dir, "submodule", "update", "--depth", "1"],
    )?;

    // ── Step 4: Install Node dependencies via Bun ──
    tx.send(InstallMessage::Progress(
        "Installing dependencies with Bun...".into(),
    ))
    .await
    .ok();

    let bun = find_bun_binary()?;
    run_command(&bun, &["install", "--cwd", install_dir])?;

    // ── Step 5: Build the application ──
    tx.send(InstallMessage::Progress(
        "Building application (bun run build)...".into(),
    ))
    .await
    .ok();

    // Ensure .env exists before build (Next.js needs env vars at build time)
    let env_path = format!("{install_dir}/.env");
    if !Path::new(&env_path).exists() {
        // Write a minimal .env so build doesn't fail on missing vars
        fs::write(&env_path, "# Placeholder — will be overwritten by config phase\nDATABASE_URL=postgresql://localhost/placeholder\n")
            .map_err(|e| format!("Failed to write placeholder .env: {}", e))?;
    }

    run_command(&bun, &["run", "--cwd", install_dir, "build"])?;

    tx.send(InstallMessage::Progress(
        "Application build complete".into(),
    ))
    .await
    .ok();

    Ok(())
}

/// Rewrite .gitmodules to use HTTPS URLs, then sync.
fn rewrite_submodule_urls(install_dir: &str) -> Result<(), String> {
    // Use git submodule set-url for each known submodule
    let _ = run_command(
        "git",
        &[
            "-C",
            install_dir,
            "submodule",
            "set-url",
            "packages/rantaiclaw",
            SUBMODULE_RANTAICLAW_URL,
        ],
    );
    let _ = run_command(
        "git",
        &[
            "-C",
            install_dir,
            "submodule",
            "set-url",
            "packages/community",
            SUBMODULE_COMMUNITY_URL,
        ],
    );

    // Also do a brute-force replacement in .gitmodules if the file exists
    let gitmodules_path = format!("{install_dir}/.gitmodules");
    if let Ok(content) = fs::read_to_string(&gitmodules_path) {
        let rewritten = content
            .replace("git@github.com:", "https://github.com/")
            .replace("ssh://git@github.com/", "https://github.com/");
        if rewritten != content {
            fs::write(&gitmodules_path, &rewritten)
                .map_err(|e| format!("Failed to rewrite .gitmodules: {}", e))?;
        }
    }

    // Sync URLs from .gitmodules into .git/config
    run_command("git", &["-C", install_dir, "submodule", "sync"])?;

    Ok(())
}

/// Find the bun binary. It may be in PATH, or in ~/.bun/bin.
fn find_bun_binary() -> Result<String, String> {
    // Check PATH first
    if super::command_exists("bun") {
        return Ok("bun".to_string());
    }

    // Check common install locations
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let candidates = [
        format!("{home}/.bun/bin/bun"),
        "/usr/local/bin/bun".to_string(),
        "/opt/bun/bin/bun".to_string(),
    ];

    for path in &candidates {
        if Path::new(path).exists() {
            return Ok(path.clone());
        }
    }

    Err("Bun binary not found. Ensure Bun is installed and in PATH.".to_string())
}
