# Live Config API & Auto MCP Integration Design

## Summary

Two capabilities for RantaiClaw digital employees:

1. **Live Config API** — RantaiClaw exposes `PATCH /config/*` endpoints on its gateway so channels, MCP servers, tools, model, and agent settings can be updated at runtime without container restart.
2. **Auto MCP for Tool Integrations** — When a user connects a tool integration (GitHub, Notion, Linear, etc.) in the dashboard, the platform automatically maps it to an MCP server, pushes the config to the running container, and the agent gains access to those tools immediately.

## Motivation

**Current pain points:**
- Adding/removing a channel integration (Discord, Slack, WhatsApp) requires a full container restart. WhatsApp Web loses its session and requires re-pairing.
- Tool integrations (GitHub, Notion, Linear) are stored in the DB but never reach the agent — the employee has no idea it's connected to GitHub and can't use it.
- Any config change (model, system prompt, tools) requires a restart.

**After this work:**
- Dashboard changes take effect instantly on the running employee.
- Connecting GitHub in the UI means the agent can immediately use GitHub tools.
- WhatsApp Web sessions survive channel config updates.

---

## Architecture

### RantaiClaw Config API

New `/config/*` route group on the existing gateway HTTP server, authenticated via the same bearer token as `/webhook`.

#### Endpoints

| Endpoint | Method | Body | Effect |
|---|---|---|---|
| `/config` | `GET` | — | Returns current running config as JSON |
| `/config/channels` | `PATCH` | `{ "telegram": {...}, "discord": null }` | Add/update channels (set to `null` to remove). Gracefully stops removed channels, starts new ones, restarts modified ones. Unaffected channels keep running. |
| `/config/mcp-servers` | `PATCH` | `{ "github": { "command": "npx", "args": [...], "env": {...} }, "notion": null }` | Add/remove/update MCP server processes. |
| `/config/model` | `PATCH` | `{ "provider": "...", "model": "...", "temperature": 0.7 }` | Hot-swap provider/model/temperature. |
| `/config/tools` | `PATCH` | `{ "allowed_tools": [...] }` | Update tool permissions. |
| `/config/agent` | `PATCH` | `{ "system_prompt": "...", "workspace_files": {...} }` | Update prompt, skills, workspace files. |

**Request/Response contract:**
- Auth: `Authorization: Bearer <runtime_token>` (same token used for `/webhook`)
- Success: `200 { "ok": true, "applied": { ... } }`
- Partial failure: `207 { "ok": false, "applied": { ... }, "errors": { ... } }`
- Auth failure: `401 { "error": "Unauthorized" }`
- Invalid body: `400 { "error": "..." }`

**Persistence:** Each PATCH writes runtime overrides to `config.runtime.toml`, which is merged on top of the base `config.toml` at startup. This preserves user comments and manual edits in the base config file. The merge strategy is: runtime overrides win for any key present in both files.

**Body size limit:** Config endpoints use a 1MB body limit (vs. the default 64KB for webhook), since `/config/agent` may include workspace files and system prompts.

**Status endpoints:** In addition to `GET /config`, the following return runtime status:
- `GET /config/channels` — Returns `HashMap<String, ChannelStatus>` (Running/Stopped/Error)
- `GET /config/mcp-servers` — Returns `HashMap<String, McpStatus>` (Running/Stopped/Error)

---

### Concurrency Model

Config state is shared between the gateway request handlers, channel supervisor, and MCP registry using `tokio::sync::watch` channels:

1. `PATCH` handler acquires a write lock, applies the change, sends the new config via `watch::Sender`
2. Channel registry and MCP registry each hold a `watch::Receiver` — they observe changes and apply them
3. In-flight requests that already hold a reference to the old provider/model complete with the old config. New requests use the updated config.
4. Config mutations are best-effort per-endpoint: a `PATCH /config/channels` applies each channel individually. Successfully applied changes are reported in `applied`, failures in `errors`. If any operation fails, the response is `207` with partial results. This avoids complex rollback logic for independent channel/MCP server operations.

The existing `parking_lot::Mutex<Config>` in the gateway is replaced with `Arc<tokio::sync::RwLock<Config>>` to allow concurrent reads during request handling while serializing config mutations.

---

### Config Schema Changes (Rust)

The following must be added to `src/config/schema.rs`:

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

Add to the `Config` struct:
```rust
/// MCP servers managed by the runtime.
#[serde(default)]
pub mcp_servers: HashMap<String, McpServerConfig>,
```

This enables `[mcp_servers.github]`, `[mcp_servers.notion]`, etc. in config.toml.

---

### Channel Supervisor Refactor

Currently all channels start/stop as one monolithic unit in `src/channels/mod.rs`. This becomes a per-channel supervisor with a registry.

#### Data Structures

```rust
pub struct ChannelRegistry {
    channels: HashMap<String, ChannelHandle>,
    message_tx: mpsc::Sender<ChannelMessage>,
}

pub struct ChannelHandle {
    config: serde_json::Value,      // channel-specific config
    shutdown_tx: oneshot::Sender<()>,
    task: JoinHandle<()>,
    status: ChannelStatus,
}

pub enum ChannelStatus {
    Running,
    Stopped,
    Error(String),
}
```

#### Channel Shutdown Mechanism

The current `Channel::listen()` trait method is a long-running async function with no cancellation support. To enable graceful shutdown:

- Thread a `tokio_util::sync::CancellationToken` into each channel's listen loop. The token is checked between poll iterations (Slack polling, Telegram polling) or used as a select branch alongside the event stream (Discord, WhatsApp Web).
- This is a **breaking trait change** to `Channel::listen()` — the signature gains a `cancel: CancellationToken` parameter.
- Fallback: If a channel doesn't check the token within 5 seconds, the task is aborted via `JoinHandle::abort()`. This is safe for all current channels (Discord disconnects cleanly on drop, WhatsApp Web session is persisted to disk before the event loop, Slack/Telegram are stateless pollers).

#### Feature-Gated Channels

The `ChannelRegistry::add_channel` factory must handle feature-gated channel types (e.g., `whatsapp-web` requires `--features whatsapp-web`). If the binary was compiled without a required feature, `add_channel` returns a descriptive error: `"Channel 'whatsapp-web' not available: binary compiled without whatsapp-web feature"`.

#### Registry Operations

- `add_channel(id, config)` — Parse config into the appropriate channel type, spawn a supervised task with exponential backoff (reusing existing `spawn_supervised_listener` logic), store the handle. Returns error for unsupported/feature-gated channels.
- `remove_channel(id)` — Cancel via `CancellationToken`, await graceful stop with 5s timeout, abort if needed, remove from registry.
- `update_channel(id, config)` — `remove_channel` + `add_channel` (restart with new config).
- `list_channels()` — Return `HashMap<String, ChannelStatus>`.

#### PATCH /config/channels Flow

1. Deserialize incoming JSON as `HashMap<String, Option<serde_json::Value>>`
2. For each entry:
   - Value is `null` → `remove_channel(id)`
   - Key exists in registry, value differs → `update_channel(id, new_config)`
   - Key doesn't exist → `add_channel(id, config)`
3. Unmentioned channels are untouched
4. Persist updated `[channels_config.*]` sections to `config.toml`
5. Return applied changes and any errors

#### Session Persistence

WhatsApp Web sessions are already stored at a file path (`/root/.rantaiclaw/state/whatsapp-web/session.db`). When a WhatsApp Web channel is updated (e.g., allowed_numbers change), the session file is preserved — no re-pairing needed. Only removing and re-adding the channel with a different phone number requires re-pairing.

---

### Auto MCP Server Management

#### MCP Registry

```rust
pub struct McpRegistry {
    servers: HashMap<String, McpHandle>,
}

pub struct McpHandle {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    process: Child,
    status: McpStatus,
}

pub enum McpStatus {
    Running,
    Stopped,
    Error(String),
}
```

#### MCP Process Supervision

MCP server processes are supervised with restart-on-crash behavior:
- If an MCP server process exits unexpectedly, it is restarted with exponential backoff (1s → 2s → 4s → ... → 60s cap).
- After 5 consecutive failures, the server is marked as `Error` and not restarted until manually re-added via PATCH.
- If `remove_server` is called while the agent has in-flight tool calls to that server, pending calls return a "server disconnected" error. The agent handles this gracefully (tool call fails, agent retries or reports).

#### Resource Limits

Maximum 10 concurrent MCP server processes per container. Attempting to add more returns `400 { "error": "MCP server limit reached (max 10)" }`. This prevents runaway resource consumption from multiple Node.js processes.

#### Registry Operations

- `add_server(id, command, args, env)` — Spawn process, connect via stdio, register tools with the agent's tool registry. Returns error if limit reached.
- `remove_server(id)` — Disconnect, kill process, unregister tools.
- `update_server(id, ...)` — Remove + add.
- `list_servers()` — Return status map.

#### PATCH /config/mcp-servers Flow

1. Deserialize incoming JSON as `HashMap<String, Option<McpServerConfig>>`
2. For each entry:
   - `null` → `remove_server(id)`
   - Exists and changed → `update_server(id, new_config)`
   - New → `add_server(id, config)`
3. Persist to `[mcp_servers]` in config.toml
4. Return applied changes

---

### Platform Integration Mapping

The platform translates dashboard integrations into MCP server configs. This mapping lives in the platform codebase (not RantaiClaw).

#### New File: `lib/digital-employee/mcp-mapping.ts`

Maps integration ID + decrypted credentials → MCP server config:

| Integration | MCP Package | Env Vars |
|---|---|---|
| `github` | `@modelcontextprotocol/server-github` | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| `slack` | `@modelcontextprotocol/server-slack` | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` |
| `notion` | `@notionhq/notion-mcp-server` | `OPENAPI_MCP_HEADERS` |
| `linear` | `@modelcontextprotocol/server-linear` | `LINEAR_API_KEY` |
| `smtp` | Custom wrapper (bundled) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| `custom-api` | Custom wrapper (bundled) | `BASE_URL`, `API_KEY`, `CUSTOM_HEADERS` |
| `custom-mcp` | User-provided | User-provided env |

**Note:** Google integrations (Gmail, Calendar, Drive) are deferred to a future spec.

Each mapping returns:
```typescript
interface McpServerConfig {
  command: string     // e.g. "npx"
  args: string[]      // e.g. ["-y", "@modelcontextprotocol/server-github"]
  env: Record<string, string>
}
```

#### New File: `lib/digital-employee/config-push.ts`

Utility that:
1. Looks up the running container's host:port for an employee
2. Calls the appropriate `PATCH /config/*` endpoint
3. Returns success/error

Called from:
- Integration save/delete API routes (after credential storage)
- Dashboard "Apply Changes" as a fallback

#### Fallback Behavior

If the container isn't running when credentials are saved, no push happens. The agent-runner picks up all integrations at next container start via the existing `EmployeePackage` flow (unchanged).

---

### Platform Integration Flow (End-to-End)

1. User adds GitHub integration in dashboard UI, enters PAT
2. Existing API route encrypts + saves credentials to DB
3. API route calls `configPush.pushMcpServer(employeeId, "github", creds)`
4. `config-push.ts` maps credentials → `{ command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_..." } }`
5. `config-push.ts` calls `PATCH http://container:port/config/mcp-servers` with `{ "github": { ... } }`
6. RantaiClaw spawns the MCP server process, connects via stdio, registers tools
7. Agent can now use GitHub tools immediately
8. `config-push.ts` updates integration status to `connected`

Same flow for channel integrations, using `PATCH /config/channels` instead.

---

### Docker Image Changes

- Install Node.js (already present) + `npx` (already present via Bun)
- Pre-cache official MCP packages at build time for fast startup:
  - `@modelcontextprotocol/server-github`
  - `@modelcontextprotocol/server-slack`
  - `@notionhq/notion-mcp-server`
  - `@modelcontextprotocol/server-linear`
- Bundle custom MCP wrappers for SMTP and Custom API in `/opt/mcp-servers/`

---

## What Does NOT Change

- Prisma schema — no DB changes needed
- Integration CRUD API routes — existing save/delete flows unchanged
- Dashboard UI — existing integration setup wizard unchanged (config push is transparent)
- Agent-runner bootstrap — still reads `EmployeePackage` and writes initial config at startup
- RantaiClaw channel implementations — existing Telegram/Discord/Slack/WhatsApp code unchanged
- Google integrations — deferred to future spec

## Scope Exclusions

- Google OAuth integrations (Gmail, Calendar, Drive) — requires OAuth token refresh flow, deferred
- Custom MCP server marketplace/discovery
- Multi-container MCP sidecar architecture
- UI changes for live config status indicators

---

## Testing Strategy

1. **Unit tests (Rust):** ChannelRegistry add/remove/update, McpRegistry add/remove/update, config serialization/persistence
2. **Integration tests (Rust):** PATCH endpoint auth, valid/invalid payloads, partial failure handling
3. **E2E tests:**
   - Add Discord integration via dashboard → verify bot connects without restart
   - Remove channel → verify it stops, others keep running
   - Add GitHub integration → verify MCP server starts → agent can use GitHub tools
   - Update WhatsApp allowed_numbers → verify session preserved, no re-pair
   - Container restart → verify all config persisted and restored
