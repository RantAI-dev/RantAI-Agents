use rand::Rng;
use std::process::Command;

pub mod app_setup;
pub mod config;
pub mod database;
pub mod deps;
pub mod executor;
pub mod infrastructure;
pub mod preflight;
pub mod profile;
pub mod services;
pub mod sidecar;
pub mod verify;

pub fn run_command(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute {}: {}", cmd, e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn run_sudo(cmd: &str, args: &[&str]) -> Result<String, String> {
    if is_root() {
        run_command(cmd, args)
    } else {
        let mut sudo_args = vec![cmd];
        sudo_args.extend_from_slice(args);
        run_command("sudo", &sudo_args)
    }
}

pub fn command_exists(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn is_root() -> bool {
    nix::unistd::getuid().is_root()
}

pub fn generate_random_string(len: usize) -> String {
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| {
            let idx = rng.gen_range(0..36);
            if idx < 10 {
                (b'0' + idx) as char
            } else {
                (b'a' + idx - 10) as char
            }
        })
        .collect()
}

pub fn current_git_sha(install_dir: &str) -> String {
    use std::process::Command;
    Command::new("git")
        .args(["-C", install_dir, "rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string())
}
