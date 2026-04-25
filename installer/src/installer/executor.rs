use tokio::sync::mpsc::Sender;

use crate::app::{InstallConfig, LogLevel, Phase, Status};

/// Messages sent from the installation executor to the TUI.
#[derive(Debug, Clone)]
pub enum InstallMessage {
    /// A new phase is starting.
    PhaseStart(Phase),
    /// A phase completed successfully.
    PhaseComplete(Phase),
    /// A phase was skipped.
    PhaseSkipped(Phase),
    /// Progress text within the current phase.
    Progress(String),
    /// A log message with severity.
    Log(LogLevel, String),
    /// A phase failed with an error.
    Error(Phase, String),
    /// The entire installation is done (success or failure).
    Done(Result<(), String>),
}

/// Run the full installation pipeline, sending progress through the channel.
pub async fn run_installation(config: InstallConfig, tx: Sender<InstallMessage>) {
    let mut config = config;

    for &phase in Phase::ALL {
        if should_skip_phase(phase, &config) {
            tx.send(InstallMessage::PhaseSkipped(phase)).await.ok();
            continue;
        }

        tx.send(InstallMessage::PhaseStart(phase)).await.ok();

        let result = execute_phase(phase, &mut config, &tx).await;

        match result {
            Ok(()) => {
                tx.send(InstallMessage::PhaseComplete(phase)).await.ok();
            }
            Err(e) => {
                tx.send(InstallMessage::Error(phase, e.clone())).await.ok();
                tx.send(InstallMessage::Done(Err(format!(
                    "Installation failed at phase '{}': {}",
                    phase.label(),
                    e
                ))))
                .await
                .ok();
                return;
            }
        }
    }

    {
        use crate::installer::current_git_sha;
        use crate::state::InstallState;

        let mut sidecars = Vec::new();
        if config.profile.includes_sidecars() {
            if config.sidecar.mineru_enabled {
                sidecars.push("mineru".to_string());
            }
            if config.sidecar.rerank_enabled {
                sidecars.push("rerank".to_string());
            }
        }

        let state = InstallState {
            profile: config.profile,
            mode: config.mode,
            install_dir: config.install_dir.clone(),
            data_dir: config.data_dir.clone(),
            git_sha: current_git_sha(&config.install_dir),
            installer_version: env!("CARGO_PKG_VERSION").to_string(),
            installed_at: chrono::Utc::now().to_rfc3339(),
            sidecars,
        };
        let path = InstallState::default_path(crate::installer::is_root());
        if let Err(e) = state.save_to(&path) {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!("Failed to write install state: {e}"),
            ))
            .await
            .ok();
        } else {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Info,
                format!("Install state saved to {}", path.display()),
            ))
            .await
            .ok();
        }
    }

    tx.send(InstallMessage::Done(Ok(()))).await.ok();
}

/// Determine whether a phase should be skipped based on install profile + mode.
fn should_skip_phase(phase: Phase, config: &InstallConfig) -> bool {
    // Profile-based skip takes precedence over mode-based logic.
    if crate::installer::profile::profile_skips_phase(config.profile, phase) {
        return true;
    }

    // Update phase only runs when update_mode is active.
    if phase == Phase::Update && !config.update_mode {
        return true;
    }

    // In update mode, skip phases that are already handled by the running system.
    if config.update_mode
        && matches!(
            phase,
            Phase::Infrastructure | Phase::ApplicationSetup | Phase::Services
        )
    {
        return true;
    }

    match phase {
        // Preflight always runs
        Phase::Preflight => false,

        // Update: handled above (skipped when not update_mode)
        Phase::Update => false,

        // Dependencies: skip in Docker-only mode (no native app)
        Phase::Dependencies => {
            !config.mode.includes_native_app() && !config.mode.includes_docker_services()
        }

        // Infrastructure: skip if no docker services
        Phase::Infrastructure => !config.mode.includes_docker_services(),

        // App setup: skip if not building native app
        Phase::ApplicationSetup => !config.mode.includes_native_app(),

        // Config: always runs (even Docker mode needs .env)
        Phase::Configuration => false,

        // Database: always runs (prisma migrate)
        Phase::Database => false,

        // Services: skip if systemd not wanted
        Phase::Services => !config.install_services,

        // SidecarInstall: only run when the profile includes sidecars
        Phase::SidecarInstall => !config.profile.includes_sidecars(),

        // Verification: always runs
        Phase::Verification => false,
    }
}

/// Execute a single phase.
async fn execute_phase(
    phase: Phase,
    config: &mut InstallConfig,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    match phase {
        Phase::Preflight => {
            tx.send(InstallMessage::Progress(
                "Running preflight checks...".into(),
            ))
            .await
            .ok();

            let checks = super::preflight::run_preflight_checks(config);
            let errors: Vec<_> = checks
                .iter()
                .filter(|c| c.status == Status::Error)
                .collect();

            if !errors.is_empty() {
                let msg = errors
                    .iter()
                    .map(|c| format!("{}: {}", c.name, c.message.as_deref().unwrap_or("failed")))
                    .collect::<Vec<_>>()
                    .join("; ");
                return Err(format!("Preflight check failures: {}", msg));
            }

            // Log warnings
            for check in &checks {
                if check.status == Status::Warning {
                    tx.send(InstallMessage::Log(
                        LogLevel::Warning,
                        format!("{}: {}", check.name, check.message.as_deref().unwrap_or("")),
                    ))
                    .await
                    .ok();
                }
            }

            Ok(())
        }

        Phase::Update => {
            use super::update;
            let branch =
                std::env::var("RANTAI_AGENTS_BRANCH").unwrap_or_else(|_| "main".to_string());
            let result = update::git_update(&config.install_dir, &branch, tx).await?;
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Info,
                format!(
                    "Pulled {} → {} ({}{})",
                    result.old_sha,
                    result.new_sha,
                    if result.old_sha == result.new_sha {
                        "no changes"
                    } else {
                        "updated"
                    },
                    if result.stash_used {
                        "; stash auto-restored"
                    } else {
                        ""
                    },
                ),
            ))
            .await
            .ok();
            Ok(())
        }

        Phase::Dependencies => super::deps::install_dependencies(config, tx).await,

        Phase::Infrastructure => super::infrastructure::start_infrastructure(config, tx).await,

        Phase::ApplicationSetup => super::app_setup::setup_application(config, tx).await,

        Phase::Configuration => {
            tx.send(InstallMessage::Progress(
                "Generating .env configuration...".into(),
            ))
            .await
            .ok();

            super::config::generate_config(config)?;

            tx.send(InstallMessage::Progress(format!(
                "Configuration written to {}/.env",
                config.install_dir
            )))
            .await
            .ok();

            Ok(())
        }

        Phase::Database => super::database::run_database_migrations(config, tx).await,

        Phase::Services => super::services::install_services(config, tx).await,

        Phase::SidecarInstall => {
            use super::sidecar;
            let repo = config.install_dir.clone();

            sidecar::ensure_venv(config, tx).await?;

            if config.sidecar.mineru_enabled {
                let req = format!("{repo}/services/mineru-server/requirements.txt");
                sidecar::pip_install_requirements(config, &req, tx).await?;
            }
            if config.sidecar.rerank_enabled {
                let req = format!("{repo}/services/rerank-server/requirements.txt");
                sidecar::pip_install_requirements(config, &req, tx).await?;
                let model = config.sidecar.rerank_model.clone();
                sidecar::prefetch_hf_model(config, &model, tx).await?;
            }

            sidecar::install_sidecar_services(config, &repo, tx).await?;
            Ok(())
        }

        Phase::Verification => {
            tx.send(InstallMessage::Progress(
                "Running post-install verification...".into(),
            ))
            .await
            .ok();

            let checks = super::verify::run_verification(config);

            for check in &checks {
                let level = match check.status {
                    Status::Success => LogLevel::Success,
                    Status::Warning => LogLevel::Warning,
                    Status::Error => LogLevel::Error,
                    _ => LogLevel::Info,
                };
                tx.send(InstallMessage::Log(
                    level,
                    format!(
                        "{}: {}",
                        check.name,
                        check.message.as_deref().unwrap_or("ok")
                    ),
                ))
                .await
                .ok();
            }

            let error_count = checks.iter().filter(|c| c.status == Status::Error).count();
            if error_count > 0 {
                tx.send(InstallMessage::Log(
                    LogLevel::Warning,
                    format!(
                        "{} verification check(s) failed — review above",
                        error_count
                    ),
                ))
                .await
                .ok();
            }

            // Verification warnings don't fail the install
            Ok(())
        }
    }
}
