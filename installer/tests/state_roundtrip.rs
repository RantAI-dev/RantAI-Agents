use rantai_agents_installer::app::{InstallProfile, InstallMode};
use rantai_agents_installer::state::InstallState;

#[test]
fn install_state_roundtrip_via_toml() {
    let s = InstallState {
        profile: InstallProfile::AllInOne,
        mode: InstallMode::Full,
        install_dir: "/opt/rantai-agents".into(),
        data_dir: "/var/lib/rantai-agents".into(),
        git_sha: "abc1234".into(),
        installer_version: env!("CARGO_PKG_VERSION").to_string(),
        installed_at: "2026-04-25T10:00:00Z".into(),
        sidecars: vec!["mineru".into(), "rerank".into()],
    };
    let serialized = s.to_toml().unwrap();
    let back = InstallState::from_toml(&serialized).unwrap();
    assert_eq!(back.profile, InstallProfile::AllInOne);
    assert_eq!(back.mode, InstallMode::Full);
    assert_eq!(back.install_dir, "/opt/rantai-agents");
    assert_eq!(back.git_sha, "abc1234");
    assert_eq!(back.sidecars, vec!["mineru", "rerank"]);
}

#[test]
fn install_state_default_path_for_root_is_etc() {
    let p = InstallState::default_path(true);
    assert_eq!(p.to_string_lossy(), "/etc/rantai-agents/install.toml");
}

#[test]
fn install_state_default_path_for_non_root_is_xdg() {
    let p = InstallState::default_path(false);
    let s = p.to_string_lossy();
    assert!(s.contains(".config/rantai-agents/install.toml"), "got {s}");
}

#[test]
fn install_state_load_returns_none_when_missing() {
    let nonexistent = std::path::PathBuf::from(format!("/tmp/rantai-state-missing-{}.toml", std::process::id()));
    assert!(InstallState::load_from(&nonexistent).unwrap().is_none());
}
