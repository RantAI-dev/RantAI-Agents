use crate::app::InstallConfig;

/// Validates an `InstallConfig` just before the Preflight phase. Returns
/// `Err(msg)` with a user-facing message if something is clearly wrong.
pub fn validate_config(cfg: &InstallConfig) -> Result<(), String> {
    if cfg.profile.includes_sidecars() {
        if cfg.sidecar.gpu_device_id > 7 {
            return Err(format!(
                "GPU device ID {} is unlikely to exist. Check nvidia-smi.",
                cfg.sidecar.gpu_device_id
            ));
        }
        if cfg.sidecar.python_venv_dir.is_empty() {
            return Err("Python venv directory must not be empty.".into());
        }
    }
    if cfg.profile.includes_app() {
        if !cfg.sidecar.mineru_base_url.starts_with("http://")
            && !cfg.sidecar.mineru_base_url.starts_with("https://")
        {
            return Err("MinerU base URL must start with http:// or https://".into());
        }
        if !cfg.sidecar.rerank_base_url.starts_with("http://")
            && !cfg.sidecar.rerank_base_url.starts_with("https://")
        {
            return Err("Rerank base URL must start with http:// or https://".into());
        }
    }
    Ok(())
}
