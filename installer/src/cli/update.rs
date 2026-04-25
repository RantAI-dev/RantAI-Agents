use std::process::ExitCode;
use tokio::sync::mpsc;

pub fn run(branch: Option<&str>) -> ExitCode {
    let path = crate::state::InstallState::default_path(crate::installer::is_root());
    let state = match crate::state::InstallState::load_from(&path) {
        Ok(Some(s)) => s,
        Ok(None) => {
            eprintln!(
                "No install detected at {}. Run the installer first.",
                path.display()
            );
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("Failed to read {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
    };

    if let Some(b) = branch {
        // Honour the --branch flag via env so executor::Phase::Update sees it.
        std::env::set_var("RANTAI_AGENTS_BRANCH", b);
    }

    // Build an InstallConfig from state for update_mode = true.
    let config = crate::app::InstallConfig {
        profile: state.profile,
        mode: state.mode,
        install_dir: state.install_dir.clone(),
        data_dir: state.data_dir.clone(),
        update_mode: true,
        ..Default::default()
    };

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("tokio init: {e}");
            return ExitCode::FAILURE;
        }
    };

    rt.block_on(async {
        let (tx, mut rx) = mpsc::channel::<crate::installer::executor::InstallMessage>(64);
        let install = tokio::spawn(async move {
            crate::installer::executor::run_installation(config, tx).await;
        });

        let mut had_error = false;
        while let Some(msg) = rx.recv().await {
            use crate::installer::executor::InstallMessage::*;
            match msg {
                PhaseStart(p) => println!("  > {}", p.label()),
                PhaseComplete(p) => println!("  + {}", p.label()),
                PhaseSkipped(p) => println!("  - {} (skipped)", p.label()),
                Progress(s) => println!("    {s}"),
                Log(_, s) => println!("    {s}"),
                Error(p, e) => {
                    eprintln!("  x {}: {e}", p.label());
                    had_error = true;
                }
                Done(Ok(())) => println!("Update complete."),
                Done(Err(e)) => {
                    eprintln!("Update failed: {e}");
                    had_error = true;
                }
            }
        }

        let _ = install.await;
        if had_error {
            ExitCode::FAILURE
        } else {
            ExitCode::SUCCESS
        }
    })
}
