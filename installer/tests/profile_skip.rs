use rantai_agents_installer::app::{InstallConfig, InstallProfile, Phase, RerankProvider};
use rantai_agents_installer::installer::profile as profile_logic;

#[test]
fn default_sidecar_config_is_vllm_localhost() {
    let c = InstallConfig::default();
    assert_eq!(c.sidecar.mineru_base_url, "http://localhost:8100");
    assert_eq!(c.sidecar.rerank_base_url, "http://localhost:8200");
    assert_eq!(c.sidecar.rerank_provider, RerankProvider::Vllm);
    assert!(c.sidecar.mineru_enabled);
    assert!(c.sidecar.rerank_enabled);
    assert_eq!(c.sidecar.rerank_model, "nvidia/llama-nemotron-rerank-1b-v2");
    assert_eq!(c.sidecar.python_venv_dir, "/home/rantai-agents/vllm-env");
    assert_eq!(c.sidecar.gpu_device_id, 0);
}

#[test]
fn rerank_provider_env_strings_are_unique() {
    let labels = [
        RerankProvider::Openrouter.as_str(),
        RerankProvider::Vllm.as_str(),
        RerankProvider::Cohere.as_str(),
    ];
    assert_eq!(
        labels
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        3
    );
}

#[test]
fn rerank_provider_display_labels_are_unique() {
    let labels = [
        RerankProvider::Openrouter.label(),
        RerankProvider::Vllm.label(),
        RerankProvider::Cohere.label(),
    ];
    assert_eq!(
        labels
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        3,
        "display labels must be distinct (they appear in the TUI picker)"
    );
}

#[test]
fn profile_app_only_includes_app() {
    assert!(InstallProfile::AppOnly.includes_app());
    assert!(!InstallProfile::AppOnly.includes_sidecars());
}

#[test]
fn profile_sidecar_only_includes_sidecars() {
    assert!(InstallProfile::SidecarOnly.includes_sidecars());
    assert!(!InstallProfile::SidecarOnly.includes_app());
}

#[test]
fn profile_all_in_one_includes_both() {
    assert!(InstallProfile::AllInOne.includes_app());
    assert!(InstallProfile::AllInOne.includes_sidecars());
}

#[test]
fn profile_labels_are_unique() {
    let labels = [
        InstallProfile::AppOnly.label(),
        InstallProfile::SidecarOnly.label(),
        InstallProfile::AllInOne.label(),
    ];
    assert_eq!(labels.len(), 3);
    assert_eq!(
        labels
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        3,
        "labels must be distinct"
    );
}

#[test]
fn app_only_profile_skips_sidecar_install_phase() {
    assert!(profile_logic::profile_skips_phase(
        InstallProfile::AppOnly,
        Phase::SidecarInstall,
    ));
    assert!(!profile_logic::profile_skips_phase(
        InstallProfile::AppOnly,
        Phase::Database,
    ));
}

#[test]
fn sidecar_only_profile_skips_app_phases() {
    for phase in [
        Phase::Infrastructure,
        Phase::ApplicationSetup,
        Phase::Configuration,
        Phase::Database,
        Phase::Services,
    ] {
        assert!(
            profile_logic::profile_skips_phase(InstallProfile::SidecarOnly, phase),
            "SidecarOnly should skip {phase:?}"
        );
    }
    assert!(!profile_logic::profile_skips_phase(
        InstallProfile::SidecarOnly,
        Phase::SidecarInstall,
    ));
}

#[test]
fn all_in_one_skips_nothing() {
    for phase in Phase::ALL {
        assert!(
            !profile_logic::profile_skips_phase(InstallProfile::AllInOne, *phase),
            "AllInOne should not skip {phase:?}"
        );
    }
}

#[test]
fn selected_profile_matches_index() {
    use rantai_agents_installer::app::{App, InstallMode, InstallProfile};
    use rantai_agents_installer::ui::screens::profile_select;

    let mut app = App::new(InstallMode::Full);
    app.profile_index = 0;
    assert_eq!(
        profile_select::selected_profile(&app),
        InstallProfile::AllInOne
    );
    app.profile_index = 1;
    assert_eq!(
        profile_select::selected_profile(&app),
        InstallProfile::AppOnly
    );
    app.profile_index = 2;
    assert_eq!(
        profile_select::selected_profile(&app),
        InstallProfile::SidecarOnly
    );
}

#[test]
fn validate_rejects_bad_urls_for_app_profile() {
    use rantai_agents_installer::app::{InstallConfig, InstallProfile};
    use rantai_agents_installer::validate::validate_config;
    let mut cfg = InstallConfig::default();
    cfg.profile = InstallProfile::AppOnly;
    cfg.sidecar.mineru_base_url = "gpu-box:8100".into(); // no scheme
    assert!(validate_config(&cfg).is_err());
}

#[test]
fn validate_accepts_good_app_config() {
    use rantai_agents_installer::app::{InstallConfig, InstallProfile};
    use rantai_agents_installer::validate::validate_config;
    let mut cfg = InstallConfig::default();
    cfg.profile = InstallProfile::AppOnly;
    // defaults use http://localhost:8100 / 8200, should pass
    assert!(validate_config(&cfg).is_ok());
}

#[test]
fn validate_rejects_bad_gpu_id_for_sidecar_profile() {
    use rantai_agents_installer::app::{InstallConfig, InstallProfile};
    use rantai_agents_installer::validate::validate_config;
    let mut cfg = InstallConfig::default();
    cfg.profile = InstallProfile::SidecarOnly;
    cfg.sidecar.gpu_device_id = 99;
    assert!(validate_config(&cfg).is_err());
}

#[test]
fn validate_rejects_empty_venv_for_sidecar_profile() {
    use rantai_agents_installer::app::{InstallConfig, InstallProfile};
    use rantai_agents_installer::validate::validate_config;
    let mut cfg = InstallConfig::default();
    cfg.profile = InstallProfile::SidecarOnly;
    cfg.sidecar.python_venv_dir = String::new();
    assert!(validate_config(&cfg).is_err());
}

/// Regression test: selecting SidecarOnly profile and pressing Enter must
/// populate config_items (build_config_fields was previously not called for
/// this path, leaving the Config screen empty).
#[test]
fn sidecar_only_enter_populates_config_fields() {
    use rantai_agents_installer::app::{App, InstallMode, InstallProfile, Screen};
    use rantai_agents_installer::ui::screens::profile_select;

    let mut app = App::new(InstallMode::Full);
    // Select SidecarOnly (index 2 per profile_select ordering)
    app.profile_index = 2;
    assert_eq!(
        profile_select::selected_profile(&app),
        InstallProfile::SidecarOnly
    );

    // Simulate the Enter handler (mirrors main.rs ProfileSelect branch)
    app.config.profile = profile_select::selected_profile(&app);
    if app.config.profile == InstallProfile::SidecarOnly {
        app.build_config_fields();
        app.screen = Screen::Config;
    }

    assert_eq!(
        app.screen,
        Screen::Config,
        "SidecarOnly Enter should land on Config"
    );
    assert!(
        !app.config_items.is_empty(),
        "build_config_fields must populate config_items before showing Config screen"
    );
}
