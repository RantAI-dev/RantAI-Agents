use std::net::TcpListener;
use sysinfo::System;

use super::command_exists;
use crate::app::{CheckItem, InstallConfig, Status};

const MIN_RAM_MB: u64 = 2048;
const RECOMMENDED_DISK_GB: u64 = 5;

/// Run all preflight checks and return results.
pub fn run_preflight_checks(config: &InstallConfig) -> Vec<CheckItem> {
    let mut checks = Vec::new();

    checks.push(check_os());
    checks.push(check_architecture());
    checks.push(check_ram());
    checks.push(check_disk(&config.data_dir));
    checks.push(check_root_or_sudo());

    if config.mode.includes_docker_services() {
        checks.push(check_docker());
    }

    // Port checks — only for services that will be started locally
    let ports = get_required_ports(config);
    for (port, label) in ports {
        checks.push(check_port(port, &label));
    }

    checks
}

fn get_required_ports(config: &InstallConfig) -> Vec<(u16, String)> {
    let mut ports = vec![(3000, "Web UI (Next.js)".to_string())];

    if config.mode.includes_docker_services() {
        ports.push((5432, "PostgreSQL".to_string()));
        ports.push((8000, "SurrealDB".to_string()));
        ports.push((9000, "RustFS S3 API".to_string()));
        ports.push((9001, "RustFS Console".to_string()));

        if config.enable_ollama {
            ports.push((11434, "Ollama".to_string()));
        }
        if config.enable_piston {
            ports.push((2000, "Piston".to_string()));
        }
        if config.enable_searxng {
            ports.push((8080, "SearXNG".to_string()));
        }
    }

    ports
}

fn check_os() -> CheckItem {
    let os_id = read_os_release_field("ID");
    let os_name = read_os_release_field("PRETTY_NAME");

    match os_id.as_deref() {
        Some("ubuntu") | Some("debian") => CheckItem {
            name: "Operating System".to_string(),
            status: Status::Success,
            message: Some(os_name.unwrap_or_else(|| "Debian/Ubuntu".to_string())),
        },
        Some("rhel") | Some("centos") | Some("rocky") | Some("almalinux") | Some("fedora") => {
            CheckItem {
                name: "Operating System".to_string(),
                status: Status::Success,
                message: Some(os_name.unwrap_or_else(|| "RHEL-based".to_string())),
            }
        }
        Some(other) => CheckItem {
            name: "Operating System".to_string(),
            status: Status::Warning,
            message: Some(format!(
                "Unsupported OS '{}'. Installation may require manual steps.",
                os_name.as_deref().unwrap_or(other)
            )),
        },
        None => CheckItem {
            name: "Operating System".to_string(),
            status: Status::Warning,
            message: Some("Could not detect OS. Proceeding with best effort.".to_string()),
        },
    }
}

fn check_architecture() -> CheckItem {
    let arch = std::env::consts::ARCH;
    match arch {
        "x86_64" | "aarch64" => CheckItem {
            name: "Architecture".to_string(),
            status: Status::Success,
            message: Some(arch.to_string()),
        },
        other => CheckItem {
            name: "Architecture".to_string(),
            status: Status::Error,
            message: Some(format!("Unsupported architecture: {}", other)),
        },
    }
}

fn check_ram() -> CheckItem {
    let mut sys = System::new();
    sys.refresh_memory();
    let total_mb = sys.total_memory() / (1024 * 1024);

    if total_mb >= MIN_RAM_MB {
        CheckItem {
            name: "RAM".to_string(),
            status: Status::Success,
            message: Some(format!(
                "{} MB available (minimum {} MB)",
                total_mb, MIN_RAM_MB
            )),
        }
    } else {
        CheckItem {
            name: "RAM".to_string(),
            status: Status::Error,
            message: Some(format!(
                "{} MB available, minimum {} MB required",
                total_mb, MIN_RAM_MB
            )),
        }
    }
}

fn check_disk(data_dir: &str) -> CheckItem {
    // Check the parent path that exists for available disk space
    let check_path = find_existing_ancestor(data_dir);

    let mut sys = System::new();
    sys.refresh_all();

    // Use sysinfo Disks to check available space
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mut best_match: Option<(usize, u64)> = None; // (mount_point_len, available_bytes)

    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy().to_string();
        if check_path.starts_with(&mount) {
            let mount_len = mount.len();
            if best_match.is_none() || mount_len > best_match.unwrap().0 {
                best_match = Some((mount_len, disk.available_space()));
            }
        }
    }

    match best_match {
        Some((_, available)) => {
            let available_gb = available / (1024 * 1024 * 1024);
            if available_gb >= RECOMMENDED_DISK_GB {
                CheckItem {
                    name: "Disk Space".to_string(),
                    status: Status::Success,
                    message: Some(format!(
                        "{} GB available (recommended {} GB)",
                        available_gb, RECOMMENDED_DISK_GB
                    )),
                }
            } else {
                CheckItem {
                    name: "Disk Space".to_string(),
                    status: Status::Warning,
                    message: Some(format!(
                        "{} GB available, {} GB recommended",
                        available_gb, RECOMMENDED_DISK_GB
                    )),
                }
            }
        }
        None => CheckItem {
            name: "Disk Space".to_string(),
            status: Status::Warning,
            message: Some("Could not determine available disk space".to_string()),
        },
    }
}

fn check_root_or_sudo() -> CheckItem {
    if super::is_root() {
        return CheckItem {
            name: "Root/Sudo Access".to_string(),
            status: Status::Success,
            message: Some("Running as root".to_string()),
        };
    }

    // Check if user can sudo
    if command_exists("sudo") {
        CheckItem {
            name: "Root/Sudo Access".to_string(),
            status: Status::Success,
            message: Some("sudo available".to_string()),
        }
    } else {
        CheckItem {
            name: "Root/Sudo Access".to_string(),
            status: Status::Error,
            message: Some("Not root and sudo not available".to_string()),
        }
    }
}

fn check_docker() -> CheckItem {
    if !command_exists("docker") {
        return CheckItem {
            name: "Docker".to_string(),
            status: Status::Warning,
            message: Some("Docker not installed — will be installed automatically".to_string()),
        };
    }

    // Check docker is running
    match super::run_command("docker", &["info"]) {
        Ok(_) => CheckItem {
            name: "Docker".to_string(),
            status: Status::Success,
            message: Some("Docker is installed and running".to_string()),
        },
        Err(_) => CheckItem {
            name: "Docker".to_string(),
            status: Status::Warning,
            message: Some("Docker is installed but not running or not accessible".to_string()),
        },
    }
}

fn check_port(port: u16, label: &str) -> CheckItem {
    match TcpListener::bind(("0.0.0.0", port)) {
        Ok(_) => CheckItem {
            name: format!("Port {} ({})", port, label),
            status: Status::Success,
            message: Some("Available".to_string()),
        },
        Err(_) => CheckItem {
            name: format!("Port {} ({})", port, label),
            status: Status::Warning,
            message: Some("Port already in use — service may conflict".to_string()),
        },
    }
}

/// Read a field from /etc/os-release.
fn read_os_release_field(field: &str) -> Option<String> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    for line in content.lines() {
        if let Some(val) = line.strip_prefix(&format!("{}=", field)) {
            return Some(val.trim_matches('"').to_string());
        }
    }
    None
}

/// Walk up the path to find an existing ancestor directory.
fn find_existing_ancestor(path: &str) -> String {
    let mut p = std::path::PathBuf::from(path);
    while !p.exists() {
        if !p.pop() {
            return "/".to_string();
        }
    }
    p.to_string_lossy().to_string()
}
