use rantai_agents_installer::app::InstallConfig;
use rantai_agents_installer::installer::config::render_env;

#[test]
fn env_has_all_kb_extract_keys() {
    let cfg = InstallConfig::default();
    let env = render_env(&cfg);
    for key in [
        "KB_EXTRACT_PRIMARY",
        "KB_EXTRACT_SMART_FALLBACK",
        "KB_EXTRACT_CHAT_FALLBACK",
        "KB_EXTRACT_FALLBACK",
        "KB_EXTRACT_MINERU_BASE_URL",
        "KB_EMBEDDING_MODEL",
        "KB_EMBEDDING_DIM",
        "KB_RERANK_ENABLED",
        "KB_RERANK_PROVIDER",
        "KB_RERANK_MODEL",
        "KB_RERANK_BASE_URL",
        "KB_RERANK_INITIAL_K",
        "KB_RERANK_FINAL_K",
        "KB_HYBRID_BM25_ENABLED",
        "KB_CONTEXTUAL_RETRIEVAL_ENABLED",
        "KB_QUERY_EXPANSION_ENABLED",
    ] {
        assert!(
            env.contains(key),
            ".env template missing required key: {key}\n----\n{env}\n----"
        );
    }
}

#[test]
fn env_drops_legacy_ocr_keys() {
    let cfg = InstallConfig::default();
    let env = render_env(&cfg);
    for key in ["OCR_PROVIDER", "OCR_MODEL", "OCR_API_URL"] {
        assert!(
            !env.contains(key),
            ".env template still has legacy key: {key}"
        );
    }
}

#[test]
fn env_wires_sidecar_urls_for_app_profile() {
    let mut cfg = InstallConfig::default();
    cfg.profile = rantai_agents_installer::app::InstallProfile::AppOnly;
    cfg.sidecar.mineru_base_url = "http://gpu-box.internal:8100".into();
    cfg.sidecar.rerank_base_url = "http://gpu-box.internal:8200".into();
    let env = render_env(&cfg);
    assert!(env.contains("KB_EXTRACT_MINERU_BASE_URL=\"http://gpu-box.internal:8100\""));
    assert!(env.contains("KB_RERANK_BASE_URL=\"http://gpu-box.internal:8200\""));
}

#[test]
fn env_rerank_disabled_by_default() {
    let cfg = InstallConfig::default();
    let env = render_env(&cfg);
    assert!(env.contains("KB_RERANK_ENABLED=\"false\""));
}

#[test]
fn generate_config_fills_secrets_then_renders() {
    let mut cfg = InstallConfig::default();
    // install_dir needs to exist for the disk write; redirect to tmp.
    let tmp = std::env::temp_dir().join(format!("installer-test-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    cfg.install_dir = tmp.to_string_lossy().to_string();

    rantai_agents_installer::installer::config::generate_config(&mut cfg).unwrap();

    // After generate_config: secrets auto-filled, .env on disk.
    assert!(
        !cfg.db_password.is_empty(),
        "db_password must be auto-filled"
    );
    assert!(!cfg.nextauth_secret.is_empty());
    let env_path = tmp.join(".env");
    let contents = std::fs::read_to_string(&env_path).unwrap();
    assert!(contents.contains("DB_PASSWORD="));
    assert!(contents.contains("KB_EXTRACT_PRIMARY=\"smart\""));

    std::fs::remove_dir_all(&tmp).ok();
}

#[test]
#[ignore]
fn print_env_for_manual_inspection() {
    let cfg = InstallConfig::default();
    let env = render_env(&cfg);
    std::fs::write("/tmp/generated.env", &env).unwrap();
    eprintln!("{env}");
}
