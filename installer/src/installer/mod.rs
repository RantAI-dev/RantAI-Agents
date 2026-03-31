use std::process::Command;
use rand::Rng;

pub mod preflight;
pub mod deps;
pub mod infrastructure;
pub mod app_setup;
pub mod config;
pub mod database;
pub mod services;
pub mod verify;
pub mod executor;

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
            if idx < 10 { (b'0' + idx) as char } else { (b'a' + idx - 10) as char }
        })
        .collect()
}
