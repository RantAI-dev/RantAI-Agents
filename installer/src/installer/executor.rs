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

    tx.send(InstallMessage::Done(Ok(()))).await.ok();
}

/// Determine whether a phase should be skipped based on install mode.
fn should_skip_phase(phase: Phase, config: &InstallConfig) -> bool {
    match phase {
        // Preflight always runs
        Phase::Preflight => false,

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
