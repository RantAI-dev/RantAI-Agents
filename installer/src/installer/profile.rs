use crate::app::{InstallProfile, Phase};

/// Returns true if a given phase should be skipped for the given profile.
/// Purely data-driven; no side effects.
pub fn profile_skips_phase(profile: InstallProfile, phase: Phase) -> bool {
    match profile {
        InstallProfile::AppOnly => matches!(phase, Phase::SidecarInstall),
        InstallProfile::SidecarOnly => matches!(
            phase,
            Phase::Infrastructure
                | Phase::ApplicationSetup
                | Phase::Configuration
                | Phase::Database
                | Phase::Services
        ),
        InstallProfile::AllInOne => false,
    }
}
