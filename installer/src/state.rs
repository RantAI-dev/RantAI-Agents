//! Persisted record of an existing install. Written to /etc/rantai-agents/install.toml
//! (root) or ~/.config/rantai-agents/install.toml (non-root) at the end of every
//! successful install/update. Used by the installer + `rantai-agents` CLI to
//! decide whether to enter update mode.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::app::{InstallMode, InstallProfile};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstallState {
    pub profile: InstallProfile,
    pub mode: InstallMode,
    pub install_dir: String,
    pub data_dir: String,
    pub git_sha: String,
    pub installer_version: String,
    pub installed_at: String,
    pub sidecars: Vec<String>,
}

impl InstallState {
    pub fn to_toml(&self) -> Result<String, String> {
        toml::to_string_pretty(self).map_err(|e| format!("toml serialize: {e}"))
    }

    pub fn from_toml(s: &str) -> Result<Self, String> {
        toml::from_str(s).map_err(|e| format!("toml parse: {e}"))
    }

    pub fn default_path(is_root: bool) -> PathBuf {
        if is_root {
            PathBuf::from("/etc/rantai-agents/install.toml")
        } else {
            let mut p = dirs::config_dir().unwrap_or_else(|| PathBuf::from(".config"));
            p.push("rantai-agents");
            p.push("install.toml");
            p
        }
    }

    pub fn load_from(path: &Path) -> Result<Option<Self>, String> {
        if !path.exists() {
            return Ok(None);
        }
        let s = std::fs::read_to_string(path).map_err(|e| format!("read {path:?}: {e}"))?;
        Ok(Some(Self::from_toml(&s)?))
    }

    pub fn save_to(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {parent:?}: {e}"))?;
        }
        let s = self.to_toml()?;
        std::fs::write(path, s).map_err(|e| format!("write {path:?}: {e}"))
    }
}
