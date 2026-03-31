use std::path::Path;
use std::thread;
use std::time::Duration;

use crate::app::{CheckItem, InstallConfig, Status};
use super::run_command;

/// Run all post-install verification checks.
pub fn run_verification(config: &InstallConfig) -> Vec<CheckItem> {
    let mut checks = Vec::new();
    let install_dir = &config.install_dir;

    // ── File system checks ──
    checks.push(check_file_exists(
        &format!("{install_dir}/.env"),
        "Configuration (.env)",
    ));
    checks.push(check_dir_exists(
        &format!("{install_dir}/node_modules"),
        "Dependencies (node_modules)",
    ));
    checks.push(check_dir_exists(
        &format!("{install_dir}/.next"),
        "Build Output (.next)",
    ));

    // ── Service health checks ──
    if config.mode.includes_docker_services() {
        checks.push(check_postgres(config));
        checks.push(check_surrealdb());
        checks.push(check_rustfs());

        if config.enable_ollama {
            checks.push(check_http_service(
                "http://localhost:11434/api/tags",
                "Ollama",
            ));
        }
        if config.enable_piston {
            checks.push(check_http_service(
                "http://localhost:2000/api/v2/runtimes",
                "Piston",
            ));
        }
        if config.enable_searxng {
            checks.push(check_http_service(
                "http://localhost:8080/healthz",
                "SearXNG",
            ));
        }
    }

    // ── Web UI check ──
    checks.push(check_web_ui(&config.nextauth_url));

    // ── Systemd service check ──
    if config.install_services {
        checks.push(check_systemd_service());
    }

    checks
}

fn check_file_exists(path: &str, label: &str) -> CheckItem {
    if Path::new(path).exists() {
        CheckItem {
            name: label.to_string(),
            status: Status::Success,
            message: Some(format!("{} exists", path)),
        }
    } else {
        CheckItem {
            name: label.to_string(),
            status: Status::Error,
            message: Some(format!("{} not found", path)),
        }
    }
}

fn check_dir_exists(path: &str, label: &str) -> CheckItem {
    if Path::new(path).is_dir() {
        CheckItem {
            name: label.to_string(),
            status: Status::Success,
            message: Some("Present".to_string()),
        }
    } else {
        CheckItem {
            name: label.to_string(),
            status: Status::Error,
            message: Some(format!("{} not found", path)),
        }
    }
}

fn check_postgres(config: &InstallConfig) -> CheckItem {
    let result = if super::command_exists("pg_isready") {
        run_command(
            "pg_isready",
            &["-h", &config.db_host, "-p", &config.db_port, "-U", &config.db_user],
        )
    } else {
        // TCP probe fallback
        let addr = format!("{}:{}", config.db_host, config.db_port);
        match addr.parse::<std::net::SocketAddr>() {
            Ok(addr) => {
                std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(3))
                    .map(|_| "connected".to_string())
                    .map_err(|e| e.to_string())
            }
            Err(e) => Err(e.to_string()),
        }
    };

    match result {
        Ok(_) => CheckItem {
            name: "PostgreSQL".to_string(),
            status: Status::Success,
            message: Some("Accepting connections".to_string()),
        },
        Err(e) => CheckItem {
            name: "PostgreSQL".to_string(),
            status: Status::Error,
            message: Some(format!("Not reachable: {}", e)),
        },
    }
}

fn check_surrealdb() -> CheckItem {
    check_http_service("http://localhost:8000/health", "SurrealDB")
}

fn check_rustfs() -> CheckItem {
    // RustFS doesn't have a /health endpoint — just check TCP on port 9000
    let addr: std::net::SocketAddr = "127.0.0.1:9000".parse().unwrap();
    match std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(3)) {
        Ok(_) => CheckItem {
            name: "RustFS (S3)".to_string(),
            status: Status::Success,
            message: Some("Port 9000 reachable".to_string()),
        },
        Err(e) => CheckItem {
            name: "RustFS (S3)".to_string(),
            status: Status::Error,
            message: Some(format!("Not reachable on port 9000: {}", e)),
        },
    }
}

fn check_http_service(url: &str, label: &str) -> CheckItem {
    match run_command("curl", &["-sf", "--max-time", "5", url]) {
        Ok(_) => CheckItem {
            name: label.to_string(),
            status: Status::Success,
            message: Some("Healthy".to_string()),
        },
        Err(_) => CheckItem {
            name: label.to_string(),
            status: Status::Error,
            message: Some(format!("{} not responding", url)),
        },
    }
}

fn check_web_ui(base_url: &str) -> CheckItem {
    let url = base_url.trim_end_matches('/');
    let max_retries = 5;
    let delay = Duration::from_secs(2);

    for attempt in 1..=max_retries {
        match run_command("curl", &["-sf", "--max-time", "5", "-o", "/dev/null", "-w", "%{http_code}", url]) {
            Ok(code) => {
                let code = code.trim();
                if code.starts_with('2') || code.starts_with('3') {
                    return CheckItem {
                        name: "Web UI".to_string(),
                        status: Status::Success,
                        message: Some(format!("Responding (HTTP {})", code)),
                    };
                }
            }
            Err(_) => {}
        }
        if attempt < max_retries {
            thread::sleep(delay);
        }
    }

    CheckItem {
        name: "Web UI".to_string(),
        status: Status::Warning,
        message: Some(format!("Not responding at {} after {} retries (may still be starting)", url, max_retries)),
    }
}

fn check_systemd_service() -> CheckItem {
    match run_command("systemctl", &["is-active", "rantai-agents"]) {
        Ok(output) if output.trim() == "active" => CheckItem {
            name: "Systemd Service".to_string(),
            status: Status::Success,
            message: Some("rantai-agents.service is active".to_string()),
        },
        Ok(output) => CheckItem {
            name: "Systemd Service".to_string(),
            status: Status::Warning,
            message: Some(format!("Service state: {}", output.trim())),
        },
        Err(e) => CheckItem {
            name: "Systemd Service".to_string(),
            status: Status::Error,
            message: Some(format!("Could not check service: {}", e)),
        },
    }
}
