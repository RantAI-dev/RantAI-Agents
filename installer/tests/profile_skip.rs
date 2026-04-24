use rantai_agents_installer::app::InstallProfile;

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
