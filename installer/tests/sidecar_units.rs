use rantai_agents_installer::app::InstallConfig;
use rantai_agents_installer::installer::sidecar;

#[test]
fn mineru_unit_has_correct_env() {
    let cfg = InstallConfig::default();
    let unit = sidecar::mineru_unit_for_test(&cfg, "/opt/rantai-agents");
    assert!(unit.contains("CUDA_VISIBLE_DEVICES=0"));
    assert!(unit.contains("FLASHINFER_DISABLE_VERSION_CHECK=1"));
    assert!(unit.contains("--port 8100"));
    assert!(unit.contains("SyslogIdentifier=rantai-agents-mineru"));
    assert!(unit.contains("WorkingDirectory=/opt/rantai-agents/services/mineru-server"));
    assert!(unit.contains("User=rantai-agents"));
}

#[test]
fn rerank_unit_references_model_and_port() {
    let mut cfg = InstallConfig::default();
    cfg.sidecar.rerank_model = "test/model-id".into();
    let unit = sidecar::rerank_unit_for_test(&cfg, "/opt/rantai-agents");
    assert!(unit.contains("RERANK_MODEL=test/model-id"));
    assert!(unit.contains("--port 8200"));
    assert!(unit.contains("SyslogIdentifier=rantai-agents-rerank"));
    assert!(unit.contains("WorkingDirectory=/opt/rantai-agents/services/rerank-server"));
}

#[test]
fn units_use_configured_gpu_device_id() {
    let mut cfg = InstallConfig::default();
    cfg.sidecar.gpu_device_id = 3;
    let mineru = sidecar::mineru_unit_for_test(&cfg, "/opt/rantai-agents");
    let rerank = sidecar::rerank_unit_for_test(&cfg, "/opt/rantai-agents");
    assert!(mineru.contains("CUDA_VISIBLE_DEVICES=3"));
    assert!(rerank.contains("CUDA_VISIBLE_DEVICES=3"));
}

#[test]
fn units_use_configured_ports() {
    let mut cfg = InstallConfig::default();
    cfg.sidecar.mineru_port = 9100;
    cfg.sidecar.rerank_port = 9200;
    assert!(sidecar::mineru_unit_for_test(&cfg, "/opt/x").contains("--port 9100"));
    assert!(sidecar::rerank_unit_for_test(&cfg, "/opt/x").contains("--port 9200"));
}
