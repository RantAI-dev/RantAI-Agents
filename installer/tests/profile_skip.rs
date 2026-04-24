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
fn rerank_provider_labels_are_unique() {
    let labels = [
        RerankProvider::Openrouter.as_str(),
        RerankProvider::Vllm.as_str(),
        RerankProvider::Cohere.as_str(),
    ];
    assert_eq!(
        labels.iter().collect::<std::collections::HashSet<_>>().len(),
        3
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
        labels.iter().collect::<std::collections::HashSet<_>>().len(),
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
