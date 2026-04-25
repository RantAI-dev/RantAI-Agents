use std::process::ExitCode;

pub fn run() -> ExitCode {
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
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };

    let mut ok_count = 0u32;
    let mut bad_count = 0u32;
    let mut check = |name: &str, ok: bool, msg: String| {
        let mark = if ok {
            ok_count += 1;
            "+"
        } else {
            bad_count += 1;
            "x"
        };
        println!("  {mark} {name:<40} {msg}");
    };

    if state.profile.includes_app() {
        let env = format!("{}/.env", state.install_dir);
        check(
            ".env file present",
            std::path::Path::new(&env).exists(),
            format!("at {env}"),
        );

        let active = crate::installer::run_command("systemctl", &["is-active", "rantai-agents"])
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        check("rantai-agents service", active == "active", active);
    }

    for sc in &state.sidecars {
        let svc = format!("rantai-agents-{sc}");
        let active = crate::installer::run_command("systemctl", &["is-active", &svc])
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        check(&format!("{svc} service"), active == "active", active);

        let port = match sc.as_str() {
            "mineru" => 8100,
            "rerank" => 8200,
            _ => 0,
        };
        if port > 0 {
            let url = format!("http://localhost:{port}/health");
            let result = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .ok()
                .and_then(|c| c.get(&url).send().ok());
            let (ok, msg) = match result {
                Some(r) if r.status().is_success() => (true, format!("200 OK at {url}")),
                Some(r) => (false, format!("{} at {url}", r.status())),
                None => (false, format!("no response from {url}")),
            };
            check(&format!("{svc} /health"), ok, msg);
        }
    }

    println!("\n{ok_count} pass, {bad_count} fail");
    if bad_count > 0 {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}
