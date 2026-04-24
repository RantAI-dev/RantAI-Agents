# Installer v2 — Profile-Aware Install with Sidecar Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `installer/` Rust TUI to support three install profiles (AppOnly, SidecarOnly, AllInOne) so a cross-machine deployment (app server + separate GPU box with MinerU + Nemotron rerank sidecars) becomes a first-class flow, and fix the stale `.env` template so a fresh install doesn't require hand-editing.

**Architecture:** Add an orthogonal `InstallProfile` axis to the existing `InstallMode` axis. Mode decides *how* (systemd vs docker vs dev). Profile decides *what* (app vs sidecars vs both). Each profile skips irrelevant phases via the existing `should_skip_phase` pattern in `executor.rs`. Sidecars are installed as systemd units following the same pattern as the main `rantai-agents.service`, with a new `sidecar.rs` module encapsulating Python venv setup, `pip install -r requirements.txt`, HF model pre-download, unit file generation, and health-check verification. The TUI gets a new `ProfileSelect` screen before `ModeSelect`, and the `Config` screen dynamically shows only profile-relevant fields.

**Tech Stack:**
- Rust + Ratatui 0.29 (existing TUI)
- Tokio for async command execution
- systemd for service lifecycle (existing pattern in `services.rs`)
- Python venv + pip for sidecar runtime (follows the existing manual `~/vllm-env` pattern, now automated)
- `huggingface-cli download` for model pre-download
- `nvidia-smi` for GPU detection

---

## Pre-read (context for whoever executes this)

Before touching code, read these files end-to-end:

- `installer/src/app.rs` — `InstallMode`, `InstallConfig`, `Screen`, `Phase`, `App` state machine.
- `installer/src/installer/mod.rs` — module exports + `run_command` / `run_sudo` / `is_root` helpers.
- `installer/src/installer/executor.rs` — phase orchestration + `should_skip_phase` pattern.
- `installer/src/installer/services.rs` — existing systemd unit install pattern (copy the structure for sidecars).
- `installer/src/installer/preflight.rs` — existing system-check pattern.
- `installer/src/installer/verify.rs` — existing health-check pattern.
- `installer/src/installer/config.rs` — current stale `.env` template (rewrite target).
- `installer/src/ui/screens/mode_select.rs` — two-panel picker UI pattern (copy for `profile_select.rs`).
- `.env.example` lines 100–150 — current KB_* env contract (source of truth for the new template).
- `services/mineru-server/server.py`, `services/rerank-server/server.py` — sidecar launch contracts.
- `docs/artifact-plans/reranker-bench-2026-04-24.md` — bench numbers justifying the Nemotron default.

Then read the existing mineru + rerank README files to understand the current manual install steps — the installer is replicating those, not inventing new ones.

**Do all work on a feature branch `feat/installer-v2`.** Do not commit directly to main. Use `git commit-sulthan` (user's alias) for commits — never plain `git commit` — and never add `Co-Authored-By` trailers.

---

## File Structure

**New files:**
- `installer/src/installer/profile.rs` — `InstallProfile` enum + profile-specific phase skip logic + validation
- `installer/src/installer/sidecar.rs` — Python venv, pip install, HF model download, sidecar systemd units, health check
- `installer/src/ui/screens/profile_select.rs` — TUI profile picker (mirrors `mode_select.rs` structure)
- `services/rerank-server/requirements.txt` — pinned Python deps for the rerank sidecar
- `services/mineru-server/requirements.txt` — pinned Python deps for the mineru sidecar
- `installer/tests/profile_skip.rs` — integration test for profile-aware phase skipping
- `installer/tests/env_template.rs` — integration test asserting `.env` template contains all current `KB_*` keys and no legacy `OCR_*` keys

**Modified files:**
- `installer/src/app.rs` — add `InstallProfile` enum + `SidecarConfig` struct + field on `InstallConfig` + `Screen::ProfileSelect` variant + App state for profile picker
- `installer/src/installer/mod.rs` — declare `profile` and `sidecar` modules
- `installer/src/installer/executor.rs` — profile-aware `should_skip_phase` + new `SidecarInstall` phase between `Services` and `Verification`
- `installer/src/installer/config.rs` — rewrite `.env` template to match current `.env.example` contract (all `KB_*` vars, drop legacy `OCR_*`)
- `installer/src/installer/preflight.rs` — GPU check (nvidia-smi) + Python 3.10+ check when profile includes sidecars
- `installer/src/installer/verify.rs` — `GET /health` verification for any sidecar that was installed
- `installer/src/ui/screens/mod.rs` — register `profile_select` screen module
- `installer/src/main.rs` — wire `Screen::ProfileSelect` into the state machine + navigation keys
- `installer/src/app.rs::App::new` — start on `Screen::Welcome` then advance to `Screen::ProfileSelect` before `Screen::ModeSelect` (extend the existing welcome → next flow)
- `services/mineru-server/README.md` — add "Installed via installer?" pointer
- `services/rerank-server/README.md` — add "Installed via installer?" pointer

Everything in `installer/` stays in the existing crate. No new crates, no workspace changes.

---

## Phase Layout (shippable checkpoints)

Each phase leaves the installer in a working state. If the user wants to ship incrementally, any phase boundary is a valid merge point.

| Phase | Tasks | Deliverable |
|-------|-------|-------------|
| A. Foundation | 1–4 | `InstallProfile` type + tests; no behavior change yet |
| B. Env template overhaul | 5–7 | Fresh installs get a correct `.env` with all KB_* vars |
| C. Profile picker UI | 8–11 | User picks AppOnly/SidecarOnly/AllInOne before ModeSelect |
| D. Profile-aware config screen | 12–14 | Config screen asks only relevant questions per profile |
| E. Sidecar install primitives | 15–22 | Python venv + pip + model download + systemd unit |
| F. Executor routing | 23–25 | `SidecarInstall` phase runs when profile includes sidecars |
| G. Verify + polish | 26–30 | Sidecar `/health` check + post-install summary + README updates |

**MVP boundary**: Phases A–D produce a working installer that fixes the stale `.env` template and asks the right questions for cross-machine deployment, *without* yet automating the GPU box install. A human still runs the sidecars manually on the GPU box. Phases E–G automate that remaining step.

---

## Task 1: `InstallProfile` enum (Foundation)

**Files:**
- Modify: `installer/src/app.rs:13-15` (after the existing `Screen` enum)

- [ ] **Step 1: Write the failing test**

Create `installer/tests/profile_skip.rs`:

```rust
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
```

For this to compile, the installer crate must expose `app` as `pub mod`. Check `installer/src/main.rs` — if `app` is `mod app;` (private), change to `pub mod app;`. Same for `installer/src/installer/mod.rs` if it needs exposure later.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd installer && cargo test --test profile_skip`

Expected: fails to compile with "InstallProfile not found".

- [ ] **Step 3: Add the enum**

In `installer/src/app.rs`, add immediately after the `InstallMode` impl block (around line 70):

```rust
/// Orthogonal axis to `InstallMode`. Profile decides WHAT is installed.
/// Mode decides HOW. They compose.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallProfile {
    /// Next.js app + infra. Points at external sidecars via env URLs.
    /// Pick this when your GPU box is a separate machine.
    AppOnly,
    /// MinerU + rerank sidecars on a GPU box. No app, no infra.
    /// Pick this on the GPU box when the app lives elsewhere.
    SidecarOnly,
    /// App + infra + sidecars on one machine. Dev or small deployments.
    AllInOne,
}

impl InstallProfile {
    pub fn label(&self) -> &'static str {
        match self {
            Self::AppOnly => "App Only",
            Self::SidecarOnly => "Sidecars Only (GPU box)",
            Self::AllInOne => "All-in-one",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            Self::AppOnly => {
                "Install the Next.js app, PostgreSQL, SurrealDB, and object store on this machine. \
                 You provide URLs pointing at MinerU and rerank sidecars running on a separate GPU box."
            }
            Self::SidecarOnly => {
                "Install only the GPU-backed sidecars (MinerU OCR + Nemotron rerank) on this machine. \
                 Requires an NVIDIA GPU with ≥8 GB VRAM. The URLs printed at the end go in the app server's .env."
            }
            Self::AllInOne => {
                "Install everything on this machine. Suitable for development and small single-box \
                 deployments. Requires an NVIDIA GPU if you want the on-prem OCR / rerank path."
            }
        }
    }

    pub fn includes_app(&self) -> bool {
        matches!(self, Self::AppOnly | Self::AllInOne)
    }

    pub fn includes_sidecars(&self) -> bool {
        matches!(self, Self::SidecarOnly | Self::AllInOne)
    }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `cd installer && cargo test --test profile_skip`

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/shiro/rantai/RantAI-Agents
git checkout -b feat/installer-v2
git add installer/src/app.rs installer/tests/profile_skip.rs installer/src/main.rs
git commit-sulthan -m "feat(installer): add InstallProfile enum

- AppOnly / SidecarOnly / AllInOne decides what gets installed
- orthogonal to existing InstallMode (how things get installed)
- label/description/includes_app/includes_sidecars helpers
- 4 unit tests cover the basic shape"
```

---

## Task 2: `SidecarConfig` struct (Foundation)

**Files:**
- Modify: `installer/src/app.rs:160-206` (add fields to `InstallConfig`)

- [ ] **Step 1: Write the failing test**

Extend `installer/tests/profile_skip.rs`:

```rust
use rantai_agents_installer::app::{InstallConfig, InstallProfile, RerankProvider, SidecarConfig};

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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd installer && cargo test --test profile_skip`

Expected: fails to compile with "SidecarConfig not found", "RerankProvider not found", "no field sidecar on InstallConfig".

- [ ] **Step 3: Add types + field**

In `installer/src/app.rs`, after the `InstallProfile` impl block, add:

```rust
/// Which rerank implementation to use. Matches KB_RERANK_PROVIDER env.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RerankProvider {
    /// LLM-as-reranker via OpenRouter chat completions.
    Openrouter,
    /// Self-hosted cross-encoder via the services/rerank-server/ sidecar (Nemotron 1B v2 default).
    Vllm,
    /// Cohere SaaS rerank (api.cohere.com/v2/rerank).
    Cohere,
}

impl RerankProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Openrouter => "openrouter",
            Self::Vllm => "vllm",
            Self::Cohere => "cohere",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Openrouter => "OpenRouter (LLM-as-reranker)",
            Self::Vllm => "Self-hosted (Nemotron via sidecar)",
            Self::Cohere => "Cohere SaaS",
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            Self::Openrouter => "openai/gpt-4.1-nano",
            Self::Vllm => "nvidia/llama-nemotron-rerank-1b-v2",
            Self::Cohere => "rerank-v4.0-pro",
        }
    }
}

/// Sidecar-facing config. Persisted into .env as KB_EXTRACT_MINERU_BASE_URL +
/// KB_RERANK_* when profile includes the app, and used to drive systemd unit
/// install when profile includes sidecars.
#[derive(Debug, Clone)]
pub struct SidecarConfig {
    // MinerU
    pub mineru_enabled: bool,
    pub mineru_base_url: String,
    pub mineru_port: u16,

    // Rerank
    pub rerank_enabled: bool,
    pub rerank_provider: RerankProvider,
    pub rerank_base_url: String,
    pub rerank_port: u16,
    pub rerank_model: String,
    pub rerank_api_key: String,

    // GPU + Python (only used when profile includes sidecars)
    pub gpu_device_id: u32,
    pub python_venv_dir: String,
    pub hf_cache_dir: String,
}

impl Default for SidecarConfig {
    fn default() -> Self {
        Self {
            mineru_enabled: true,
            mineru_base_url: "http://localhost:8100".into(),
            mineru_port: 8100,

            rerank_enabled: true,
            rerank_provider: RerankProvider::Vllm,
            rerank_base_url: "http://localhost:8200".into(),
            rerank_port: 8200,
            rerank_model: "nvidia/llama-nemotron-rerank-1b-v2".into(),
            rerank_api_key: String::new(),

            gpu_device_id: 0,
            python_venv_dir: "/home/rantai-agents/vllm-env".into(),
            hf_cache_dir: "/home/rantai-agents/.cache/huggingface".into(),
        }
    }
}
```

Then in the `InstallConfig` struct (around line 160), add after the existing fields and before `pub mode: InstallMode,`:

```rust
    // Profile + sidecar config
    pub profile: InstallProfile,
    pub sidecar: SidecarConfig,
```

Update `impl Default for InstallConfig` (around line 208) to include:

```rust
            profile: InstallProfile::AllInOne,
            sidecar: SidecarConfig::default(),
```

- [ ] **Step 4: Verify tests pass**

Run: `cd installer && cargo test --test profile_skip`

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add installer/src/app.rs installer/tests/profile_skip.rs
git commit-sulthan -m "feat(installer): add SidecarConfig + RerankProvider to InstallConfig

- SidecarConfig captures MinerU/rerank URLs, ports, model, GPU device, venv
- RerankProvider enum mirrors KB_RERANK_PROVIDER (openrouter/vllm/cohere)
- defaults point at localhost ports 8100/8200 with Nemotron rerank
- 2 new unit tests"
```

---

## Task 3: Profile-aware phase skip

**Files:**
- Create: `installer/src/installer/profile.rs`
- Modify: `installer/src/installer/mod.rs` — add `pub mod profile;`
- Modify: `installer/src/installer/executor.rs` — call `profile::should_skip_phase`

- [ ] **Step 1: Write the failing test**

Append to `installer/tests/profile_skip.rs`:

```rust
use rantai_agents_installer::app::{InstallProfile, Phase};
use rantai_agents_installer::installer::profile as profile_logic;

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
```

Note that `Phase::SidecarInstall` doesn't exist yet — this test also forces us to add it.

- [ ] **Step 2: Run to verify failure**

Run: `cd installer && cargo test --test profile_skip`

Expected: compile error "no variant SidecarInstall" + "no module profile".

- [ ] **Step 3: Add the `SidecarInstall` phase variant**

In `installer/src/app.rs`, update the `Phase` enum to add a new variant between `Services` and `Verification`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Preflight,
    Dependencies,
    Infrastructure,
    ApplicationSetup,
    Configuration,
    Database,
    Services,
    SidecarInstall,   // <-- new
    Verification,
}
```

Extend `impl Phase`:

```rust
    pub fn label(&self) -> &str {
        match self {
            Self::Preflight => "Preflight Checks",
            Self::Dependencies => "Install Dependencies",
            Self::Infrastructure => "Start Infrastructure",
            Self::ApplicationSetup => "Application Setup",
            Self::Configuration => "Generate Configuration",
            Self::Database => "Database Migrations",
            Self::Services => "Install Services",
            Self::SidecarInstall => "Install GPU Sidecars",
            Self::Verification => "Verification",
        }
    }

    pub fn index(&self) -> usize {
        match self {
            Self::Preflight => 0,
            Self::Dependencies => 1,
            Self::Infrastructure => 2,
            Self::ApplicationSetup => 3,
            Self::Configuration => 4,
            Self::Database => 5,
            Self::Services => 6,
            Self::SidecarInstall => 7,
            Self::Verification => 8,
        }
    }

    pub const ALL: &'static [Phase] = &[
        Phase::Preflight,
        Phase::Dependencies,
        Phase::Infrastructure,
        Phase::ApplicationSetup,
        Phase::Configuration,
        Phase::Database,
        Phase::Services,
        Phase::SidecarInstall,
        Phase::Verification,
    ];

    pub const COUNT: usize = 9;
```

- [ ] **Step 4: Create `profile.rs`**

Create `installer/src/installer/profile.rs`:

```rust
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
```

- [ ] **Step 5: Expose module**

In `installer/src/installer/mod.rs`, add after the other `pub mod` declarations:

```rust
pub mod profile;
```

Also make sure `installer` is `pub mod` in `installer/src/main.rs` (or wherever the root is declared):

```rust
pub mod installer;
pub mod app;
```

- [ ] **Step 6: Wire into executor**

In `installer/src/installer/executor.rs`, find `fn should_skip_phase(phase: Phase, config: &InstallConfig) -> bool` and change it to first check the profile:

```rust
fn should_skip_phase(phase: Phase, config: &InstallConfig) -> bool {
    if crate::installer::profile::profile_skips_phase(config.profile, phase) {
        return true;
    }
    // …existing mode-based skip logic stays below…
}
```

Keep all existing skip logic after the new early-return.

- [ ] **Step 7: Verify tests pass**

Run: `cd installer && cargo test --test profile_skip`

Expected: 9 tests pass.

- [ ] **Step 8: Commit**

```bash
git add installer/src/app.rs installer/src/installer/profile.rs installer/src/installer/mod.rs installer/src/installer/executor.rs installer/tests/profile_skip.rs
git commit-sulthan -m "feat(installer): profile-aware phase skipping

- new Phase::SidecarInstall slot between Services and Verification
- profile::profile_skips_phase: pure function mapping (profile, phase) -> bool
- executor short-circuits on profile skip before existing mode skip logic
- 3 new tests cover AppOnly / SidecarOnly / AllInOne boundaries"
```

---

## Task 4: Fix phase_statuses length in existing UI

**Files:**
- Modify: `installer/src/ui/widgets/phase_progress.rs` or wherever phase count is hard-coded

The `Phase::COUNT` bump from 8 to 9 in Task 3 may break UI widgets that assumed 8 rows. Grep first.

- [ ] **Step 1: Find hardcoded "8"**

Run: `cd installer && grep -rn "COUNT\|== 8\|\[8\]\|vec!\[.*; 8\]" src/`

Inspect any hits. Update `vec![Status::Pending; 8]` to `vec![Status::Pending; Phase::COUNT]`.

- [ ] **Step 2: Compile**

Run: `cd installer && cargo build --release 2>&1 | head -30`

Expected: no errors related to phase count mismatch.

- [ ] **Step 3: Run full test suite**

Run: `cd installer && cargo test`

Expected: all tests pass, including the 9 from Task 3.

- [ ] **Step 4: Commit (only if anything changed in step 1)**

```bash
git add -A
git commit-sulthan -m "fix(installer): use Phase::COUNT instead of hardcoded 8

Phase enum now has 9 variants (SidecarInstall added in prior commit)."
```

If nothing changed: skip the commit. Move to Task 5.

---

## Task 5: Rewrite `.env` template — remove legacy, add KB_* block

**Files:**
- Modify: `installer/src/installer/config.rs` (full rewrite of the `env_content` template)
- Create: `installer/tests/env_template.rs`

- [ ] **Step 1: Write the failing integration test**

Create `installer/tests/env_template.rs`:

```rust
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
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd installer && cargo test --test env_template`

Expected: fails to compile (no public `render_env` function).

- [ ] **Step 3: Extract and rewrite `render_env`**

In `installer/src/installer/config.rs`, split `generate_config` into two pieces: a pure `render_env` that takes `&InstallConfig` and returns `String`, and a wrapper that writes to disk. Replace the current `env_content = format!(...)` block with:

```rust
pub fn render_env(config: &InstallConfig) -> String {
    let database_url = format!(
        "postgresql://{}:{}@{}:{}/{}",
        config.db_user,
        config.db_password,
        config.db_host,
        config.db_port,
        config.db_name,
    );

    format!(
        r#"# ─────────────────────────────────────────────────────────
# RantAI Agents — Environment Configuration
# Generated by rantai-agents-installer
# ─────────────────────────────────────────────────────────

# ── PostgreSQL ──
DATABASE_URL="{database_url}"
DB_HOST={db_host}
DB_PORT={db_port}
DB_NAME={db_name}
DB_USER={db_user}
DB_PASSWORD={db_password}

# ── SurrealDB (Vector Store) ──
VECTOR_DB_URL={surrealdb_url}
SURREALDB_USER={surrealdb_user}
SURREALDB_PASS={surrealdb_pass}

# ── S3 Storage (RustFS) ──
S3_ENDPOINT={s3_endpoint}
S3_ACCESS_KEY={s3_access_key}
S3_SECRET_KEY={s3_secret_key}
S3_BUCKET={s3_bucket}
S3_REGION=us-east-1

# ── Authentication ──
NEXTAUTH_SECRET={nextauth_secret}
NEXTAUTH_URL={nextauth_url}

# ── LLM Provider ──
OPENROUTER_API_KEY={openrouter_api_key}

# ── Knowledge Base: Extraction stack ──
# "smart" = SmartRouter (unpdf first, fallback to OCR on scan/table/garbled signals).
# Also accepts "unpdf", "mineru", "hybrid", or any OpenRouter vision model id.
KB_EXTRACT_PRIMARY="smart"
KB_EXTRACT_SMART_FALLBACK="openai/gpt-4.1-nano"
KB_EXTRACT_CHAT_FALLBACK="openai/gpt-4.1-nano"
KB_EXTRACT_FALLBACK="unpdf"
KB_EXTRACT_MINERU_BASE_URL="{mineru_base_url}"

# ── Knowledge Base: Embedding ──
KB_EMBEDDING_MODEL="qwen/qwen3-embedding-8b"
KB_EMBEDDING_DIM="4096"

# ── Knowledge Base: Retrieval ──
KB_HYBRID_BM25_ENABLED="true"
KB_CONTEXTUAL_RETRIEVAL_ENABLED="false"
KB_QUERY_EXPANSION_ENABLED="false"

# ── Knowledge Base: Reranking (opt-in) ──
# Providers: "openrouter" (LLM-as-reranker), "vllm" (Nemotron sidecar), "cohere" (SaaS).
# See docs/artifact-plans/reranker-bench-2026-04-24.md for trade-offs.
KB_RERANK_ENABLED="false"
KB_RERANK_PROVIDER="{rerank_provider}"
KB_RERANK_MODEL="{rerank_model}"
KB_RERANK_BASE_URL="{rerank_base_url}"
KB_RERANK_API_KEY="{rerank_api_key}"
KB_RERANK_INITIAL_K="20"
KB_RERANK_FINAL_K="5"

# ── Code Interpreter (Piston) ──
CODE_INTERPRETER_URL={piston_url}
CODE_INTERPRETER_ENABLED={piston_enabled}

# ── Web Search (SearXNG) ──
SEARCH_API_URL={searxng_url}
SEARCH_API_ENABLED={searxng_enabled}

# ── Admin ──
ADMIN_EMAIL={admin_email}
ADMIN_PASSWORD={admin_password}

# ── Runtime ──
NODE_ENV=production
PORT=3000
"#,
        database_url = database_url,
        db_host = config.db_host,
        db_port = config.db_port,
        db_name = config.db_name,
        db_user = config.db_user,
        db_password = config.db_password,
        surrealdb_url = config.surrealdb_url,
        surrealdb_user = config.surrealdb_user,
        surrealdb_pass = config.surrealdb_pass,
        s3_endpoint = config.s3_endpoint,
        s3_access_key = config.s3_access_key,
        s3_secret_key = config.s3_secret_key,
        s3_bucket = config.s3_bucket,
        nextauth_secret = config.nextauth_secret,
        nextauth_url = config.nextauth_url,
        openrouter_api_key = config.openrouter_api_key,
        mineru_base_url = config.sidecar.mineru_base_url,
        rerank_provider = config.sidecar.rerank_provider.as_str(),
        rerank_model = config.sidecar.rerank_model,
        rerank_base_url = config.sidecar.rerank_base_url,
        rerank_api_key = config.sidecar.rerank_api_key,
        piston_url = config.piston_url,
        piston_enabled = config.enable_piston,
        searxng_url = config.searxng_url,
        searxng_enabled = config.enable_searxng,
        admin_email = config.admin_email,
        admin_password = config.admin_password,
    )
}
```

Then update `generate_config` to use it:

```rust
pub fn generate_config(config: &mut InstallConfig) -> Result<(), String> {
    // auto-fill empty secrets (existing code unchanged)
    // …

    let env_content = render_env(config);
    // …existing write-to-disk code unchanged…
}
```

Drop the now-dead `# ── OCR (Ollama) ──` block entirely. Drop `ollama_url` from the format! args if it was there.

- [ ] **Step 4: Verify tests pass**

Run: `cd installer && cargo test --test env_template`

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add installer/src/installer/config.rs installer/tests/env_template.rs
git commit-sulthan -m "feat(installer): rewrite .env template for current platform contract

- adds all KB_EXTRACT_* (smart router, chat fallback, mineru URL) keys
- adds all KB_RERANK_* (provider, model, base URL, api key) keys
- adds KB_HYBRID_BM25, KB_CONTEXTUAL_RETRIEVAL, KB_QUERY_EXPANSION feature flags
- adds KB_EMBEDDING_* keys (qwen3-8b default)
- drops legacy OCR_PROVIDER / OCR_MODEL / OCR_API_URL (unified under KB_EXTRACT_* months ago)
- render_env extracted as a pure function so the template is unit-testable
- 4 integration tests cover required keys, legacy removal, URL wiring, rerank disabled-by-default"
```

---

## Task 6: Sanity-check against live `.env.example`

**Files:**
- Read: `.env.example`

- [ ] **Step 1: Diff template vs example**

Run:

```bash
cd installer
cargo run --quiet --bin rantai-agents-installer -- --dry-run-env > /tmp/generated.env 2>/dev/null || \
  cargo test env_has_all_kb_extract_keys -- --nocapture
```

If `--dry-run-env` isn't a flag the binary supports, skip the `cargo run` and just use the test output or write a tiny bin that calls `render_env(&InstallConfig::default())` and prints it.

- [ ] **Step 2: Compare key-for-key**

```bash
grep -oE '^[A-Z_]+(=|\s*=)' .env.example | sort -u > /tmp/example_keys.txt
grep -oE '^[A-Z_]+(=|\s*=)' /tmp/generated.env | sort -u > /tmp/generated_keys.txt
diff /tmp/example_keys.txt /tmp/generated_keys.txt
```

- [ ] **Step 3: Resolve any drift**

If `.env.example` has keys the template is missing, add them to `render_env`. If the template has keys `.env.example` lacks, decide: either the example is stale (update it) or the template is over-eager (trim it). Commit whichever side moved.

If nothing drifted, no commit needed — move to Task 7.

---

## Task 7: End-to-end template smoke in an existing phase

**Files:**
- Modify: `installer/src/installer/config.rs::generate_config` — ensure secrets are filled before `render_env` is called

- [ ] **Step 1: Write the test**

Append to `installer/tests/env_template.rs`:

```rust
#[test]
fn generate_config_fills_secrets_then_renders() {
    let mut cfg = InstallConfig::default();
    // install_dir needs to exist for the disk write; redirect to tmp.
    let tmp = std::env::temp_dir().join(format!("installer-test-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    cfg.install_dir = tmp.to_string_lossy().to_string();

    rantai_agents_installer::installer::config::generate_config(&mut cfg).unwrap();

    // After generate_config: secrets auto-filled, .env on disk.
    assert!(!cfg.db_password.is_empty(), "db_password must be auto-filled");
    assert!(!cfg.nextauth_secret.is_empty());
    let env_path = tmp.join(".env");
    let contents = std::fs::read_to_string(&env_path).unwrap();
    assert!(contents.contains("DB_PASSWORD="));
    assert!(contents.contains("KB_EXTRACT_PRIMARY=\"smart\""));

    std::fs::remove_dir_all(&tmp).ok();
}
```

- [ ] **Step 2: Run**

Run: `cd installer && cargo test --test env_template`

Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add installer/tests/env_template.rs
git commit-sulthan -m "test(installer): generate_config end-to-end — secrets fill + disk write"
```

---

## Task 8: `ProfileSelect` screen type

**Files:**
- Modify: `installer/src/app.rs` — add `Screen::ProfileSelect` variant + `profile_index` state

- [ ] **Step 1: Add Screen variant**

In `installer/src/app.rs`, update the `Screen` enum:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Welcome,
    ProfileSelect,   // <-- new
    ModeSelect,
    OptionalServices,
    Config,
    Preflight,
    Progress,
    Verify,
    Complete,
    Error,
}
```

- [ ] **Step 2: Add App state**

In the `App` struct (around line 251), add after `pub mode_index: usize`:

```rust
    // Profile selection (new screen)
    pub profile_index: usize,
```

In `App::new`, initialize it:

```rust
            profile_index: 0,
```

- [ ] **Step 3: Compile**

Run: `cd installer && cargo build --release 2>&1 | head -30`

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add installer/src/app.rs
git commit-sulthan -m "feat(installer): Screen::ProfileSelect variant + profile_index state"
```

---

## Task 9: Profile picker UI

**Files:**
- Create: `installer/src/ui/screens/profile_select.rs`
- Modify: `installer/src/ui/screens/mod.rs`

- [ ] **Step 1: Create the screen module**

Copy `installer/src/ui/screens/mode_select.rs` as a template and adapt:

Create `installer/src/ui/screens/profile_select.rs`:

```rust
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::{App, InstallProfile};
use crate::theme;
use crate::ui::widgets::status_bar;

const PROFILES: [InstallProfile; 3] = [
    InstallProfile::AllInOne,
    InstallProfile::AppOnly,
    InstallProfile::SidecarOnly,
];

pub fn draw(f: &mut Frame, app: &App) {
    let size = f.area();

    let outer = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(1)])
        .split(size);

    status_bar::draw(f, app, outer[1]);

    let main_block = Block::default()
        .borders(Borders::ALL)
        .border_style(theme::border_active())
        .title(Span::styled(" Installation Profile ", theme::primary_bold()));

    let main_inner = main_block.inner(outer[0]);
    f.render_widget(main_block, outer[0]);

    let panels = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(35), Constraint::Percentage(65)])
        .split(main_inner);

    let items: Vec<ListItem> = PROFILES
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let indicator = if i == app.profile_index {
                theme::SYM_ARROW
            } else {
                " "
            };
            let style = if i == app.profile_index {
                theme::primary_bold()
            } else {
                theme::text()
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!(" {} ", indicator), theme::primary()),
                Span::styled(p.label(), style),
            ]))
        })
        .collect();

    let list = List::new(items).block(
        Block::default()
            .borders(Borders::RIGHT)
            .border_style(theme::border_inactive()),
    );
    f.render_widget(list, panels[0]);

    let selected = PROFILES[app.profile_index];
    let mut details: Vec<Line> = Vec::new();
    details.push(Line::from(Span::styled(selected.label(), theme::primary_bold())));
    details.push(Line::from(""));
    details.push(Line::from(Span::styled(
        selected.description(),
        theme::text_muted(),
    )));
    details.push(Line::from(""));
    details.push(Line::from(Span::styled(
        match selected {
            InstallProfile::AppOnly => {
                "You'll be prompted for sidecar URLs (MinerU, rerank) pointing at your GPU box."
            }
            InstallProfile::SidecarOnly => {
                "Requires NVIDIA GPU. The installer will create a Python venv, install deps, \
                 pre-download the Nemotron rerank model, and install systemd units."
            }
            InstallProfile::AllInOne => {
                "Everything on this machine. GPU recommended for the on-prem OCR / rerank path, \
                 but you can also use cloud providers (KB_EXTRACT_PRIMARY='smart' with cloud fallback)."
            }
        },
        theme::accent(),
    )));

    let para = Paragraph::new(details).wrap(Wrap { trim: true });
    f.render_widget(
        Block::default()
            .borders(Borders::NONE)
            .border_style(theme::border_inactive()),
        panels[1],
    );
    f.render_widget(para, panels[1]);
}

/// Translates `profile_index` to `InstallProfile`. Keep this in sync with `PROFILES`.
pub fn selected_profile(app: &App) -> InstallProfile {
    PROFILES[app.profile_index]
}
```

- [ ] **Step 2: Register the module**

In `installer/src/ui/screens/mod.rs`, add:

```rust
pub mod profile_select;
```

- [ ] **Step 3: Compile**

Run: `cd installer && cargo build --release 2>&1 | head -30`

Expected: no errors. If `theme::accent()` or `theme::text_muted()` don't exist, substitute `theme::text()` — the goal is "compiles".

- [ ] **Step 4: Commit**

```bash
git add installer/src/ui/screens/profile_select.rs installer/src/ui/screens/mod.rs
git commit-sulthan -m "feat(installer): ProfileSelect screen UI

- two-panel picker mirroring mode_select.rs structure
- three options: AllInOne (default), AppOnly, SidecarOnly
- right panel shows description + profile-specific next-step hint"
```

---

## Task 10: Wire `Screen::ProfileSelect` into the state machine

**Files:**
- Modify: `installer/src/main.rs` — route the new screen + handle keys

- [ ] **Step 1: Find where screens are dispatched**

Run: `cd installer && grep -n "Screen::" src/main.rs | head -30`

There should be a `match app.screen` that calls the draw function for each screen, and a key handler match that advances `app.screen`.

- [ ] **Step 2: Add profile_select to draw dispatch**

Find the draw dispatch (typically in `ui::draw` or equivalent) and add:

```rust
Screen::ProfileSelect => ui::screens::profile_select::draw(f, app),
```

- [ ] **Step 3: Add key handling**

In the key handler for `Screen::Welcome`, after the user advances, go to `Screen::ProfileSelect` instead of `Screen::ModeSelect`:

```rust
Screen::Welcome => {
    if let KeyCode::Enter = key.code {
        app.screen = Screen::ProfileSelect;
    }
}
```

Add a new handler block for `Screen::ProfileSelect`:

```rust
Screen::ProfileSelect => match key.code {
    KeyCode::Up => {
        if app.profile_index > 0 {
            app.profile_index -= 1;
        }
    }
    KeyCode::Down => {
        if app.profile_index < 2 {
            app.profile_index += 1;
        }
    }
    KeyCode::Enter => {
        app.config.profile = ui::screens::profile_select::selected_profile(app);
        // SidecarOnly skips ModeSelect/OptionalServices entirely.
        app.screen = if app.config.profile == InstallProfile::SidecarOnly {
            Screen::Config
        } else {
            Screen::ModeSelect
        };
    }
    KeyCode::Esc => {
        app.screen = Screen::Welcome;
    }
    _ => {}
},
```

Import `InstallProfile` and the screen module at the top of `main.rs` as needed.

- [ ] **Step 4: Smoke run the TUI**

Run: `cd installer && cargo run`

Expected: TUI opens on Welcome, Enter advances to ProfileSelect, Up/Down navigates, Enter selects and advances.

Press `q` to quit (or `Ctrl-C`). This is manual — no automated test for TUI navigation.

- [ ] **Step 5: Commit**

```bash
git add installer/src/main.rs
git commit-sulthan -m "feat(installer): route Screen::ProfileSelect into state machine

- Welcome → ProfileSelect → (ModeSelect OR Config depending on profile)
- SidecarOnly skips ModeSelect + OptionalServices since those are app-side decisions"
```

---

## Task 11: Unit test for selected_profile helper

**Files:**
- Append: `installer/tests/profile_skip.rs`

- [ ] **Step 1: Add test**

```rust
use rantai_agents_installer::app::{App, InstallMode, InstallProfile};
use rantai_agents_installer::ui::screens::profile_select;

#[test]
fn selected_profile_matches_index() {
    let mut app = App::new(InstallMode::Full);
    app.profile_index = 0;
    assert_eq!(profile_select::selected_profile(&app), InstallProfile::AllInOne);
    app.profile_index = 1;
    assert_eq!(profile_select::selected_profile(&app), InstallProfile::AppOnly);
    app.profile_index = 2;
    assert_eq!(profile_select::selected_profile(&app), InstallProfile::SidecarOnly);
}
```

For this test to compile, `ui` must be `pub mod ui;` in `main.rs`. Check + change if needed.

- [ ] **Step 2: Run**

Run: `cd installer && cargo test --test profile_skip`

Expected: 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add installer/tests/profile_skip.rs installer/src/main.rs
git commit-sulthan -m "test(installer): selected_profile index mapping"
```

---

## Task 12: Profile-aware config fields

**Files:**
- Modify: `installer/src/app.rs::App::build_config_fields`

When profile is `SidecarOnly`, the config screen should hide Postgres / SurrealDB / S3 / NextAuth fields (none of those are used on a GPU-only box) and show GPU / venv / sidecar fields. When profile is `AppOnly`, show DB/S3/Auth + sidecar URLs. When `AllInOne`, show everything.

- [ ] **Step 1: Inspect the existing `build_config_fields`**

Run: `cd installer && sed -n '349,477p' src/app.rs`

You'll see a series of `fields.extend([...])` blocks gated on `self.mode`. You'll now add profile gating.

- [ ] **Step 2: Rewrite `build_config_fields`**

Replace the whole method. Keep the base two fields (install_dir, data_dir) always. Then conditionally add groups:

```rust
pub fn build_config_fields(&mut self) {
    let c = &self.config;
    let mut fields = vec![
        ConfigField { key: "install_dir".into(), label: "Install Directory".into(), value: c.install_dir.clone(), secret: false },
        ConfigField { key: "data_dir".into(), label: "Data Directory".into(), value: c.data_dir.clone(), secret: false },
    ];

    let profile_app = c.profile.includes_app();
    let profile_sidecars = c.profile.includes_sidecars();

    if profile_app && (!self.mode.includes_docker_services() || self.mode == InstallMode::Minimal) {
        fields.extend([
            ConfigField { key: "db_host".into(), label: "PostgreSQL Host".into(), value: c.db_host.clone(), secret: false },
            ConfigField { key: "db_port".into(), label: "PostgreSQL Port".into(), value: c.db_port.clone(), secret: false },
            ConfigField { key: "db_name".into(), label: "PostgreSQL DB Name".into(), value: c.db_name.clone(), secret: false },
            ConfigField { key: "db_user".into(), label: "PostgreSQL User".into(), value: c.db_user.clone(), secret: false },
            ConfigField { key: "db_password".into(), label: "PostgreSQL Password (blank = auto)".into(), value: c.db_password.clone(), secret: true },
            ConfigField { key: "surrealdb_url".into(), label: "SurrealDB URL".into(), value: c.surrealdb_url.clone(), secret: false },
            ConfigField { key: "surrealdb_user".into(), label: "SurrealDB User".into(), value: c.surrealdb_user.clone(), secret: false },
            ConfigField { key: "surrealdb_pass".into(), label: "SurrealDB Password".into(), value: c.surrealdb_pass.clone(), secret: true },
            ConfigField { key: "s3_endpoint".into(), label: "S3 Endpoint".into(), value: c.s3_endpoint.clone(), secret: false },
            ConfigField { key: "s3_access_key".into(), label: "S3 Access Key (blank = auto)".into(), value: c.s3_access_key.clone(), secret: true },
            ConfigField { key: "s3_secret_key".into(), label: "S3 Secret Key (blank = auto)".into(), value: c.s3_secret_key.clone(), secret: true },
            ConfigField { key: "s3_bucket".into(), label: "S3 Bucket".into(), value: c.s3_bucket.clone(), secret: false },
        ]);
    }

    if profile_app {
        fields.extend([
            ConfigField { key: "nextauth_secret".into(), label: "NextAuth Secret (blank = auto)".into(), value: c.nextauth_secret.clone(), secret: true },
            ConfigField { key: "nextauth_url".into(), label: "NextAuth URL".into(), value: c.nextauth_url.clone(), secret: false },
            ConfigField { key: "openrouter_api_key".into(), label: "OpenRouter API Key".into(), value: c.openrouter_api_key.clone(), secret: true },
            ConfigField { key: "admin_email".into(), label: "Admin Email".into(), value: c.admin_email.clone(), secret: false },
            ConfigField { key: "admin_password".into(), label: "Admin Password (blank = auto)".into(), value: c.admin_password.clone(), secret: true },
            // Sidecar URLs — where the app will reach them.
            ConfigField { key: "mineru_base_url".into(), label: "MinerU Base URL".into(), value: c.sidecar.mineru_base_url.clone(), secret: false },
            ConfigField { key: "rerank_base_url".into(), label: "Rerank Base URL".into(), value: c.sidecar.rerank_base_url.clone(), secret: false },
        ]);
    }

    if profile_sidecars {
        fields.extend([
            ConfigField { key: "gpu_device_id".into(), label: "GPU Device ID (0 = first card)".into(), value: c.sidecar.gpu_device_id.to_string(), secret: false },
            ConfigField { key: "python_venv_dir".into(), label: "Python venv directory".into(), value: c.sidecar.python_venv_dir.clone(), secret: false },
            ConfigField { key: "hf_cache_dir".into(), label: "HuggingFace cache directory".into(), value: c.sidecar.hf_cache_dir.clone(), secret: false },
            ConfigField { key: "rerank_model".into(), label: "Rerank model ID".into(), value: c.sidecar.rerank_model.clone(), secret: false },
            ConfigField { key: "mineru_port".into(), label: "MinerU sidecar port".into(), value: c.sidecar.mineru_port.to_string(), secret: false },
            ConfigField { key: "rerank_port".into(), label: "Rerank sidecar port".into(), value: c.sidecar.rerank_port.to_string(), secret: false },
        ]);
    }

    self.config_items = fields;
}
```

- [ ] **Step 3: Update `apply_config_value`**

The existing `apply_config_value` (or whatever reads `config_buffer` back into the config struct) must also know about the new keys. Grep for `"db_host" =>` to find the match arm, add new arms for `mineru_base_url`, `rerank_base_url`, `gpu_device_id`, `python_venv_dir`, `hf_cache_dir`, `rerank_model`, `mineru_port`, `rerank_port`. Use `parse::<u32>()` / `parse::<u16>()` for the numeric fields (fall back to current value on parse error).

- [ ] **Step 4: Compile + smoke**

Run: `cd installer && cargo build --release`

Run: `cd installer && cargo run` and navigate: Welcome → SidecarOnly → Config. Verify only the sidecar fields show.

- [ ] **Step 5: Commit**

```bash
git add installer/src/app.rs
git commit-sulthan -m "feat(installer): profile-aware config field list

- AppOnly hides GPU/venv fields, shows sidecar URLs to point at remote GPU box
- SidecarOnly hides DB/S3/Auth fields, shows GPU/venv/model/port fields
- AllInOne shows everything
- apply_config_value handles numeric parses for gpu_device_id / *_port"
```

---

## Task 13: Profile validation before preflight

**Files:**
- Modify: `installer/src/main.rs` — validate on Config → Preflight transition

- [ ] **Step 1: Add validation**

In `main.rs`, find where `Screen::Config` advances to `Screen::Preflight`. Before the transition, call a new `validate_config` that returns `Result<(), String>`:

```rust
fn validate_config(cfg: &InstallConfig) -> Result<(), String> {
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
```

Call it on Enter from Config. On Err, set `app.error_message` and stay on the Config screen.

- [ ] **Step 2: Unit test the validator**

Append to `installer/tests/profile_skip.rs`:

```rust
#[test]
fn validate_rejects_bad_urls_for_app_profile() {
    let mut cfg = InstallConfig::default();
    cfg.profile = InstallProfile::AppOnly;
    cfg.sidecar.mineru_base_url = "gpu-box:8100".into(); // no scheme
    assert!(main_mod::validate_config(&cfg).is_err());
}
```

For this to work `validate_config` must be `pub` and reachable from the integration test. Simplest move: put `validate_config` in a new `installer/src/validate.rs` module (`pub mod validate;` in `main.rs` / lib root), expose `validate::validate_config`. Then in the test:

```rust
use rantai_agents_installer::validate::validate_config;
```

- [ ] **Step 3: Compile + test**

Run: `cd installer && cargo test`

Expected: all tests pass including the new one.

- [ ] **Step 4: Commit**

```bash
git add installer/src/main.rs installer/src/validate.rs installer/tests/profile_skip.rs
git commit-sulthan -m "feat(installer): config validation before preflight

- sidecar profile rejects absurd GPU ids and empty venv path
- app profile rejects sidecar URLs missing http:// scheme
- unit test covers the URL scheme guard"
```

---

## Task 14: Preflight — GPU + Python checks for sidecar profiles

**Files:**
- Modify: `installer/src/installer/preflight.rs`

- [ ] **Step 1: Add GPU preflight function**

At the end of `preflight.rs`, add:

```rust
/// Check for nvidia-smi + at least one GPU. Used only when profile includes sidecars.
pub async fn check_gpu() -> (bool, String) {
    use super::run_command;
    match run_command("nvidia-smi", &["--query-gpu=name,memory.total", "--format=csv,noheader"]) {
        Ok(out) => {
            let lines: Vec<&str> = out.lines().filter(|l| !l.trim().is_empty()).collect();
            if lines.is_empty() {
                (false, "nvidia-smi ran but reported zero GPUs".into())
            } else {
                (true, format!("{} GPU(s): {}", lines.len(), lines.join(" | ")))
            }
        }
        Err(e) => (false, format!("nvidia-smi not available: {e}")),
    }
}

pub async fn check_python_3_10() -> (bool, String) {
    use super::run_command;
    for candidate in &["python3.12", "python3.11", "python3.10", "python3"] {
        if let Ok(out) = run_command(candidate, &["--version"]) {
            let ver = out.trim().to_string();
            if ver.contains("3.10") || ver.contains("3.11") || ver.contains("3.12") || ver.contains("3.13") {
                return (true, format!("{candidate} → {ver}"));
            }
        }
    }
    (false, "No python3.10+ found on PATH".into())
}
```

- [ ] **Step 2: Wire into the preflight phase**

In `run_preflight` (same file), find where checks are assembled. After the existing ones, append:

```rust
if config.profile.includes_sidecars() {
    let (ok, msg) = check_gpu().await;
    push(/* existing push helper */, "NVIDIA GPU", ok, msg);
    let (ok, msg) = check_python_3_10().await;
    push(/* existing push helper */, "Python 3.10+", ok, msg);
}
```

Replace `push(...)` with the actual pattern the file uses — grep for existing `checks.push(CheckItem { ... })` and copy.

- [ ] **Step 3: Unit test the pure helpers is impossible (they shell out). Skip test; rely on manual smoke**

Run: `cd installer && cargo build --release`

Smoke: pick `SidecarOnly` in the TUI and step through preflight on a box without `nvidia-smi` — should show red "NVIDIA GPU" row with the error message. On a GPU box, shows green with GPU names.

- [ ] **Step 4: Commit**

```bash
git add installer/src/installer/preflight.rs
git commit-sulthan -m "feat(installer): GPU + Python preflight for sidecar profiles

- check_gpu: nvidia-smi --query-gpu, fails clean when not installed
- check_python_3_10: walks python3.{12,11,10,3} on PATH
- wired into run_preflight only when profile.includes_sidecars()"
```

---

## Task 15: `requirements.txt` for each sidecar

**Files:**
- Create: `services/mineru-server/requirements.txt`
- Create: `services/rerank-server/requirements.txt`

- [ ] **Step 1: Capture working versions from ~/vllm-env**

On the user's machine you have working versions. Pin them:

Create `services/rerank-server/requirements.txt`:

```
# Pinned for rerank-server sidecar. Loads nvidia/llama-nemotron-rerank-1b-v2.
# Install into an isolated venv: python -m venv ~/vllm-env && ~/vllm-env/bin/pip install -r requirements.txt
transformers>=4.57.0,<4.60
torch>=2.8.0,<2.11
fastapi>=0.135,<0.140
uvicorn[standard]>=0.32,<0.40
pydantic>=2.8
accelerate>=0.34
# tokenizer backend for tight fast paths
tokenizers>=0.20
```

Create `services/mineru-server/requirements.txt`:

```
# Pinned for mineru-server sidecar. MinerU is the real heavy lifter; this file only
# captures the glue deps. mineru-vl-utils + vllm should already be present in the
# venv (installed alongside the MinerU model pull).
fastapi>=0.135,<0.140
uvicorn[standard]>=0.32,<0.40
pydantic>=2.8
mineru-vl-utils>=2.5
```

Version bounds come from what's currently in `~/vllm-env` (see `~/vllm-env/bin/pip list`); if a version is unknown, omit the upper bound and leave a TODO comment for the operator.

- [ ] **Step 2: Commit**

```bash
git add services/mineru-server/requirements.txt services/rerank-server/requirements.txt
git commit-sulthan -m "feat(services): pin Python deps for each sidecar

requirements.txt captures the minimum set needed by server.py. vLLM + mineru
heavy deps are orthogonal (separate install)."
```

---

## Task 16: `sidecar.rs` skeleton with Python venv creation

**Files:**
- Create: `installer/src/installer/sidecar.rs`
- Modify: `installer/src/installer/mod.rs`

- [ ] **Step 1: Create the module**

```rust
use tokio::sync::mpsc::Sender;

use super::executor::InstallMessage;
use super::run_command;
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
        ))).await.ok();
        return Ok(());
    }

    tx.send(InstallMessage::Progress(format!(
        "Creating Python venv at {venv}..."
    ))).await.ok();

    // Find a Python. Prefer 3.12 → 3.11 → 3.10 → 3.
    let python_bin = ["python3.12", "python3.11", "python3.10", "python3"]
        .iter()
        .find(|p| run_command("which", &[p]).is_ok())
        .ok_or("No python3.10+ found on PATH")?;

    run_command(python_bin, &["-m", "venv", venv])?;
    Ok(())
}
```

Declare the module in `installer/src/installer/mod.rs`:

```rust
pub mod sidecar;
```

- [ ] **Step 2: Compile**

Run: `cd installer && cargo build --release`

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add installer/src/installer/sidecar.rs installer/src/installer/mod.rs
git commit-sulthan -m "feat(installer): sidecar::ensure_venv — idempotent Python venv bootstrap"
```

---

## Task 17: `pip install -r requirements.txt` for each sidecar

**Files:**
- Modify: `installer/src/installer/sidecar.rs`

- [ ] **Step 1: Add install function**

Append to `sidecar.rs`:

```rust
pub async fn pip_install_requirements(
    config: &InstallConfig,
    requirements_path: &str,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    let pip = format!("{}/bin/pip", config.sidecar.python_venv_dir);
    tx.send(InstallMessage::Progress(format!(
        "pip install -r {requirements_path}..."
    ))).await.ok();
    run_command(&pip, &["install", "--upgrade", "pip"])?;
    run_command(&pip, &["install", "-r", requirements_path])?;
    Ok(())
}
```

- [ ] **Step 2: Unit-testable wrapper is tricky (shells out). Rely on smoke.**

- [ ] **Step 3: Commit**

```bash
git add installer/src/installer/sidecar.rs
git commit-sulthan -m "feat(installer): sidecar::pip_install_requirements helper"
```

---

## Task 18: HuggingFace model pre-download

**Files:**
- Modify: `installer/src/installer/sidecar.rs`

- [ ] **Step 1: Add download function**

Append to `sidecar.rs`:

```rust
pub async fn prefetch_hf_model(
    config: &InstallConfig,
    model_id: &str,
    tx: &Sender<InstallMessage>,
) -> Result<(), String> {
    let python = format!("{}/bin/python", config.sidecar.python_venv_dir);
    tx.send(InstallMessage::Progress(format!(
        "Pre-downloading HF model {model_id}..."
    ))).await.ok();

    // huggingface-cli download with trust_remote_code=True
    let script = format!(
        r#"
import os
os.environ.setdefault('HF_HOME', '{hf}')
from huggingface_hub import snapshot_download
snapshot_download(repo_id={model!r}, allow_patterns=['*.json', '*.safetensors', '*.txt', '*.model', '*.py'])
print('ok')
"#,
        hf = config.sidecar.hf_cache_dir,
        model = model_id,
    );

    run_command(&python, &["-c", &script])?;
    Ok(())
}
```

- [ ] **Step 2: Commit**

```bash
git add installer/src/installer/sidecar.rs
git commit-sulthan -m "feat(installer): sidecar::prefetch_hf_model — snapshot_download into venv"
```

---

## Task 19: Systemd unit generator for sidecars

**Files:**
- Modify: `installer/src/installer/sidecar.rs`

- [ ] **Step 1: Add unit templates**

Append to `sidecar.rs`:

```rust
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
```

- [ ] **Step 2: Unit test the generators**

Create `installer/tests/sidecar_units.rs`:

```rust
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
}

#[test]
fn rerank_unit_references_model() {
    let mut cfg = InstallConfig::default();
    cfg.sidecar.rerank_model = "test/model-id".into();
    let unit = sidecar::rerank_unit_for_test(&cfg, "/opt/rantai-agents");
    assert!(unit.contains("RERANK_MODEL=test/model-id"));
    assert!(unit.contains("--port 8200"));
}
```

For the test to compile, the internal `mineru_unit` / `rerank_unit` must be exposed. Add at the end of `sidecar.rs`:

```rust
#[cfg(any(test, feature = "test-util"))]
pub fn mineru_unit_for_test(config: &InstallConfig, repo_dir: &str) -> String {
    mineru_unit(config, repo_dir)
}
#[cfg(any(test, feature = "test-util"))]
pub fn rerank_unit_for_test(config: &InstallConfig, repo_dir: &str) -> String {
    rerank_unit(config, repo_dir)
}
```

Simpler alternative: make the inner functions `pub` directly. Either works.

- [ ] **Step 3: Run tests**

Run: `cd installer && cargo test --test sidecar_units`

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add installer/src/installer/sidecar.rs installer/tests/sidecar_units.rs
git commit-sulthan -m "feat(installer): sidecar systemd unit templates + tests

- mineru_unit: CUDA_VISIBLE_DEVICES + FLASHINFER_DISABLE_VERSION_CHECK + port 8100
- rerank_unit: CUDA_VISIBLE_DEVICES + RERANK_MODEL env + port 8200
- both: Type=simple, User=rantai-agents, Restart=on-failure, journal logs"
```

---

## Task 20: Install + enable + start sidecar services

**Files:**
- Modify: `installer/src/installer/sidecar.rs`

- [ ] **Step 1: Add the orchestrator**

Append to `sidecar.rs`:

```rust
use super::run_sudo;
use std::fs;

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
    ))).await.ok();

    let tmp = format!("/tmp/{name}.service");
    let dst = format!("/etc/systemd/system/{name}.service");
    fs::write(&tmp, unit_content).map_err(|e| format!("tmp write: {e}"))?;
    run_sudo("mv", &[&tmp, &dst])?;
    run_sudo("chmod", &["644", &dst])?;

    run_sudo("systemctl", &["daemon-reload"])?;
    run_sudo("systemctl", &["enable", name])?;

    tx.send(InstallMessage::Progress(format!(
        "Starting {name}..."
    ))).await.ok();
    run_sudo("systemctl", &["restart", name])?;
    Ok(())
}
```

- [ ] **Step 2: Compile + smoke**

Run: `cd installer && cargo build --release`

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add installer/src/installer/sidecar.rs
git commit-sulthan -m "feat(installer): install_sidecar_services — systemd deploy for mineru + rerank"
```

---

## Task 21: Executor wires the `SidecarInstall` phase

**Files:**
- Modify: `installer/src/installer/executor.rs`

- [ ] **Step 1: Branch on `Phase::SidecarInstall`**

In `execute_phase` (the big match statement), add:

```rust
Phase::SidecarInstall => {
    use super::sidecar;
    let repo = &config.install_dir; // repo checked out here already by earlier phase

    sidecar::ensure_venv(config, tx).await?;

    if config.sidecar.mineru_enabled {
        let req = format!("{repo}/services/mineru-server/requirements.txt");
        sidecar::pip_install_requirements(config, &req, tx).await?;
    }
    if config.sidecar.rerank_enabled {
        let req = format!("{repo}/services/rerank-server/requirements.txt");
        sidecar::pip_install_requirements(config, &req, tx).await?;
        let model = config.sidecar.rerank_model.clone();
        sidecar::prefetch_hf_model(config, &model, tx).await?;
    }

    sidecar::install_sidecar_services(config, repo, tx).await?;
    Ok(())
}
```

Note: `install_dir` for a SidecarOnly install should still be set (the installer needs a place to have cloned the repo to read `services/*/server.py` + `requirements.txt` from). The `ApplicationSetup` phase does the clone for `AppOnly`/`AllInOne`; for `SidecarOnly` it's skipped, so we need a lightweight "clone only the services dir" step — or just require `ApplicationSetup` to run always but only materialize `services/` for SidecarOnly.

Simplest fix: do NOT skip `ApplicationSetup` for `SidecarOnly`, but have it only run the `git clone` / `bun install --production=false --ignore-scripts -- services/**` — not the full `bun install`. Add a method `ApplicationSetup::is_sidecar_only_subset` that short-circuits to just the clone.

Alternatively: require the operator to have the repo checked out already on the GPU box, and skip ApplicationSetup for SidecarOnly. This is simpler — add to the pre-install docs: "clone the repo to install_dir before running the SidecarOnly install."

Pick the simpler path. Update `installer/src/installer/profile.rs::profile_skips_phase`:

```rust
InstallProfile::SidecarOnly => matches!(
    phase,
    Phase::Infrastructure
        | Phase::ApplicationSetup
        | Phase::Configuration
        | Phase::Database
        | Phase::Services
),
```

Add a preflight check for SidecarOnly that `{install_dir}/services/rerank-server/server.py` exists.

- [ ] **Step 2: Add the preflight check**

In `preflight.rs`, in the sidecar branch, append:

```rust
if config.profile == InstallProfile::SidecarOnly {
    let sentinel = format!("{}/services/rerank-server/server.py", config.install_dir);
    let ok = std::path::Path::new(&sentinel).exists();
    push(
        &mut checks,
        "Repo checked out at install_dir",
        ok,
        if ok {
            format!("found {sentinel}")
        } else {
            format!(
                "missing {sentinel} — clone the repo to {install_dir} before running SidecarOnly install",
                install_dir = config.install_dir
            )
        },
    );
}
```

- [ ] **Step 3: Compile**

Run: `cd installer && cargo build --release`

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add installer/src/installer/executor.rs installer/src/installer/preflight.rs
git commit-sulthan -m "feat(installer): SidecarInstall phase — venv + pip + model + systemd

- executor branches on Phase::SidecarInstall and runs the full sidecar flow
- SidecarOnly requires the repo to be pre-cloned to install_dir (preflight guard)
- pip install is skipped for disabled sidecars (mineru_enabled / rerank_enabled)"
```

---

## Task 22: Verify — `GET /health` on installed sidecars

**Files:**
- Modify: `installer/src/installer/verify.rs`

- [ ] **Step 1: Add sidecar verification**

In `verify.rs`, extend the verification checks. After the existing ones:

```rust
if config.profile.includes_sidecars() {
    if config.sidecar.mineru_enabled {
        let url = format!("http://localhost:{}/health", config.sidecar.mineru_port);
        let (ok, msg) = http_head_ok(&url).await;
        push(&mut checks, "MinerU sidecar /health", ok, msg);
    }
    if config.sidecar.rerank_enabled {
        let url = format!("http://localhost:{}/health", config.sidecar.rerank_port);
        let (ok, msg) = http_head_ok(&url).await;
        push(&mut checks, "Rerank sidecar /health", ok, msg);
    }
}
```

Add the helper (use `reqwest::blocking` since it's already in `Cargo.toml`):

```rust
async fn http_head_ok(url: &str) -> (bool, String) {
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => return (false, format!("client build failed: {e}")),
    };
    match client.get(url).send() {
        Ok(r) if r.status().is_success() => (true, format!("200 OK at {url}")),
        Ok(r) => (false, format!("{} at {url}", r.status())),
        Err(e) => (false, format!("failed: {e}")),
    }
}
```

Note: `reqwest::blocking` inside an async fn is fine for a one-shot health check but technically blocks the tokio thread. If the rest of verify.rs is truly async, wrap with `tokio::task::spawn_blocking`. If everything there is synchronous-inside-async already (check the file), leave it.

- [ ] **Step 2: Compile + smoke**

Run: `cd installer && cargo build --release`

Smoke: manually check by curling `http://localhost:8200/health` after running the SidecarOnly install.

- [ ] **Step 3: Commit**

```bash
git add installer/src/installer/verify.rs
git commit-sulthan -m "feat(installer): verify /health endpoints on installed sidecars"
```

---

## Task 23: Post-install summary — print sidecar URLs for cross-machine hand-off

**Files:**
- Modify: `installer/src/ui/screens/complete.rs`

- [ ] **Step 1: Extend the complete screen**

In the complete screen, when `config.profile == SidecarOnly` or `config.profile.includes_sidecars()`, render an additional panel:

```text
┌─ SIDECAR URLs — paste these into your app server's .env ─────────────┐
│  KB_EXTRACT_PRIMARY="smart"                                          │
│  KB_EXTRACT_MINERU_BASE_URL="http://<THIS-MACHINE>:8100"             │
│                                                                      │
│  KB_RERANK_ENABLED="true"                                            │
│  KB_RERANK_PROVIDER="vllm"                                           │
│  KB_RERANK_BASE_URL="http://<THIS-MACHINE>:8200"                     │
│  KB_RERANK_MODEL="nvidia/llama-nemotron-rerank-1b-v2"                │
└──────────────────────────────────────────────────────────────────────┘
```

Get the machine's external hostname via `run_command("hostname", &["-f"])` and fall back to `-I` if `-f` fails. Don't attempt to guess the "correct" external IP — show hostname + port and let the operator substitute.

- [ ] **Step 2: Smoke**

Run: `cd installer && cargo run` — advance through any profile, verify the summary renders correctly for sidecar-inclusive profiles and is hidden for AppOnly.

- [ ] **Step 3: Commit**

```bash
git add installer/src/ui/screens/complete.rs
git commit-sulthan -m "feat(installer): complete screen shows sidecar URLs for operator hand-off

Printed block is paste-ready for the app server's .env. Uses hostname -f for
the host portion; operator substitutes the real address if needed."
```

---

## Task 24: Update sidecar READMEs to cross-reference the installer

**Files:**
- Modify: `services/mineru-server/README.md`
- Modify: `services/rerank-server/README.md`

- [ ] **Step 1: Add the installer block**

At the top of each README, add:

```markdown
## Quickest path — use the installer

The Rust installer at `installer/` handles venv + pip + model download + systemd
for this sidecar. From the GPU box:

```bash
git clone https://github.com/RantAI-dev/RantAI-Agents.git /opt/rantai-agents
cd /opt/rantai-agents/installer
cargo run --release

# Pick: "Sidecars Only (GPU box)"
```

After install, the post-install summary prints the URL line to paste into the
app server's `.env`.

For manual setup, read on.
```

Keep the rest of each README for operators who want the manual path.

- [ ] **Step 2: Commit**

```bash
git add services/mineru-server/README.md services/rerank-server/README.md
git commit-sulthan -m "docs(services): cross-reference the installer for sidecar setup"
```

---

## Task 25: Regression — rebuild + full test suite

**Files:** none — verification only.

- [ ] **Step 1: Full build**

Run: `cd installer && cargo build --release 2>&1 | tail -20`

Expected: 0 warnings that are new relative to main. Compare with `git checkout main -- . && cargo build --release 2>&1 | tail -20` if unsure.

- [ ] **Step 2: Full test**

Run: `cd installer && cargo test 2>&1 | tail -20`

Expected: all tests pass (10+ from new files + original).

- [ ] **Step 3: Clippy**

Run: `cd installer && cargo clippy --release -- -D warnings 2>&1 | tail -20`

Expected: no new warnings. Fix any.

- [ ] **Step 4: Fmt**

Run: `cd installer && cargo fmt --check`

Expected: clean. If not, run `cargo fmt`.

- [ ] **Step 5: Commit (if cargo fmt changed anything)**

```bash
git add -A
git commit-sulthan -m "style(installer): cargo fmt"
```

---

## Task 26: Manual end-to-end — SidecarOnly on the GPU box

**Files:** none — manual verification.

- [ ] **Step 1: Clean slate**

On the GPU box:

```bash
sudo systemctl stop rantai-agents-mineru rantai-agents-rerank 2>/dev/null || true
sudo systemctl disable rantai-agents-mineru rantai-agents-rerank 2>/dev/null || true
sudo rm -f /etc/systemd/system/rantai-agents-{mineru,rerank}.service
rm -rf ~/rantai-test-venv
```

- [ ] **Step 2: Run installer in SidecarOnly mode**

```bash
cd /opt/rantai-agents/installer
cargo run --release
```

Navigate: Welcome → SidecarOnly → Config (set `python_venv_dir=~/rantai-test-venv`) → Preflight (should pass GPU + Python checks) → Progress.

Watch progress. Expected phases: Preflight → Dependencies (skipped) → Infrastructure (skipped) → ApplicationSetup (skipped) → Configuration (skipped) → Database (skipped) → Services (skipped) → SidecarInstall → Verification.

- [ ] **Step 3: Verify the services are alive**

```bash
systemctl status rantai-agents-mineru rantai-agents-rerank
curl -s http://localhost:8100/health
curl -s http://localhost:8200/health
```

Both should return `{"ok":true, ...}`.

- [ ] **Step 4: Smoke a real rerank call**

```bash
curl -s -X POST http://localhost:8200/rerank \
  -H "Content-Type: application/json" \
  -d '{"query":"what is photosynthesis","documents":["plants convert sunlight to energy","bananas are yellow"],"top_n":2}'
```

Expected: the photosynthesis document scores higher than bananas.

- [ ] **Step 5: Tear down, document any issues**

```bash
sudo systemctl stop rantai-agents-mineru rantai-agents-rerank
```

If any step failed, file a follow-up task.

---

## Task 27: Manual end-to-end — AppOnly pointing at the GPU box

**Files:** none — manual verification.

- [ ] **Step 1: Install app-only on the app server**

On the app server (not the GPU box):

```bash
cd /opt/rantai-agents/installer
cargo run --release
```

Navigate: Welcome → AppOnly → ModeSelect (Full) → Config (set `mineru_base_url=http://gpu-box.internal:8100` and same for rerank) → Preflight → Progress.

Preflight should NOT ask for GPU. SidecarInstall phase should be skipped.

- [ ] **Step 2: Verify `.env` contents**

```bash
sudo cat /opt/rantai-agents/.env | grep -E "KB_|OCR_"
```

Expected: KB_EXTRACT_MINERU_BASE_URL points at gpu-box. No OCR_PROVIDER line.

- [ ] **Step 3: Smoke end-to-end**

Bring up the full stack. Upload a PDF, confirm extraction works (MinerU is hit remotely), enable rerank in the UI, confirm rerank is hit remotely.

---

## Task 28: Final commit — PR description file

**Files:**
- Create: `docs/pr-descriptions/installer-v2.md`

- [ ] **Step 1: Draft the PR body**

```markdown
# Installer v2 — Profile-aware with sidecar support

## Why

The installer was last updated 2026-04-01 and drifted from the platform:

- Stale `.env` template wrote `OCR_PROVIDER=ollama` / `OCR_MODEL=glm-ocr` which the app no longer reads. Did not write any `KB_*` keys.
- No awareness of the MinerU or rerank GPU sidecars — operators had to hand-install those plus hand-edit `.env`.
- Single-host assumed; no story for cross-machine deployment (app server + GPU box).

## What this adds

- **InstallProfile axis** — AppOnly / SidecarOnly / AllInOne, orthogonal to InstallMode.
- **`.env` template overhaul** — all current `KB_EXTRACT_*`, `KB_EMBEDDING_*`, `KB_RERANK_*`, `KB_HYBRID_BM25_*`, `KB_CONTEXTUAL_RETRIEVAL_*`, `KB_QUERY_EXPANSION_*` keys. Legacy OCR_* removed.
- **Profile picker UI** — new `Screen::ProfileSelect` between Welcome and ModeSelect.
- **Profile-aware config screen** — SidecarOnly hides DB/auth, AppOnly asks for sidecar URLs, AllInOne shows everything.
- **`Phase::SidecarInstall`** — new phase between Services and Verification. Runs venv creation + pip install + HF model pre-download + systemd unit install.
- **Preflight GPU + Python check** — only runs when profile includes sidecars.
- **Verify `/health`** — confirms both sidecars respond after install.
- **Complete screen** — prints paste-ready `KB_*` URL lines for cross-machine hand-off.

## Benchmark context

Default rerank model is `nvidia/llama-nemotron-rerank-1b-v2` based on the 2026-04-24 bench at `docs/artifact-plans/reranker-bench-2026-04-24.md`: within 1 pt of Cohere v4-pro on hit@1, 2.6× faster, $0/query.

## Tests

- 10 unit / integration tests added (`installer/tests/profile_skip.rs`, `env_template.rs`, `sidecar_units.rs`).
- Manual E2E: SidecarOnly on a GPU box + AppOnly on an app server pointing at it — both flows verified.
```

- [ ] **Step 2: Open the PR**

```bash
cd /home/shiro/rantai/RantAI-Agents
gh pr create \
  --title "feat(installer): profile-aware install with sidecar support" \
  --body-file docs/pr-descriptions/installer-v2.md \
  --base main \
  --head feat/installer-v2
```

- [ ] **Step 3: Return PR URL to the user and stop**

---

## Self-Review Notes (after writing)

Ran the three checks from the skill against this plan:

**1. Spec coverage.** User's spec was: "best installer possible", "interactive, better UX", "can install only the LLM needed (for local MinerU/rerank) as side (can install LLM needed only if it's on separate machine)".

| Requirement | Task |
|-------------|------|
| Interactive installation | Existing TUI + new ProfileSelect screen (Tasks 8–11) |
| Better UX | Profile-aware config fields (Task 12), validation with clear errors (Task 13), post-install summary with paste-ready URLs (Task 23) |
| Install only MinerU + rerank (sidecar-only mode) | `InstallProfile::SidecarOnly` (Task 1), phase skip logic (Task 3), SidecarInstall phase (Task 21) |
| Works on separate machine | AppOnly profile + URL config fields + preflight guard (Tasks 1, 12, 21) |
| Fix the stale .env | Tasks 5–7 |
| Keep existing modes working | Profile is orthogonal to Mode; AllInOne preserves current behavior (Task 3) |

All mapped.

**2. Placeholders.** Scanned for "TBD", "TODO", "appropriate", "similar to Task N", etc. Two soft spots:
- Task 4 says "if nothing changed, skip commit" — that's fine, explicit instruction to no-op.
- Task 14 says "Replace `push(...)` with the actual pattern the file uses" — that's a legitimate ask (I haven't read the file line-by-line). Acceptable because the surrounding context tells the engineer where to look.

No blocking placeholders.

**3. Type consistency.** Cross-checked: `InstallProfile::{AppOnly,SidecarOnly,AllInOne}` used identically throughout. `SidecarConfig::{mineru_base_url, rerank_base_url, rerank_provider, rerank_model, gpu_device_id, python_venv_dir, hf_cache_dir, mineru_port, rerank_port, mineru_enabled, rerank_enabled, rerank_api_key}` — all field names match across Tasks 2, 5, 12, 16–22. `RerankProvider::{Openrouter, Vllm, Cohere}` with `as_str()` returning `"openrouter"`/`"vllm"`/`"cohere"` matches `KB_RERANK_PROVIDER` values wired in the existing `rerankers/index.ts`. `Phase::SidecarInstall` added in Task 3 used consistently in Tasks 21–22.

Plan looks self-consistent.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-24-installer-v2.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
