use std::process::ExitCode;

pub fn run() -> ExitCode {
    let installer_version = env!("CARGO_PKG_VERSION");
    println!("rantai-agents-installer {installer_version}");

    let path = crate::state::InstallState::default_path(crate::installer::is_root());
    match crate::state::InstallState::load_from(&path) {
        Ok(Some(s)) => {
            println!("installed     {} (sha {})", s.installer_version, s.git_sha);
            println!("install dir   {}", s.install_dir);
            println!("profile       {:?}", s.profile);
            println!("installed at  {}", s.installed_at);
        }
        Ok(None) => println!("(no install state at {})", path.display()),
        Err(e) => {
            eprintln!("failed to read {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
    }
    ExitCode::SUCCESS
}
