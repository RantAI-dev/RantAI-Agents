use std::fs;
use tokio::sync::mpsc::Sender;

use super::executor::InstallMessage;
use super::{run_command, run_sudo};
use crate::app::InstallConfig;

/// Ensure a Python venv exists at config.sidecar.python_venv_dir. Creates one
/// via `python3 -m venv <dir>` if missing. Idempotent.
pub async fn ensure_venv(
    config: &InstallConfig,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    let venv = &config.sidecar.python_venv_dir;
    let python = format!("{venv}/bin/python");

    if std::path::Path::new(&python).exists() {
        tx.send(InstallMessage::Progress(format!(
            "Python venv already exists at {venv}"
        )))
        .await
        .ok();
        return Ok(());
    }

    tx.send(InstallMessage::Progress(format!(
        "Creating Python venv at {venv}..."
    )))
    .await
    .ok();

    // Find a Python 3.10+. Prefer 3.13 → 3.12 → 3.11 → 3.10 → 3.
    let python_bin = [
        "python3.13",
        "python3.12",
        "python3.11",
        "python3.10",
        "python3",
    ]
    .iter()
    .find(|p| run_command("which", &[p]).is_ok())
    .ok_or_else(|| "No python3.10+ found on PATH".to_string())?;

    run_command(python_bin, &["-m", "venv", venv])?;
    Ok(())
}

pub async fn pip_install_requirements(
    config: &InstallConfig,
    requirements_path: &str,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    let pip = format!("{}/bin/pip", config.sidecar.python_venv_dir);
    tx.send(InstallMessage::Progress(format!(
        "pip install -r {requirements_path}..."
    )))
    .await
    .ok();
    run_command(&pip, &["install", "--upgrade", "pip"])?;
    run_command(&pip, &["install", "-r", requirements_path])?;
    Ok(())
}

pub async fn prefetch_hf_model(
    config: &InstallConfig,
    model_id: &str,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    let python = format!("{}/bin/python", config.sidecar.python_venv_dir);
    tx.send(InstallMessage::Progress(format!(
        "Pre-downloading HF model {model_id}..."
    )))
    .await
    .ok();

    let script = format!(
        "import os\n\
         os.environ.setdefault('HF_HOME', '{hf}')\n\
         from huggingface_hub import snapshot_download\n\
         snapshot_download(repo_id='{model}', allow_patterns=['*.json', '*.safetensors', '*.txt', '*.model', '*.py'])\n\
         print('ok')\n",
        hf = config.sidecar.hf_cache_dir,
        model = model_id,
    );

    run_command(&python, &["-c", &script])?;
    Ok(())
}

fn mineru_unit(config: &InstallConfig, repo_dir: &str) -> String {
    format!(
        r#"[Unit]
Description=RantAI Agents MinerU OCR sidecar
After=network.target
Wants=network.target

[Service]
Type=simple
User=rantai-agents
WorkingDirectory={repo_dir}/services/mineru-server
Environment=CUDA_VISIBLE_DEVICES={gpu}
Environment=FLASHINFER_DISABLE_VERSION_CHECK=1
Environment=HF_HOME={hf}
ExecStart={venv}/bin/uvicorn server:app --host 0.0.0.0 --port {port}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rantai-agents-mineru

[Install]
WantedBy=multi-user.target
"#,
        venv = config.sidecar.python_venv_dir,
        gpu = config.sidecar.gpu_device_id,
        hf = config.sidecar.hf_cache_dir,
        port = config.sidecar.mineru_port,
        repo_dir = repo_dir,
    )
}

fn rerank_unit(config: &InstallConfig, repo_dir: &str) -> String {
    format!(
        r#"[Unit]
Description=RantAI Agents Nemotron rerank sidecar
After=network.target
Wants=network.target

[Service]
Type=simple
User=rantai-agents
WorkingDirectory={repo_dir}/services/rerank-server
Environment=CUDA_VISIBLE_DEVICES={gpu}
Environment=HF_HOME={hf}
Environment=RERANK_MODEL={model}
ExecStart={venv}/bin/uvicorn server:app --host 0.0.0.0 --port {port}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rantai-agents-rerank

[Install]
WantedBy=multi-user.target
"#,
        venv = config.sidecar.python_venv_dir,
        gpu = config.sidecar.gpu_device_id,
        hf = config.sidecar.hf_cache_dir,
        model = config.sidecar.rerank_model,
        port = config.sidecar.rerank_port,
        repo_dir = repo_dir,
    )
}

// Test hooks — expose internal generators for unit tests.
#[doc(hidden)]
pub fn mineru_unit_for_test(config: &InstallConfig, repo_dir: &str) -> String {
    mineru_unit(config, repo_dir)
}
#[doc(hidden)]
pub fn rerank_unit_for_test(config: &InstallConfig, repo_dir: &str) -> String {
    rerank_unit(config, repo_dir)
}

pub async fn install_sidecar_services(
    config: &InstallConfig,
    repo_dir: &str,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    if config.sidecar.mineru_enabled {
        install_one("rantai-agents-mineru", &mineru_unit(config, repo_dir), tx).await?;
    }
    if config.sidecar.rerank_enabled {
        install_one("rantai-agents-rerank", &rerank_unit(config, repo_dir), tx).await?;
    }
    Ok(())
}

async fn install_one(
    name: &str,
    unit_content: &str,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    tx.send(InstallMessage::Progress(format!(
        "Writing systemd unit for {name}..."
    )))
    .await
    .ok();

    let tmp = format!("/tmp/{name}.service");
    let dst = format!("/etc/systemd/system/{name}.service");
    fs::write(&tmp, unit_content).map_err(|e| format!("tmp write: {e}"))?;
    run_sudo("mv", &[&tmp, &dst])?;
    run_sudo("chmod", &["644", &dst])?;

    run_sudo("systemctl", &["daemon-reload"])?;
    run_sudo("systemctl", &["enable", name])?;

    tx.send(InstallMessage::Progress(format!("Starting {name}...")))
        .await
        .ok();
    run_sudo("systemctl", &["restart", name])?;
    Ok(())
}
