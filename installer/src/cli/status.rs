use std::process::ExitCode;

pub fn run() -> ExitCode {
    let path = crate::state::InstallState::default_path(crate::installer::is_root());
    let state = match crate::state::InstallState::load_from(&path) {
        Ok(Some(s)) => s,
        Ok(None) => {
            eprintln!("No install state found at {}.", path.display());
            eprintln!("Run the installer first: ./rantai-agents-installer");
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("Failed to read {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
    };

    println!("Profile:     {:?}", state.profile);
    println!("Mode:        {:?}", state.mode);
    println!("Install dir: {}", state.install_dir);
    println!("Git sha:     {}", state.git_sha);
    println!();
    println!("Services:");

    let mut services = vec![];
    if state.profile.includes_app() {
        services.push("rantai-agents".to_string());
    }
    for sc in &state.sidecars {
        services.push(format!("rantai-agents-{sc}"));
    }
    for svc in services {
        let active = match crate::installer::run_command("systemctl", &["is-active", &svc]) {
            Ok(s) => s.trim().to_string(),
            Err(_) => "unknown".to_string(),
        };
        println!("  {svc:<32} {active}");
    }
    ExitCode::SUCCESS
}
