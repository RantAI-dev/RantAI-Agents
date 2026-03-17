# Live Config API & Auto MCP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable RantaiClaw to accept live config changes via HTTP API (channels, MCP servers, model, tools, agent) and auto-start MCP servers when dashboard integrations are connected.

**Architecture:** RantaiClaw gains `/config/*` PATCH endpoints on its existing gateway. A `ChannelRegistry` manages per-channel lifecycle with `CancellationToken` shutdown. An `McpRegistry` manages stdio-based MCP server processes. The platform maps dashboard integrations to MCP configs and pushes them to running containers via HTTP.

**Tech Stack:** Rust (tokio, axum, serde, tokio_util::CancellationToken), TypeScript (Next.js API routes), Docker (npm package pre-caching)

**Spec:** `docs/superpowers/specs/2026-03-16-live-config-api-auto-mcp-design.md`

---

## File Structure

### Rust (RantaiClaw — `packages/rantaiclaw/`)

| File | Action | Responsibility |
|---|---|---|
| `src/config/schema.rs` | Modify | Add `McpServerConfig` struct, `mcp_servers` field to `Config` |
| `src/config/runtime.rs` | Create | Runtime config persistence (`config.runtime.toml` read/write/merge) |
| `src/config/mod.rs` | Modify | Re-export `runtime` module |
| `src/channels/traits.rs` | Modify | Add `CancellationToken` parameter to `Channel::listen()` |
| `src/channels/registry.rs` | Create | `ChannelRegistry` with add/remove/update/list operations |
| `src/channels/mod.rs` | Modify | Re-export registry, update `start_channels` to use registry, update all channel `listen()` implementations |
| `src/mcp/mod.rs` | Create | `McpRegistry` with add/remove/update/list, process supervision |
| `src/mcp/handle.rs` | Create | `McpHandle` struct, stdio transport, tool registration |
| `src/lib.rs` | Modify | Add `pub mod mcp` |
| `src/gateway/mod.rs` | Modify | Replace `Mutex<Config>` with `RwLock<Config>`, add watch channels, register `/config/*` routes, increase body limit for config endpoints |
| `src/gateway/config_api.rs` | Create | All `/config/*` handler functions |
| `Cargo.toml` | Modify | Add `tokio-util` (CancellationToken) dependency |

### TypeScript (Platform — project root)

| File | Action | Responsibility |
|---|---|---|
| `lib/digital-employee/mcp-mapping.ts` | Create | Map integration ID + credentials → `McpServerConfig` |
| `lib/digital-employee/config-push.ts` | Create | Push config changes to running containers via HTTP |
| `app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/route.ts` | Modify | Call `configPush` after integration save/delete |

### Docker

| File | Action | Responsibility |
|---|---|---|
| `docker/employee/Dockerfile` | Modify | Pre-cache official MCP npm packages at build time |

---

## Chunk 1: Rust Foundation — Config Schema, Runtime Persistence, Concurrency

### Task 1: Add `McpServerConfig` to config schema

**Files:**
- Modify: `packages/rantaiclaw/src/config/schema.rs:56-198` (Config struct area)

- [ ] **Step 1: Add McpServerConfig struct**

Add after existing config structs (before the `Config` struct):

```rust
/// MCP server configuration for stdio-based servers.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct McpServerConfig {
    /// Command to spawn (e.g., "npx", "node")
    pub command: String,
    /// Arguments (e.g., ["-y", "@modelcontextprotocol/server-github"])
    #[serde(default)]
    pub args: Vec<String>,
    /// Environment variables passed to the process
    #[serde(default)]
    pub env: HashMap<String, String>,
}
```

- [ ] **Step 2: Add `mcp_servers` field to Config struct**

Add to the `Config` struct alongside existing fields:

```rust
/// MCP servers managed by the runtime.
#[serde(default)]
pub mcp_servers: HashMap<String, McpServerConfig>,
```

- [ ] **Step 3: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -20`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/rantaiclaw/src/config/schema.rs
git commit -m "feat(config): add McpServerConfig struct and mcp_servers field"
```

---

### Task 2: Runtime config persistence (`config.runtime.toml`)

**Files:**
- Create: `packages/rantaiclaw/src/config/runtime.rs`
- Modify: `packages/rantaiclaw/src/config/mod.rs`

- [ ] **Step 1: Create runtime.rs with read/write/merge functions**

```rust
//! Runtime config overrides — persisted to config.runtime.toml alongside the base config.toml.
//!
//! Merge strategy: runtime overrides win for any key present in both files.
//! This preserves user comments and manual edits in the base config.

use std::path::{Path, PathBuf};
use anyhow::{Context, Result};
use toml::Value as TomlValue;

/// Derive runtime config path from base config path.
/// `config.toml` → `config.runtime.toml`
pub fn runtime_path(base_config_path: &Path) -> PathBuf {
    let stem = base_config_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy();
    let ext = base_config_path
        .extension()
        .unwrap_or_default()
        .to_string_lossy();
    base_config_path.with_file_name(format!("{}.runtime.{}", stem, ext))
}

/// Read runtime overrides from disk. Returns empty table if file doesn't exist.
pub fn read_runtime_overrides(base_config_path: &Path) -> Result<TomlValue> {
    let path = runtime_path(base_config_path);
    if !path.exists() {
        return Ok(TomlValue::Table(toml::map::Map::new()));
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read {}", path.display()))?;
    let value: TomlValue = content.parse()
        .with_context(|| format!("Failed to parse {}", path.display()))?;
    Ok(value)
}

/// Write a specific section to config.runtime.toml.
/// Reads existing overrides, merges the new section, writes back.
pub fn write_runtime_section(base_config_path: &Path, section: &str, value: TomlValue) -> Result<()> {
    let path = runtime_path(base_config_path);
    let mut overrides = read_runtime_overrides(base_config_path)?;

    if let TomlValue::Table(ref mut table) = overrides {
        table.insert(section.to_string(), value);
    }

    let content = toml::to_string_pretty(&overrides)
        .context("Failed to serialize runtime overrides")?;
    std::fs::write(&path, content)
        .with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

/// Remove a section from config.runtime.toml.
pub fn remove_runtime_section(base_config_path: &Path, section: &str) -> Result<()> {
    let path = runtime_path(base_config_path);
    if !path.exists() {
        return Ok(());
    }
    let mut overrides = read_runtime_overrides(base_config_path)?;
    if let TomlValue::Table(ref mut table) = overrides {
        table.remove(section);
    }
    let content = toml::to_string_pretty(&overrides)
        .context("Failed to serialize runtime overrides")?;
    std::fs::write(&path, content)
        .with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

/// Deep-merge two TOML values. `override_val` wins for any key present in both.
pub fn deep_merge(base: &mut TomlValue, override_val: &TomlValue) {
    match (base, override_val) {
        (TomlValue::Table(base_table), TomlValue::Table(override_table)) => {
            for (key, ov) in override_table {
                if let Some(bv) = base_table.get_mut(key) {
                    deep_merge(bv, ov);
                } else {
                    base_table.insert(key.clone(), ov.clone());
                }
            }
        }
        (base, override_val) => {
            *base = override_val.clone();
        }
    }
}

/// Load config with runtime overrides merged on top.
/// Called at startup: reads base config.toml, then merges config.runtime.toml.
pub fn load_with_runtime_overrides(base_config_path: &Path) -> Result<String> {
    let base_content = std::fs::read_to_string(base_config_path)
        .with_context(|| format!("Failed to read {}", base_config_path.display()))?;
    let mut base: TomlValue = base_content.parse()
        .with_context(|| format!("Failed to parse {}", base_config_path.display()))?;

    let overrides = read_runtime_overrides(base_config_path)?;
    deep_merge(&mut base, &overrides);

    toml::to_string_pretty(&base).context("Failed to serialize merged config")
}
```

- [ ] **Step 2: Re-export from config/mod.rs**

Add to `packages/rantaiclaw/src/config/mod.rs`:

```rust
pub mod runtime;
```

- [ ] **Step 3: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -20`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/rantaiclaw/src/config/runtime.rs packages/rantaiclaw/src/config/mod.rs
git commit -m "feat(config): add runtime config persistence (config.runtime.toml)"
```

---

### Task 3: Add `tokio-util` dependency for CancellationToken

**Files:**
- Modify: `packages/rantaiclaw/Cargo.toml`

- [ ] **Step 1: Add tokio-util dependency**

Add to `[dependencies]` in `Cargo.toml`:

```toml
tokio-util = { version = "0.7", features = ["sync"] }
```

Note: Check if `tokio-util` is already present — it may be, but might need the `sync` feature added.

- [ ] **Step 2: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -20`
Expected: Compiles, dependency resolved.

- [ ] **Step 3: Commit**

```bash
git add packages/rantaiclaw/Cargo.toml
git commit -m "chore: add tokio-util sync feature for CancellationToken"
```

---

### Task 4: Replace `Mutex<Config>` with `RwLock<Config>` in gateway

**Files:**
- Modify: `packages/rantaiclaw/src/gateway/mod.rs:309` (AppState struct)

- [ ] **Step 1: Change AppState config field type**

In `AppState` struct, change:

```rust
// Before:
config: Arc<Mutex<Config>>,

// After:
config: Arc<tokio::sync::RwLock<Config>>,
```

- [ ] **Step 2: Update all config access sites**

Search for `config.lock()` in `src/gateway/` and replace with `config.read().await` (for reads) or `config.write().await` (for mutations). The existing code only reads config, so all should become `.read().await`.

- [ ] **Step 3: Add watch channel to AppState**

Add to `AppState`:

```rust
/// Watch channel for broadcasting config changes to registries.
config_tx: tokio::sync::watch::Sender<Config>,
```

- [ ] **Step 4: Initialize watch channel in run_gateway**

In `run_gateway()` where `AppState` is constructed (~line 342-694), create the watch channel:

```rust
let (config_tx, _config_rx) = tokio::sync::watch::channel(config.clone());
```

Pass `config_tx` into `AppState`.

- [ ] **Step 5: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -20`
Expected: Compiles. Some warnings about unused `config_tx` are OK at this stage.

- [ ] **Step 6: Commit**

```bash
git add packages/rantaiclaw/src/gateway/mod.rs
git commit -m "refactor(gateway): replace Mutex<Config> with RwLock + watch channel"
```

---

## Chunk 2: Channel Registry — Per-Channel Lifecycle Management

### Task 5: Add CancellationToken to Channel::listen() trait

**Files:**
- Modify: `packages/rantaiclaw/src/channels/traits.rs:59-121`
- Modify: All channel implementations in `src/channels/mod.rs`

This is a **breaking trait change**. Every channel's `listen()` must accept the new parameter.

- [ ] **Step 1: Update Channel trait signature**

In `src/channels/traits.rs`, change `listen`:

```rust
// Before:
async fn listen(&self, tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> anyhow::Result<()>;

// After:
async fn listen(
    &self,
    tx: tokio::sync::mpsc::Sender<ChannelMessage>,
    cancel: tokio_util::sync::CancellationToken,
) -> anyhow::Result<()>;
```

Add import at top of file:

```rust
use tokio_util::sync::CancellationToken;
```

- [ ] **Step 2: Update all channel listen() implementations**

For each channel implementation in `src/channels/mod.rs` and feature-gated files, add the `cancel: CancellationToken` parameter to the `listen` method signature. For now, the parameter can be unused (`_cancel`) — channels will integrate cancellation checks in a later task.

Channels to update (search for `async fn listen` in `src/channels/`):
- `TelegramChannel`
- `DiscordChannel`
- `SlackChannel`
- `WhatsAppChannel`
- `WhatsAppWebChannel` (feature-gated)
- `MatrixChannel` (feature-gated)
- `LarkChannel` (feature-gated)
- `DingTalkChannel`
- `SignalChannel`
- `IrcChannel`
- `EmailChannel`
- `IMessageChannel`
- `LinqChannel`
- `MattermostChannel`
- `QQChannel`
- `NextcloudTalkChannel`
- `CliChannel`

- [ ] **Step 3: Update callers of listen()**

Search for `.listen(` calls in `src/channels/mod.rs` (the `start_channels` function, ~line 2525). Pass a `CancellationToken::new()` for now:

```rust
let cancel = CancellationToken::new();
channel.listen(tx, cancel).await
```

- [ ] **Step 4: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check --features whatsapp-web 2>&1 | head -30`
Expected: Compiles (warnings about unused `_cancel` are OK).

- [ ] **Step 5: Commit**

```bash
git add packages/rantaiclaw/src/channels/
git commit -m "feat(channels): add CancellationToken to Channel::listen() trait"
```

---

### Task 6: Implement ChannelRegistry

**Files:**
- Create: `packages/rantaiclaw/src/channels/registry.rs`
- Modify: `packages/rantaiclaw/src/channels/mod.rs` (re-export)

- [ ] **Step 1: Create registry.rs with ChannelRegistry struct**

```rust
//! Per-channel lifecycle management with graceful shutdown support.

use std::collections::HashMap;
use std::time::Duration;
use anyhow::{anyhow, Result};
use serde::{Serialize, Deserialize};
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn, error};

use crate::channels::traits::{Channel, ChannelMessage};

const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", content = "error")]
pub enum ChannelStatus {
    Running,
    Stopped,
    Error(String),
}

struct ChannelHandle {
    config: serde_json::Value,
    cancel: CancellationToken,
    task: JoinHandle<()>,
    status: ChannelStatus,
}

pub struct ChannelRegistry {
    channels: HashMap<String, ChannelHandle>,
    message_tx: mpsc::Sender<ChannelMessage>,
}

impl ChannelRegistry {
    pub fn new(message_tx: mpsc::Sender<ChannelMessage>) -> Self {
        Self {
            channels: HashMap::new(),
            message_tx,
        }
    }

    /// Add and start a new channel. The `spawn_fn` closure constructs the
    /// channel from config and returns a boxed Channel trait object.
    pub async fn add_channel<F, Fut>(
        &mut self,
        id: String,
        config: serde_json::Value,
        spawn_fn: F,
    ) -> Result<()>
    where
        F: FnOnce(serde_json::Value) -> Fut,
        Fut: std::future::Future<Output = Result<Box<dyn Channel + Send + Sync>>>,
    {
        if self.channels.contains_key(&id) {
            return Err(anyhow!("Channel '{}' already exists", id));
        }

        let channel = spawn_fn(config.clone()).await?;
        let cancel = CancellationToken::new();
        let tx = self.message_tx.clone();
        let cancel_clone = cancel.clone();
        let channel_id = id.clone();

        let task = tokio::spawn(async move {
            if let Err(e) = channel.listen(tx, cancel_clone).await {
                error!("Channel '{}' listen error: {}", channel_id, e);
            }
        });

        self.channels.insert(id.clone(), ChannelHandle {
            config,
            cancel,
            task,
            status: ChannelStatus::Running,
        });

        info!("Channel '{}' started", id);
        Ok(())
    }

    /// Gracefully stop and remove a channel.
    pub async fn remove_channel(&mut self, id: &str) -> Result<()> {
        let handle = self.channels.remove(id)
            .ok_or_else(|| anyhow!("Channel '{}' not found", id))?;

        handle.cancel.cancel();

        // Wait for graceful shutdown with timeout
        let result = tokio::time::timeout(SHUTDOWN_TIMEOUT, handle.task).await;
        match result {
            Ok(Ok(())) => info!("Channel '{}' stopped gracefully", id),
            Ok(Err(e)) => warn!("Channel '{}' task panicked: {}", id, e),
            Err(_) => {
                warn!("Channel '{}' did not stop within {}s, aborting", id, SHUTDOWN_TIMEOUT.as_secs());
                // Task is already dropped (moved into timeout), abort handled by drop
            }
        }

        Ok(())
    }

    /// Update a channel by removing and re-adding with new config.
    /// File-based sessions (e.g., WhatsApp Web at /root/.rantaiclaw/state/whatsapp-web/session.db)
    /// survive this restart because only the process is stopped/started, not the session directory.
    pub async fn update_channel<F, Fut>(
        &mut self,
        id: String,
        config: serde_json::Value,
        spawn_fn: F,
    ) -> Result<()>
    where
        F: FnOnce(serde_json::Value) -> Fut,
        Fut: std::future::Future<Output = Result<Box<dyn Channel + Send + Sync>>>,
    {
        // Check if config actually changed
        if let Some(existing) = self.channels.get(&id) {
            if existing.config == config {
                info!("Channel '{}' config unchanged, skipping update", id);
                return Ok(());
            }
        }

        // Remove existing (ignore error if not found — could be a new add)
        let _ = self.remove_channel(&id).await;
        self.add_channel(id, config, spawn_fn).await
    }

    /// List all channels and their statuses.
    pub fn list_channels(&self) -> HashMap<String, ChannelStatus> {
        self.channels.iter()
            .map(|(id, handle)| (id.clone(), handle.status.clone()))
            .collect()
    }

    /// Check if a channel exists.
    pub fn has_channel(&self, id: &str) -> bool {
        self.channels.contains_key(id)
    }

    /// Get the config for a channel.
    pub fn get_config(&self, id: &str) -> Option<&serde_json::Value> {
        self.channels.get(id).map(|h| &h.config)
    }

    /// Shut down all channels.
    pub async fn shutdown_all(&mut self) {
        let ids: Vec<String> = self.channels.keys().cloned().collect();
        for id in ids {
            if let Err(e) = self.remove_channel(&id).await {
                warn!("Error shutting down channel '{}': {}", id, e);
            }
        }
    }
}
```

- [ ] **Step 2: Re-export from channels/mod.rs**

Add to `src/channels/mod.rs`:

```rust
pub mod registry;
pub use registry::{ChannelRegistry, ChannelStatus};
```

- [ ] **Step 3: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -20`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add packages/rantaiclaw/src/channels/registry.rs packages/rantaiclaw/src/channels/mod.rs
git commit -m "feat(channels): add ChannelRegistry for per-channel lifecycle management"
```

---

### Task 7: Add cancellation checks to key channels

**Files:**
- Modify: Channel implementations in `packages/rantaiclaw/src/channels/mod.rs` (Telegram, Discord, Slack, WhatsApp Web)

The goal is to make the main channels respond to the `CancellationToken` so they can be stopped individually. Focus on the 4 most-used channels.

- [ ] **Step 1: Add cancellation to Telegram polling loop**

Find Telegram's `listen()` implementation. Its polling loop likely does `loop { getUpdates; process; }`. Add a `tokio::select!` branch:

```rust
tokio::select! {
    _ = cancel.cancelled() => {
        info!("Telegram channel shutting down");
        break;
    }
    result = self.poll_updates() => {
        // existing processing
    }
}
```

- [ ] **Step 2: Add cancellation to Discord event loop**

Discord uses `serenity` or similar — its event loop blocks on a `select!` or similar. Add `cancel.cancelled()` as a select branch so the loop exits on cancellation.

- [ ] **Step 3: Add cancellation to Slack polling loop**

Same pattern as Telegram — add `cancel.cancelled()` select branch to the poll loop.

- [ ] **Step 4: Add cancellation to WhatsApp Web event loop**

WhatsApp Web uses `wa-rs` which has an event stream. Add `cancel.cancelled()` as a select branch.

- [ ] **Step 5: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check --features whatsapp-web 2>&1 | head -30`
Expected: Compiles.

- [ ] **Step 6: Commit**

```bash
git add packages/rantaiclaw/src/channels/
git commit -m "feat(channels): add CancellationToken checks to Telegram, Discord, Slack, WhatsApp Web"
```

---

## Chunk 3: MCP Registry — Process Supervision

### Task 8: Create MCP module with McpRegistry

**Files:**
- Create: `packages/rantaiclaw/src/mcp/mod.rs`
- Create: `packages/rantaiclaw/src/mcp/handle.rs`
- Create: `packages/rantaiclaw/src/mcp/supervisor.rs`
- Modify: `packages/rantaiclaw/src/lib.rs`

- [ ] **Step 1: Create handle.rs with McpHandle**

```rust
//! Individual MCP server process handle — manages lifecycle of a single stdio-based MCP server.

use std::collections::HashMap;
use std::process::Stdio;
use anyhow::{Context, Result};
use serde::{Serialize, Deserialize};
use tokio::process::{Child, Command};
use tracing::{info, error};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", content = "error")]
pub enum McpStatus {
    Running,
    Stopped,
    Error(String),
}

pub struct McpHandle {
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub process: Child,
    pub status: McpStatus,
    pub consecutive_failures: u32,
}

pub const MAX_CONSECUTIVE_FAILURES: u32 = 5;

impl McpHandle {
    /// Spawn a new MCP server process with stdio transport.
    pub async fn spawn(
        command: String,
        args: Vec<String>,
        env: HashMap<String, String>,
    ) -> Result<Self> {
        let process = Command::new(&command)
            .args(&args)
            .envs(&env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("Failed to spawn MCP server: {} {}", command, args.join(" ")))?;

        info!("MCP server spawned: {} {} (pid: {:?})", command, args.join(" "), process.id());

        Ok(Self {
            command,
            args,
            env,
            process,
            status: McpStatus::Running,
            consecutive_failures: 0,
        })
    }

    /// Respawn the process using the same command/args/env.
    pub async fn respawn(&mut self) -> Result<()> {
        let process = Command::new(&self.command)
            .args(&self.args)
            .envs(&self.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("Failed to respawn MCP server: {}", self.command))?;

        self.process = process;
        self.status = McpStatus::Running;
        self.consecutive_failures = 0;
        info!("MCP server respawned: {} (pid: {:?})", self.command, self.process.id());
        Ok(())
    }

    /// Kill the process.
    pub async fn kill(&mut self) -> Result<()> {
        self.process.kill().await.context("Failed to kill MCP server process")?;
        self.status = McpStatus::Stopped;
        Ok(())
    }

    /// Check if the process is still running.
    pub fn is_running(&mut self) -> bool {
        match self.process.try_wait() {
            Ok(None) => true,  // still running
            Ok(Some(_)) => false,  // exited
            Err(_) => false,
        }
    }

    /// Whether this server has exceeded the failure limit and should not be restarted.
    pub fn is_failed(&self) -> bool {
        self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES
    }

    /// Record a failure and return whether the server should be restarted.
    pub fn record_failure(&mut self) -> bool {
        self.consecutive_failures += 1;
        if self.is_failed() {
            self.status = McpStatus::Error(format!(
                "Exceeded {} consecutive failures", MAX_CONSECUTIVE_FAILURES
            ));
            error!("MCP server {} failed {} times, giving up", self.command, self.consecutive_failures);
            false
        } else {
            true
        }
    }

    /// Reset failure counter (called on successful restart).
    pub fn reset_failures(&mut self) {
        self.consecutive_failures = 0;
        self.status = McpStatus::Running;
    }
}
```

- [ ] **Step 2: Create supervisor.rs with background supervision loop**

This task spawns a background `tokio::spawn` that periodically checks if MCP server processes are still alive and restarts them with exponential backoff (1s → 2s → 4s → ... → 60s cap). After 5 consecutive failures, the server is marked as `Error` and not restarted.

```rust
//! MCP process supervisor — monitors server processes and restarts on crash.
//!
//! Exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s → 60s (cap).
//! After 5 consecutive failures, server is marked Error and not restarted.

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn, error};

use super::McpRegistry;

const SUPERVISOR_POLL_INTERVAL: Duration = Duration::from_secs(5);
const BACKOFF_BASE: Duration = Duration::from_secs(1);
const BACKOFF_CAP: Duration = Duration::from_secs(60);

/// Compute backoff delay: 1s * 2^(failures-1), capped at 60s.
fn backoff_delay(consecutive_failures: u32) -> Duration {
    let delay = BACKOFF_BASE * 2u32.saturating_pow(consecutive_failures.saturating_sub(1));
    delay.min(BACKOFF_CAP)
}

/// Spawn a background supervisor task that monitors MCP server processes.
///
/// The supervisor checks every 5 seconds if any MCP server has exited.
/// If a server has exited unexpectedly:
/// 1. Record the failure (increment consecutive_failures)
/// 2. If under the failure limit (5), wait the backoff delay and respawn
/// 3. If at the failure limit, mark as Error and stop trying
///
/// Returns a JoinHandle for the supervisor task.
pub fn spawn_supervisor(
    registry: Arc<RwLock<McpRegistry>>,
    cancel: CancellationToken,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        info!("MCP supervisor started");
        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    info!("MCP supervisor shutting down");
                    break;
                }
                _ = tokio::time::sleep(SUPERVISOR_POLL_INTERVAL) => {
                    // Check each server
                    let mut registry = registry.write().await;
                    let server_ids: Vec<String> = registry.server_ids();

                    for id in server_ids {
                        if let Some(handle) = registry.get_server_mut(&id) {
                            // Skip servers that are intentionally stopped or permanently failed
                            if handle.status == super::handle::McpStatus::Stopped
                                || handle.is_failed()
                            {
                                continue;
                            }

                            // Check if process is still running
                            if !handle.is_running() {
                                warn!("MCP server '{}' exited unexpectedly", id);

                                // Record failure and check if we should restart
                                if handle.record_failure() {
                                    let delay = backoff_delay(handle.consecutive_failures);
                                    info!(
                                        "MCP server '{}' will restart in {:?} (attempt {}/5)",
                                        id, delay, handle.consecutive_failures
                                    );

                                    // Drop the lock during sleep to avoid blocking
                                    drop(registry);
                                    tokio::time::sleep(delay).await;

                                    // Re-acquire and respawn
                                    let mut registry = registry_ref.write().await;
                                    if let Some(handle) = registry.get_server_mut(&id) {
                                        match handle.respawn().await {
                                            Ok(()) => {
                                                info!("MCP server '{}' restarted successfully", id);
                                            }
                                            Err(e) => {
                                                error!("MCP server '{}' restart failed: {}", id, e);
                                            }
                                        }
                                    }
                                    // Don't check more servers this iteration
                                    break;
                                } else {
                                    error!("MCP server '{}' permanently failed after 5 attempts", id);
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}
```

**Important implementation note:** The supervisor needs access to the registry `Arc<RwLock<McpRegistry>>` — which is the same one stored in `AppState`. The `cancel` token allows clean shutdown. The implementer must handle the lock drop/re-acquire around the sleep carefully (the pseudocode above shows the pattern but may need adjustment for borrow checker satisfaction — likely by cloning the `Arc` and using it directly rather than `registry_ref`).

- [ ] **Step 3: Create mod.rs with McpRegistry**

```rust
//! MCP server registry — manages lifecycle of multiple stdio-based MCP server processes.
//!
//! Enforces a maximum of 10 concurrent servers per container.
//! Processes are supervised with exponential backoff restart on crash.

pub mod handle;
pub mod supervisor;

use std::collections::HashMap;
use anyhow::{anyhow, Result};
use serde::{Serialize, Deserialize};
use tracing::{info, warn};

pub use handle::{McpHandle, McpStatus};
use crate::config::schema::McpServerConfig;

const MAX_MCP_SERVERS: usize = 10;

pub struct McpRegistry {
    servers: HashMap<String, McpHandle>,
}

impl McpRegistry {
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
        }
    }

    /// Add and start a new MCP server.
    pub async fn add_server(&mut self, id: String, config: McpServerConfig) -> Result<()> {
        if self.servers.len() >= MAX_MCP_SERVERS {
            return Err(anyhow!("MCP server limit reached (max {})", MAX_MCP_SERVERS));
        }
        if self.servers.contains_key(&id) {
            return Err(anyhow!("MCP server '{}' already exists", id));
        }

        let handle = McpHandle::spawn(
            config.command,
            config.args,
            config.env,
        ).await?;

        // TODO: Connect to MCP server via stdio JSON-RPC, call tools/list,
        // and register returned tools with the agent's tool registry.
        // This requires implementing MCP client protocol (initialize → tools/list).
        // For now, the process is spawned and tools are available via the
        // MCP protocol but not yet surfaced to the agent's tool list.

        self.servers.insert(id.clone(), handle);
        info!("MCP server '{}' added and running", id);
        Ok(())
    }

    /// Stop and remove an MCP server.
    pub async fn remove_server(&mut self, id: &str) -> Result<()> {
        let mut handle = self.servers.remove(id)
            .ok_or_else(|| anyhow!("MCP server '{}' not found", id))?;
        // TODO: Unregister tools from agent's tool registry before killing.
        // In-flight tool calls will receive a "server disconnected" error.
        handle.kill().await?;
        info!("MCP server '{}' removed", id);
        Ok(())
    }

    /// Update an MCP server by removing and re-adding.
    pub async fn update_server(&mut self, id: String, config: McpServerConfig) -> Result<()> {
        let _ = self.remove_server(&id).await;
        self.add_server(id, config).await
    }

    /// List all servers and their statuses.
    pub fn list_servers(&self) -> HashMap<String, McpStatus> {
        self.servers.iter()
            .map(|(id, handle)| (id.clone(), handle.status.clone()))
            .collect()
    }

    /// Get all server IDs (for supervisor iteration).
    pub fn server_ids(&self) -> Vec<String> {
        self.servers.keys().cloned().collect()
    }

    /// Get mutable reference to a server handle (for supervisor).
    pub fn get_server_mut(&mut self, id: &str) -> Option<&mut McpHandle> {
        self.servers.get_mut(id)
    }

    /// Shut down all servers.
    pub async fn shutdown_all(&mut self) {
        let ids: Vec<String> = self.servers.keys().cloned().collect();
        for id in ids {
            if let Err(e) = self.remove_server(&id).await {
                warn!("Error shutting down MCP server '{}': {}", id, e);
            }
        }
    }

    /// Current server count.
    pub fn count(&self) -> usize {
        self.servers.len()
    }
}
```

- [ ] **Step 4: Add `pub mod mcp` to lib.rs**

In `packages/rantaiclaw/src/lib.rs`, add:

```rust
pub mod mcp;
```

- [ ] **Step 5: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -20`
Expected: Compiles.

- [ ] **Step 6: Commit**

```bash
git add packages/rantaiclaw/src/mcp/ packages/rantaiclaw/src/lib.rs
git commit -m "feat(mcp): add McpRegistry with process supervision and exponential backoff"
```

---

## Chunk 4: Config API — HTTP Endpoints

### Task 9: Create config API route handlers

**Files:**
- Create: `packages/rantaiclaw/src/gateway/config_api.rs`

- [ ] **Step 1: Create config_api.rs with all handler functions**

```rust
//! Config API route handlers for live configuration updates.
//!
//! Endpoints:
//! - GET  /config             — full running config
//! - GET  /config/channels    — channel status map
//! - GET  /config/mcp-servers — MCP server status map
//! - PATCH /config/channels    — add/update/remove channels
//! - PATCH /config/mcp-servers — add/update/remove MCP servers
//! - PATCH /config/model       — hot-swap model/provider/temperature
//! - PATCH /config/tools       — update tool permissions
//! - PATCH /config/agent       — update system prompt, workspace files

use std::collections::HashMap;
use std::sync::Arc;
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tracing::{info, error};

use crate::config::schema::McpServerConfig;
use crate::gateway::AppState;

#[derive(Serialize)]
pub struct ConfigResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub applied: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// GET /config — returns current running config
pub async fn get_config(
    State(state): State<Arc<AppState>>,
) -> (StatusCode, Json<JsonValue>) {
    let config = state.config.read().await;
    match serde_json::to_value(&*config) {
        Ok(v) => (StatusCode::OK, Json(v)),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Failed to serialize config: {}", e) })),
        ),
    }
}

/// GET /config/channels — returns channel status map
pub async fn get_channels_status(
    State(state): State<Arc<AppState>>,
) -> Json<ConfigResponse> {
    // Channel registry status will be accessed from AppState once integrated
    // For now, return empty — will be connected in Task 10
    Json(ConfigResponse {
        ok: true,
        applied: Some(serde_json::json!({})),
        errors: None,
        error: None,
    })
}

/// GET /config/mcp-servers — returns MCP server status map
pub async fn get_mcp_status(
    State(state): State<Arc<AppState>>,
) -> Json<ConfigResponse> {
    // MCP registry status will be accessed from AppState once integrated
    Json(ConfigResponse {
        ok: true,
        applied: Some(serde_json::json!({})),
        errors: None,
        error: None,
    })
}

/// PATCH /config/channels — add/update/remove channels
///
/// Body: `{ "telegram": {...}, "discord": null }` — null means remove.
pub async fn patch_channels(
    State(state): State<Arc<AppState>>,
    Json(body): Json<HashMap<String, Option<JsonValue>>>,
) -> (StatusCode, Json<ConfigResponse>) {
    let mut applied = HashMap::new();
    let mut errors = HashMap::new();

    // Delegate to ChannelRegistry — will be wired in Task 10.
    // Each operation that fails records the error; successful ones record in applied.
    // Feature-gated channels (e.g., whatsapp-web without --features whatsapp-web)
    // return: "Channel 'whatsapp-web' not available: binary compiled without whatsapp-web feature"
    {
        let mut registry = state.channel_registry.write().await;
        for (id, value) in &body {
            match value {
                None => {
                    match registry.remove_channel(id).await {
                        Ok(()) => { applied.insert(id.clone(), serde_json::json!("removed")); }
                        Err(e) => { errors.insert(id.clone(), e.to_string()); }
                    }
                }
                Some(config) => {
                    // The spawn_fn closure handles feature-gate checks and returns
                    // descriptive errors for unsupported channel types.
                    let channel_config = config.clone();
                    match registry.update_channel(id.clone(), channel_config, |cfg| {
                        build_channel_from_config(id.clone(), cfg)
                    }).await {
                        Ok(()) => { applied.insert(id.clone(), serde_json::json!("updated")); }
                        Err(e) => { errors.insert(id.clone(), e.to_string()); }
                    }
                }
            }
        }
    }

    // Persist current registry state to config.runtime.toml
    // (reconstructed from registry, not from raw request body, since TOML doesn't support null)
    {
        let config = state.config.read().await;
        let registry = state.channel_registry.read().await;
        let mut channels_table = toml::map::Map::new();
        for (id, _status) in registry.list_channels() {
            if let Some(cfg) = registry.get_config(&id) {
                if let Ok(toml_val) = serde_json::from_value::<toml::Value>(cfg.clone()) {
                    channels_table.insert(id, toml_val);
                }
            }
        }
        if let Err(e) = crate::config::runtime::write_runtime_section(
            &config.config_path,
            "channels_config",
            toml::Value::Table(channels_table),
        ) {
            error!("Failed to persist channel config: {}", e);
        }
    }

    let status = if errors.is_empty() { StatusCode::OK } else { StatusCode::MULTI_STATUS };
    (status, Json(ConfigResponse {
        ok: errors.is_empty(),
        applied: Some(serde_json::to_value(applied).unwrap_or_default()),
        errors: if errors.is_empty() { None } else { Some(errors) },
        error: None,
    }))
}

/// PATCH /config/mcp-servers — add/update/remove MCP servers
///
/// Body: `{ "github": { "command": "npx", "args": [...], "env": {...} }, "notion": null }`
pub async fn patch_mcp_servers(
    State(state): State<Arc<AppState>>,
    Json(body): Json<HashMap<String, Option<McpServerConfig>>>,
) -> (StatusCode, Json<ConfigResponse>) {
    let mut applied = HashMap::new();
    let mut errors = HashMap::new();

    // Delegate to McpRegistry.
    {
        let mut registry = state.mcp_registry.write().await;
        for (id, value) in &body {
            match value {
                None => {
                    match registry.remove_server(id).await {
                        Ok(()) => { applied.insert(id.clone(), serde_json::json!("removed")); }
                        Err(e) => { errors.insert(id.clone(), e.to_string()); }
                    }
                }
                Some(config) => {
                    match registry.update_server(id.clone(), config.clone()).await {
                        Ok(()) => { applied.insert(id.clone(), serde_json::json!("updated")); }
                        Err(e) => { errors.insert(id.clone(), e.to_string()); }
                    }
                }
            }
        }
    }

    // Persist current MCP config to config.runtime.toml
    // Only persist successfully running servers (filter out null/removed entries)
    {
        let config = state.config.read().await;
        let mut updated_mcp = config.mcp_servers.clone();
        for (id, value) in &body {
            match value {
                None => { updated_mcp.remove(id.as_str()); }
                Some(cfg) => { updated_mcp.insert(id.clone(), cfg.clone()); }
            }
        }
        if let Ok(toml_val) = toml::Value::try_from(&updated_mcp) {
            if let Err(e) = crate::config::runtime::write_runtime_section(
                &config.config_path,
                "mcp_servers",
                toml_val,
            ) {
                error!("Failed to persist MCP server config: {}", e);
            }
        }
    }

    let status = if errors.is_empty() { StatusCode::OK } else { StatusCode::MULTI_STATUS };
    (status, Json(ConfigResponse {
        ok: errors.is_empty(),
        applied: Some(serde_json::to_value(applied).unwrap_or_default()),
        errors: if errors.is_empty() { None } else { Some(errors) },
        error: None,
    }))
}

#[derive(Deserialize)]
pub struct ModelPatch {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f64>,
}

/// PATCH /config/model — hot-swap provider/model/temperature
pub async fn patch_model(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ModelPatch>,
) -> Json<ConfigResponse> {
    let mut config = state.config.write().await;
    let mut applied = HashMap::new();

    if let Some(ref provider) = body.provider {
        config.default_provider = Some(provider.clone());
        applied.insert("provider".to_string(), serde_json::json!(provider));
    }
    if let Some(ref model) = body.model {
        config.default_model = Some(model.clone());
        applied.insert("model".to_string(), serde_json::json!(model));
    }
    if let Some(temp) = body.temperature {
        config.default_temperature = temp;
        applied.insert("temperature".to_string(), serde_json::json!(temp));
    }

    // Persist
    if let Err(e) = crate::config::runtime::write_runtime_section(
        &config.config_path,
        "model",
        toml::Value::try_from(&serde_json::json!({
            "default_provider": config.default_provider,
            "default_model": config.default_model,
            "default_temperature": config.default_temperature,
        })).unwrap_or(toml::Value::Table(toml::map::Map::new())),
    ) {
        error!("Failed to persist model config: {}", e);
    }

    // Notify watchers
    let _ = state.config_tx.send(config.clone());

    info!("Config API: model updated: {:?}", applied);
    Json(ConfigResponse {
        ok: true,
        applied: Some(serde_json::to_value(applied).unwrap_or_default()),
        errors: None,
        error: None,
    })
}

#[derive(Deserialize)]
pub struct ToolsPatch {
    pub allowed_tools: Option<Vec<String>>,
}

/// PATCH /config/tools — update tool permissions
pub async fn patch_tools(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ToolsPatch>,
) -> Json<ConfigResponse> {
    let mut config = state.config.write().await;
    let mut applied = HashMap::new();

    if let Some(ref tools) = body.allowed_tools {
        config.autonomy.auto_approve = tools.clone();
        applied.insert("allowed_tools".to_string(), serde_json::json!(tools));
    }

    // Persist to config.runtime.toml
    if let Err(e) = crate::config::runtime::write_runtime_section(
        &config.config_path,
        "autonomy",
        toml::Value::try_from(&serde_json::json!({
            "auto_approve": config.autonomy.auto_approve,
        })).unwrap_or(toml::Value::Table(toml::map::Map::new())),
    ) {
        error!("Failed to persist tools config: {}", e);
    }

    let _ = state.config_tx.send(config.clone());

    info!("Config API: tools updated");
    Json(ConfigResponse {
        ok: true,
        applied: Some(serde_json::to_value(applied).unwrap_or_default()),
        errors: None,
        error: None,
    })
}

#[derive(Deserialize)]
pub struct AgentPatch {
    pub system_prompt: Option<String>,
    pub workspace_files: Option<HashMap<String, String>>,
}

/// PATCH /config/agent — update system prompt, workspace files
pub async fn patch_agent(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AgentPatch>,
) -> Json<ConfigResponse> {
    let mut applied = HashMap::new();
    let mut errors = HashMap::new();

    if let Some(ref prompt) = body.system_prompt {
        // Persist system prompt to config.runtime.toml
        let config = state.config.read().await;
        if let Err(e) = crate::config::runtime::write_runtime_section(
            &config.config_path,
            "agent",
            toml::Value::try_from(&serde_json::json!({
                "system_prompt": prompt,
            })).unwrap_or(toml::Value::Table(toml::map::Map::new())),
        ) {
            error!("Failed to persist agent config: {}", e);
            errors.insert("system_prompt".to_string(), format!("persist failed: {}", e));
        } else {
            applied.insert("system_prompt".to_string(), serde_json::json!("updated"));
        }
        info!("Config API: system prompt updated ({} chars)", prompt.len());
    }

    if let Some(ref files) = body.workspace_files {
        let config = state.config.read().await;
        let workspace_dir = &config.workspace_dir;
        for (filename, content) in files {
            let path = workspace_dir.join(filename);
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match std::fs::write(&path, content) {
                Ok(_) => {
                    applied.insert(
                        format!("workspace_files.{}", filename),
                        serde_json::json!("written"),
                    );
                }
                Err(e) => {
                    errors.insert(
                        format!("workspace_files.{}", filename),
                        format!("write failed: {}", e),
                    );
                }
            }
        }
        info!("Config API: {} workspace files written", files.len());
    }

    Json(ConfigResponse {
        ok: errors.is_empty(),
        applied: Some(serde_json::to_value(applied).unwrap_or_default()),
        errors: if errors.is_empty() { None } else { Some(errors) },
        error: None,
    })
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -30`
Expected: Compiles. Some unused variable warnings are OK — handlers will be fully wired in next task.

- [ ] **Step 3: Commit**

```bash
git add packages/rantaiclaw/src/gateway/config_api.rs
git commit -m "feat(gateway): add config API route handlers"
```

---

### Task 10: Register config routes in gateway and wire registries to AppState

**Files:**
- Modify: `packages/rantaiclaw/src/gateway/mod.rs:650-679` (route registration area)

- [ ] **Step 1: Add registries to AppState**

Add to `AppState` struct:

```rust
/// Channel registry for per-channel lifecycle management.
pub channel_registry: Arc<tokio::sync::RwLock<ChannelRegistry>>,
/// MCP server registry.
pub mcp_registry: Arc<tokio::sync::RwLock<McpRegistry>>,
```

Add imports at top:

```rust
use crate::channels::registry::ChannelRegistry;
use crate::mcp::McpRegistry;
```

- [ ] **Step 2: Initialize registries and start MCP supervisor in run_gateway**

In `run_gateway()` where `AppState` is constructed:

```rust
let (msg_tx, _msg_rx) = mpsc::channel(256);
let channel_registry = Arc::new(tokio::sync::RwLock::new(ChannelRegistry::new(msg_tx)));
let mcp_registry = Arc::new(tokio::sync::RwLock::new(McpRegistry::new()));

// Start MCP process supervisor (monitors for crashes, restarts with backoff)
let supervisor_cancel = CancellationToken::new();
let _supervisor_handle = crate::mcp::supervisor::spawn_supervisor(
    mcp_registry.clone(),
    supervisor_cancel.clone(),
);
```

- [ ] **Step 3: Register config routes**

In the route builder (~line 650-679), add the config route group. These must use the 1MB body limit (vs 64KB default):

```rust
use axum::extract::DefaultBodyLimit;

// Config API routes (1MB body limit for /config/agent)
let config_routes = axum::Router::new()
    .route("/config", axum::routing::get(config_api::get_config))
    .route("/config/channels", axum::routing::get(config_api::get_channels_status)
        .patch(config_api::patch_channels))
    .route("/config/mcp-servers", axum::routing::get(config_api::get_mcp_status)
        .patch(config_api::patch_mcp_servers))
    .route("/config/model", axum::routing::patch(config_api::patch_model))
    .route("/config/tools", axum::routing::patch(config_api::patch_tools))
    .route("/config/agent", axum::routing::patch(config_api::patch_agent))
    .layer(DefaultBodyLimit::max(1_048_576)); // 1MB
```

Merge `config_routes` into the main router (after pairing guard middleware, since config endpoints use the same bearer token auth).

- [ ] **Step 4: Add module declaration**

In `src/gateway/mod.rs`, add:

```rust
pub mod config_api;
```

- [ ] **Step 5: Create `build_channel_from_config` factory function**

Add a factory function in `config_api.rs` (or a shared location) that constructs a channel from a JSON config. This function handles feature-gate checks:

```rust
/// Factory function for constructing channels from config JSON.
/// Returns descriptive errors for unsupported/feature-gated channel types.
async fn build_channel_from_config(
    channel_type: String,
    config: serde_json::Value,
) -> anyhow::Result<Box<dyn Channel + Send + Sync>> {
    match channel_type.as_str() {
        "telegram" => {
            let cfg: TelegramConfig = serde_json::from_value(config)?;
            Ok(Box::new(TelegramChannel::new(cfg)))
        }
        "discord" => {
            let cfg: DiscordConfig = serde_json::from_value(config)?;
            Ok(Box::new(DiscordChannel::new(cfg)))
        }
        "slack" => {
            let cfg: SlackConfig = serde_json::from_value(config)?;
            Ok(Box::new(SlackChannel::new(cfg)))
        }
        "whatsapp" => {
            let cfg: WhatsAppConfig = serde_json::from_value(config)?;
            Ok(Box::new(WhatsAppChannel::new(cfg)))
        }
        #[cfg(feature = "whatsapp-web")]
        "whatsapp-web" => {
            let cfg: WhatsAppWebConfig = serde_json::from_value(config)?;
            Ok(Box::new(WhatsAppWebChannel::new(cfg)))
        }
        #[cfg(not(feature = "whatsapp-web"))]
        "whatsapp-web" => {
            Err(anyhow::anyhow!(
                "Channel 'whatsapp-web' not available: binary compiled without whatsapp-web feature"
            ))
        }
        #[cfg(feature = "channel-matrix")]
        "matrix" => {
            let cfg: MatrixConfig = serde_json::from_value(config)?;
            Ok(Box::new(MatrixChannel::new(cfg)))
        }
        #[cfg(not(feature = "channel-matrix"))]
        "matrix" => {
            Err(anyhow::anyhow!(
                "Channel 'matrix' not available: binary compiled without channel-matrix feature"
            ))
        }
        other => Err(anyhow::anyhow!("Unknown channel type: '{}'", other)),
    }
}
```

Note: The exact config struct names and constructors should be adapted to match the actual channel implementations. The key pattern is the `#[cfg(feature)]` / `#[cfg(not(feature))]` pairs that return descriptive errors for missing features.

- [ ] **Step 6: Wire status endpoints to registries**

Update `get_channels_status` and `get_mcp_status` in `config_api.rs` to read from `state.channel_registry` and `state.mcp_registry`:

```rust
pub async fn get_channels_status(State(state): State<Arc<AppState>>) -> Json<ConfigResponse> {
    let registry = state.channel_registry.read().await;
    let statuses = registry.list_channels();
    Json(ConfigResponse {
        ok: true,
        applied: Some(serde_json::to_value(statuses).unwrap_or_default()),
        errors: None,
        error: None,
    })
}
```

- [ ] **Step 6: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -30`
Expected: Compiles.

- [ ] **Step 7: Commit**

```bash
git add packages/rantaiclaw/src/gateway/
git commit -m "feat(gateway): register /config/* routes and wire registries to AppState"
```

---

## Chunk 5: Platform Side — MCP Mapping & Config Push

### Task 11: Create MCP integration mapping

**Files:**
- Create: `lib/digital-employee/mcp-mapping.ts`

- [ ] **Step 1: Create mcp-mapping.ts**

```typescript
/**
 * Maps dashboard integration credentials to MCP server configs.
 *
 * Each mapping translates an integration ID + decrypted credentials
 * into the command/args/env needed to spawn an MCP server process
 * inside the employee container.
 */

export interface McpServerConfig {
  command: string
  args: string[]
  env: Record<string, string>
}

/**
 * Map an integration to its MCP server config.
 * Returns null if the integration doesn't have an MCP mapping
 * (e.g., channel integrations like Telegram/Discord).
 */
export function getMcpServerConfig(
  integrationId: string,
  credentials: Record<string, string>,
): McpServerConfig | null {
  switch (integrationId) {
    case "github":
      return {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: credentials.token || credentials.accessToken || "",
        },
      }

    case "slack":
      return {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        env: {
          SLACK_BOT_TOKEN: credentials.botToken || "",
          SLACK_TEAM_ID: credentials.teamId || "",
        },
      }

    case "notion":
      return {
        command: "npx",
        args: ["-y", "@notionhq/notion-mcp-server"],
        env: {
          OPENAPI_MCP_HEADERS: JSON.stringify({
            Authorization: `Bearer ${credentials.token || ""}`,
            "Notion-Version": "2022-06-28",
          }),
        },
      }

    case "linear":
      return {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-linear"],
        env: {
          LINEAR_API_KEY: credentials.apiKey || "",
        },
      }

    case "smtp":
      return {
        command: "node",
        args: ["/opt/mcp-servers/smtp/index.js"],
        env: {
          SMTP_HOST: credentials.host || "",
          SMTP_PORT: credentials.port || "587",
          SMTP_USER: credentials.user || credentials.username || "",
          SMTP_PASS: credentials.pass || credentials.password || "",
          SMTP_FROM: credentials.from || credentials.fromEmail || "",
        },
      }

    case "custom-api":
      return {
        command: "node",
        args: ["/opt/mcp-servers/custom-api/index.js"],
        env: {
          BASE_URL: credentials.baseUrl || "",
          API_KEY: credentials.apiKey || "",
          CUSTOM_HEADERS: credentials.headers || "{}",
        },
      }

    case "custom-mcp":
      return {
        command: credentials.command || "npx",
        args: (credentials.args || "").split(" ").filter(Boolean),
        env: credentials.env ? JSON.parse(credentials.env) : {},
      }

    default:
      // Channel integrations (telegram, discord, whatsapp, etc.) don't use MCP
      return null
  }
}

/** Integration IDs that have MCP server mappings. */
export const MCP_INTEGRATION_IDS = [
  "github",
  "slack",
  "notion",
  "linear",
  "smtp",
  "custom-api",
  "custom-mcp",
] as const

/** Check if an integration uses MCP (vs. channel). */
export function isMcpIntegration(integrationId: string): boolean {
  return (MCP_INTEGRATION_IDS as readonly string[]).includes(integrationId)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/digital-employee/mcp-mapping.ts
git commit -m "feat: add MCP integration mapping (integration → MCP server config)"
```

---

### Task 12: Create config push utility

**Files:**
- Create: `lib/digital-employee/config-push.ts`

- [ ] **Step 1: Create config-push.ts**

```typescript
/**
 * Pushes config changes to a running employee container via the Config API.
 *
 * If the container isn't running, the push silently fails — the agent-runner
 * will pick up integrations at next startup via EmployeePackage.
 */

import { prisma } from "@/lib/prisma"
import { getMcpServerConfig, isMcpIntegration } from "./mcp-mapping"

interface PushResult {
  success: boolean
  applied?: Record<string, unknown>
  error?: string
}

/**
 * Look up the running container's gateway URL for an employee.
 * Returns null if the container isn't running.
 */
async function getContainerUrl(employeeId: string): Promise<string | null> {
  const employee = await prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: {
      containerPort: true,
      containerHost: true,
      runtimeToken: true,
      status: true,
    },
  })

  if (!employee || employee.status !== "running" || !employee.containerPort) {
    return null
  }

  const host = employee.containerHost || "localhost"
  return `http://${host}:${employee.containerPort}`
}

/**
 * Get the runtime auth token for an employee's container.
 */
async function getRuntimeToken(employeeId: string): Promise<string | null> {
  const employee = await prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { runtimeToken: true },
  })
  return employee?.runtimeToken || null
}

/**
 * Send a PATCH request to the container's config API.
 */
async function patchConfig(
  employeeId: string,
  endpoint: string,
  body: unknown,
): Promise<PushResult> {
  try {
    const url = await getContainerUrl(employeeId)
    if (!url) {
      return { success: false, error: "Container not running" }
    }

    const token = await getRuntimeToken(employeeId)
    if (!token) {
      return { success: false, error: "No runtime token" }
    }

    const res = await fetch(`${url}${endpoint}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json()
    return {
      success: res.ok && data.ok !== false,
      applied: data.applied,
      error: data.error || (res.ok ? undefined : `HTTP ${res.status}`),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config push failed"
    return { success: false, error: message }
  }
}

/**
 * Push an MCP server config to a running container.
 * Called after a tool integration (GitHub, Notion, etc.) is saved.
 */
export async function pushMcpServer(
  employeeId: string,
  integrationId: string,
  credentials: Record<string, string>,
): Promise<PushResult> {
  const mcpConfig = getMcpServerConfig(integrationId, credentials)
  if (!mcpConfig) {
    return { success: false, error: `No MCP mapping for '${integrationId}'` }
  }

  return patchConfig(employeeId, "/config/mcp-servers", {
    [integrationId]: mcpConfig,
  })
}

/**
 * Remove an MCP server from a running container.
 * Called after a tool integration is deleted.
 */
export async function removeMcpServer(
  employeeId: string,
  integrationId: string,
): Promise<PushResult> {
  return patchConfig(employeeId, "/config/mcp-servers", {
    [integrationId]: null,
  })
}

/**
 * Push a channel config to a running container.
 * Called after a channel integration (Telegram, Discord, etc.) is saved.
 */
export async function pushChannel(
  employeeId: string,
  channelId: string,
  config: Record<string, unknown>,
): Promise<PushResult> {
  return patchConfig(employeeId, "/config/channels", {
    [channelId]: config,
  })
}

/**
 * Remove a channel from a running container.
 * Called after a channel integration is deleted.
 */
export async function removeChannel(
  employeeId: string,
  channelId: string,
): Promise<PushResult> {
  return patchConfig(employeeId, "/config/channels", {
    [channelId]: null,
  })
}

/**
 * Push model/provider config to a running container.
 */
export async function pushModel(
  employeeId: string,
  model: { provider?: string; model?: string; temperature?: number },
): Promise<PushResult> {
  return patchConfig(employeeId, "/config/model", model)
}

/**
 * Determine whether an integration change should push to MCP or channel endpoint,
 * and execute the push. This is the main entry point called from integration API routes.
 */
export async function pushIntegration(
  employeeId: string,
  integrationId: string,
  credentials: Record<string, string>,
): Promise<PushResult> {
  if (isMcpIntegration(integrationId)) {
    return pushMcpServer(employeeId, integrationId, credentials)
  }
  // Channel integrations need their config mapped to RantaiClaw format
  // This reuses the same mapping logic as agent-runner
  return pushChannel(employeeId, integrationId, credentials)
}

/**
 * Remove an integration from a running container (MCP or channel).
 */
export async function removeIntegration(
  employeeId: string,
  integrationId: string,
): Promise<PushResult> {
  if (isMcpIntegration(integrationId)) {
    return removeMcpServer(employeeId, integrationId)
  }
  return removeChannel(employeeId, integrationId)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/digital-employee/config-push.ts
git commit -m "feat: add config-push utility for live config updates to running containers"
```

---

### Task 13: Hook config push into integration API routes

**Files:**
- Modify: `app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/route.ts`

- [ ] **Step 1: Read the current integration save/delete route**

Read the file to understand where to add the config push call.

- [ ] **Step 2: Add config push after successful save**

After the existing `prisma.employeeIntegration.upsert()` or `update()` call that saves credentials, add:

```typescript
import { pushIntegration, removeIntegration } from "@/lib/digital-employee/config-push"
```

In the PUT/POST handler, after successful credential save:

```typescript
// Push to running container (best-effort — fails silently if container not running)
const pushResult = await pushIntegration(id, integrationId, creds)
if (pushResult.success) {
  console.log(`[Config Push] ${integrationId} pushed to employee ${id}`)
}
```

- [ ] **Step 3: Add config push after successful delete**

In the DELETE handler, after successful credential removal:

```typescript
const pushResult = await removeIntegration(id, integrationId)
if (pushResult.success) {
  console.log(`[Config Push] ${integrationId} removed from employee ${id}`)
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/route.ts
git commit -m "feat: hook config push into integration save/delete API routes"
```

---

## Chunk 6: Docker & Agent Runner

### Task 14: Pre-cache MCP npm packages in Docker image

**Files:**
- Modify: `docker/employee/Dockerfile`

- [ ] **Step 1: Add npm package pre-caching step**

After the Bun/Node.js installation and before the final `COPY` commands, add:

```dockerfile
# Pre-cache official MCP server packages for fast startup
RUN npx -y @modelcontextprotocol/server-github --help 2>/dev/null || true && \
    npx -y @modelcontextprotocol/server-slack --help 2>/dev/null || true && \
    npx -y @notionhq/notion-mcp-server --help 2>/dev/null || true && \
    npx -y @modelcontextprotocol/server-linear --help 2>/dev/null || true
```

This downloads and caches the packages so `npx -y` at runtime finds them locally.

- [ ] **Step 2: Create placeholder directory for custom MCP wrappers**

```dockerfile
# Custom MCP server wrappers (SMTP, Custom API)
RUN mkdir -p /opt/mcp-servers/smtp /opt/mcp-servers/custom-api
```

- [ ] **Step 3: Commit**

```bash
git add docker/employee/Dockerfile
git commit -m "chore(docker): pre-cache official MCP npm packages for fast startup"
```

---

### Task 15: Update agent-runner to emit `[mcp_servers]` config from package

**Files:**
- Modify: `docker/employee/agent-runner/index.js`

- [ ] **Step 1: Read agent-runner to find the config generation section**

Understand where `[channels_config]` is emitted (~line 435-508) so we can add `[mcp_servers]` similarly.

- [ ] **Step 2: Add MCP server config generation**

After the channel config section, add MCP server config from the package. This requires the package-generator to include MCP integrations (Task 16).

In `gatewayMode()`, after channel config block (~line 507):

```javascript
// ─── MCP Servers ───
if (pkg.mcpIntegrations && pkg.mcpIntegrations.length > 0) {
  for (const mcp of pkg.mcpIntegrations) {
    configLines.push(`\n[mcp_servers.${mcp.serverId}]`)
    configLines.push(`command = "${mcp.command}"`)
    configLines.push(`args = [${mcp.args.map(a => `"${a}"`).join(", ")}]`)
    if (mcp.env && Object.keys(mcp.env).length > 0) {
      configLines.push(`\n[mcp_servers.${mcp.serverId}.env]`)
      for (const [key, value] of Object.entries(mcp.env)) {
        configLines.push(`${key} = "${value}"`)
      }
    }
  }
  console.log(`[Gateway] Added ${pkg.mcpIntegrations.length} MCP server config(s)`)
}
```

Apply the same logic in `groupGatewayMode()`.

- [ ] **Step 3: Commit**

```bash
git add docker/employee/agent-runner/index.js
git commit -m "feat(agent-runner): emit [mcp_servers] config from package MCP integrations"
```

---

### Task 16: Update package-generator to include MCP integrations

**Files:**
- Modify: `lib/digital-employee/types.ts`
- Modify: `lib/digital-employee/package-generator.ts`

- [ ] **Step 1: Add mcpIntegrations to EmployeePackage type**

In `lib/digital-employee/types.ts`, add to the `EmployeePackage` interface:

```typescript
mcpIntegrations?: Array<{
  serverId: string             // "github" | "notion" | "linear" | etc.
  command: string              // e.g. "npx"
  args: string[]               // e.g. ["-y", "@modelcontextprotocol/server-github"]
  env: Record<string, string>  // e.g. { GITHUB_PERSONAL_ACCESS_TOKEN: "..." }
}>
```

- [ ] **Step 2: Generate MCP integrations in package-generator**

In `lib/digital-employee/package-generator.ts`, after the `channelIntegrations` block:

```typescript
import { getMcpServerConfig, MCP_INTEGRATION_IDS } from "./mcp-mapping"

// Fetch MCP-type integrations
const mcpRows = await prisma.employeeIntegration.findMany({
  where: {
    digitalEmployeeId: id,
    integrationId: { in: [...MCP_INTEGRATION_IDS] },
    status: "connected",
  },
})

const mcpIntegrations = mcpRows
  .map((row) => {
    const creds = decryptCredential(row.encryptedData!) as Record<string, string>
    const config = getMcpServerConfig(row.integrationId, creds)
    if (!config) return null
    return {
      serverId: row.integrationId,
      ...config,
    }
  })
  .filter(Boolean)
```

Add `mcpIntegrations` to the returned package object.

- [ ] **Step 3: Commit**

```bash
git add lib/digital-employee/types.ts lib/digital-employee/package-generator.ts
git commit -m "feat: include MCP integrations in EmployeePackage for bootstrap"
```

---

## Chunk 7: Integration Wiring & Testing

### Task 17: Wire ChannelRegistry into gateway daemon mode

**Files:**
- Modify: `packages/rantaiclaw/src/channels/mod.rs` (~line 2525, `start_channels` function)

- [ ] **Step 1: Refactor start_channels to use ChannelRegistry**

The existing `start_channels` function starts all channels monolithically. Refactor it to:

1. Create a `ChannelRegistry` with the shared message `mpsc::Sender`
2. For each configured channel in `channels_config`, call `registry.add_channel()` with a closure that constructs the channel
3. Store the registry in a location accessible to the config API (either pass it in or return it)

This is a significant refactor — the existing function is ~150 lines. The key change is moving from "start all, wait for all" to "add each to registry individually."

- [ ] **Step 2: Verify existing channel functionality still works**

Build and test with an existing config that has channels. The behavior should be identical — channels start the same way, just managed by the registry now.

Run: `cd packages/rantaiclaw && cargo build --release --features whatsapp-web 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/rantaiclaw/src/channels/
git commit -m "refactor(channels): wire start_channels to use ChannelRegistry"
```

---

### Task 18: Wire McpRegistry into gateway startup

**Files:**
- Modify: `packages/rantaiclaw/src/gateway/mod.rs`

- [ ] **Step 1: Start MCP servers from config at gateway startup**

In `run_gateway()`, after constructing `AppState`, iterate `config.mcp_servers` and add each to `mcp_registry`:

```rust
// Start configured MCP servers
{
    let mut registry = mcp_registry.write().await;
    for (id, mcp_config) in &config.mcp_servers {
        if let Err(e) = registry.add_server(id.clone(), mcp_config.clone()).await {
            tracing::error!("Failed to start MCP server '{}': {}", id, e);
        }
    }
}
```

- [ ] **Step 2: Verify config API handlers use registries**

The handler implementations in `config_api.rs` (Task 9) already delegate to `state.channel_registry` and `state.mcp_registry`. Verify the code compiles and the registry calls work end-to-end by checking that `patch_channels` calls `registry.update_channel()` / `registry.remove_channel()` and `patch_mcp_servers` calls `registry.update_server()` / `registry.remove_server()`.

- [ ] **Step 3: Verify compilation**

Run: `cd packages/rantaiclaw && cargo check 2>&1 | head -20`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add packages/rantaiclaw/src/gateway/
git commit -m "feat(gateway): wire MCP and channel registries into startup and config API handlers"
```

---

### Task 19: Build and smoke test

**Files:** None new — this is a verification task.

- [ ] **Step 1: Build the full Docker image**

```bash
docker build -f docker/employee/Dockerfile -t rantai/employee:latest .
```

Expected: Builds successfully.

- [ ] **Step 2: Verify config API endpoints respond**

Start a container and test:

```bash
# Start container
docker run -d --name test-employee -p 8080:8080 rantai/employee:latest

# Wait for startup
sleep 5

# Test GET /config (will fail auth, that's OK — we're testing route registration)
curl -s http://localhost:8080/config | head -5

# Test with auth token (get from container logs)
docker logs test-employee 2>&1 | grep -i "pair\|token"

# Cleanup
docker rm -f test-employee
```

- [ ] **Step 3: Verify MCP pre-cached packages**

```bash
docker run --rm rantai/employee:latest ls -la /root/.npm/_npx/ 2>/dev/null || echo "Check npx cache location"
```

- [ ] **Step 4: Commit any fixes discovered during smoke test**

```bash
git add -A
git commit -m "fix: address issues found during smoke test"
```

---

### Task 20: Update integration test route to support config push feedback

**Files:**
- Modify: `app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/test/route.ts`

- [ ] **Step 1: Add config push attempt after successful test**

For each integration test that succeeds (status = "connected"), attempt a config push so the running container picks up the integration immediately:

```typescript
import { pushIntegration } from "@/lib/digital-employee/config-push"

// After marking status as "connected":
const pushResult = await pushIntegration(id, integrationId, creds)
// Log but don't fail the test if push fails (container may not be running)
if (pushResult.success) {
  console.log(`[Test] Config pushed to running container for ${integrationId}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/test/route.ts
git commit -m "feat: attempt config push after successful integration test"
```

---

## Chunk 8: Unit & Integration Tests

### Task 21: Unit tests for config runtime persistence

**Files:**
- Modify: `packages/rantaiclaw/src/config/runtime.rs` (add `#[cfg(test)]` module)

- [ ] **Step 1: Add tests for runtime.rs**

Add at the bottom of `runtime.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_runtime_path() {
        let base = Path::new("/root/.rantaiclaw/config.toml");
        assert_eq!(runtime_path(base), PathBuf::from("/root/.rantaiclaw/config.runtime.toml"));
    }

    #[test]
    fn test_deep_merge_tables() {
        let mut base: TomlValue = toml::from_str("[a]\nx = 1\ny = 2").unwrap();
        let over: TomlValue = toml::from_str("[a]\ny = 99\nz = 3").unwrap();
        deep_merge(&mut base, &over);
        let table = base.as_table().unwrap().get("a").unwrap().as_table().unwrap();
        assert_eq!(table.get("x").unwrap().as_integer(), Some(1)); // preserved
        assert_eq!(table.get("y").unwrap().as_integer(), Some(99)); // overridden
        assert_eq!(table.get("z").unwrap().as_integer(), Some(3)); // added
    }

    #[test]
    fn test_read_missing_runtime_returns_empty() {
        let result = read_runtime_overrides(Path::new("/nonexistent/config.toml")).unwrap();
        assert!(result.as_table().unwrap().is_empty());
    }

    #[test]
    fn test_write_and_read_runtime_section() {
        let mut base = NamedTempFile::new().unwrap();
        writeln!(base, "[gateway]\nport = 8080").unwrap();
        let base_path = base.path();

        let section = toml::from_str::<TomlValue>("[channels_config.telegram]\nbot_token = \"abc\"")
            .unwrap()
            .get("channels_config")
            .unwrap()
            .clone();

        write_runtime_section(base_path, "channels_config", section).unwrap();
        let overrides = read_runtime_overrides(base_path).unwrap();
        assert!(overrides.as_table().unwrap().contains_key("channels_config"));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd packages/rantaiclaw && cargo test config::runtime 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rantaiclaw/src/config/runtime.rs
git commit -m "test(config): add unit tests for runtime config persistence"
```

---

### Task 22: Unit tests for McpRegistry

**Files:**
- Modify: `packages/rantaiclaw/src/mcp/mod.rs` (add `#[cfg(test)]` module)

- [ ] **Step 1: Add tests for McpRegistry**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn test_config(cmd: &str) -> McpServerConfig {
        McpServerConfig {
            command: cmd.to_string(),
            args: vec!["--test".to_string()],
            env: HashMap::new(),
        }
    }

    #[tokio::test]
    async fn test_add_server_limit() {
        let mut registry = McpRegistry::new();
        // Note: This test uses "echo" as a command that exits immediately.
        // In a real test, use a long-running process or mock.
        for i in 0..MAX_MCP_SERVERS {
            let result = registry.add_server(
                format!("server-{}", i),
                test_config("sleep"),
            ).await;
            // May fail if sleep isn't available, but tests the limit logic
            if result.is_err() { return; } // skip if can't spawn
        }
        // 11th should fail with limit error
        let result = registry.add_server("one-too-many".to_string(), test_config("sleep")).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("limit reached"));
    }

    #[tokio::test]
    async fn test_add_duplicate_server() {
        let mut registry = McpRegistry::new();
        let _ = registry.add_server("test".to_string(), test_config("sleep")).await;
        let result = registry.add_server("test".to_string(), test_config("sleep")).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));
    }

    #[tokio::test]
    async fn test_remove_nonexistent_server() {
        let mut registry = McpRegistry::new();
        let result = registry.remove_server("nonexistent").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd packages/rantaiclaw && cargo test mcp:: 2>&1 | tail -10`
Expected: Tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rantaiclaw/src/mcp/mod.rs
git commit -m "test(mcp): add unit tests for McpRegistry"
```

---

### Task 23: Integration tests for Config API endpoints

**Files:**
- Create: `packages/rantaiclaw/tests/config_api.rs` (integration test)

- [ ] **Step 1: Create integration test file**

```rust
//! Integration tests for the Config API endpoints.
//! These test HTTP request/response contracts without starting real channels.

// Note: This requires building a test harness that starts the gateway
// on a random port. If the codebase doesn't have this infrastructure yet,
// this task should first create a test helper that:
// 1. Creates a minimal Config with a temp directory
// 2. Starts the gateway on port 0 (OS-assigned)
// 3. Returns the bound address and a bearer token
//
// Then test:
// - GET /config returns 200 with valid JSON
// - GET /config without auth returns 401
// - PATCH /config/model with valid body returns 200
// - PATCH /config/mcp-servers with invalid body returns 400
// - PATCH /config/channels with null value returns 200 (channel removed)
// - GET /config/channels returns status map
// - GET /config/mcp-servers returns status map

use std::collections::HashMap;
// Implementation depends on gateway test infrastructure
```

- [ ] **Step 2: Verify test compiles**

Run: `cd packages/rantaiclaw && cargo test --test config_api --no-run 2>&1 | tail -5`
Expected: Compiles (may not have runnable tests yet if harness is missing).

- [ ] **Step 3: Commit**

```bash
git add packages/rantaiclaw/tests/config_api.rs
git commit -m "test(gateway): add integration test scaffolding for Config API"
```

---

## Verification Checklist

After all tasks are complete:

1. **Rust compilation**: `cargo check --features whatsapp-web` passes
2. **Docker build**: `docker build -f docker/employee/Dockerfile .` succeeds
3. **Config API routes**: All 8 endpoints respond (GET/PATCH)
4. **Channel lifecycle**: Channels can be added/removed via PATCH without restart
5. **MCP server spawn**: `PATCH /config/mcp-servers` with a GitHub config spawns the process
6. **Config persistence**: Changes survive container restart via `config.runtime.toml`
7. **Platform push**: Saving an integration in the dashboard triggers a config push to the running container
8. **Fallback**: If container isn't running, push fails silently and agent-runner picks up config at next start
