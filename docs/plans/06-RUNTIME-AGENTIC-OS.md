# 06 — Runtime Layer: Agentic OS

## Overview

Each Digital Employee runs inside an isolated environment:

```
┌───────────────────────────────────────┐
│          Firecracker MicroVM          │  ← RantAI's existing product
│  ┌─────────────────────────────────┐  │
│  │          Alpine Linux           │  │  ← Minimal base OS (~5MB)
│  │  ┌───────────────────────────┐  │  │
│  │  │        ZeroClaw           │  │  │  ← Agentic runtime
│  │  │  ┌─────────────────────┐  │  │  │
│  │  │  │  RantAI Agent       │  │  │  │  ← Agent runner (reads Employee Package)
│  │  │  │  Runner             │  │  │  │
│  │  │  └─────────────────────┘  │  │  │
│  │  │  ┌─────────────────────┐  │  │  │
│  │  │  │  Skills & Tools     │  │  │  │
│  │  │  │  - ClawHub skills   │  │  │  │  ← External skill marketplace
│  │  │  │  - Platform tools   │  │  │  │  ← From RantAI Agent Builder
│  │  │  │  - MCP clients      │  │  │  │  ← External service connectors
│  │  │  └─────────────────────┘  │  │  │
│  │  │                           │  │  │
│  │  │  memory.db (SQLite)       │  │  │  ← Persistent memory
│  │  │  workspace/               │  │  │  ← File system workspace
│  │  │  logs/                    │  │  │  ← Execution logs
│  │  └───────────────────────────┘  │  │
│  └─────────────────────────────────┘  │
│         mount: /data/vol-{empId}      │  ← Persistent volume
└───────────────────────────────────────┘
```

## Architecture Components

### 1. Base Image: Alpine + ZeroClaw

The MicroVM boots a pre-built image containing:

**Alpine Linux** (base layer):
- Minimal footprint (~5MB RAM)
- Package manager for additional dependencies
- Networking, filesystem, process management

**ZeroClaw** (agentic layer):
- Rust-based agentic runtime
- Local SQLite for persistent memory (vector embeddings + keyword search)
- Tool execution environment (shell, code runner)
- MCP client for external service connections
- Trait-driven architecture — skills/tools/channels injected at boot via config

### 2. RantAI Agent Runner

A lightweight process that bridges the RantAI platform's agent config with ZeroClaw's runtime:

```
Employee Package (JSON)
        │
        ▼
┌─────────────────────┐
│  RantAI Agent Runner │
│                     │
│  1. Parse package   │
│  2. Init ZeroClaw   │
│     with agent      │
│     config          │
│  3. Register tools  │
│     (platform +     │
│      ClawHub)       │
│  4. Load skills     │
│  5. Sync KB data    │
│  6. Execute         │
│     workflow        │
│  7. Report results  │
│     back to         │
│     platform        │
└─────────────────────┘
```

#### Boot Sequence

```
1. VM starts (~125ms)
2. Alpine init (~10ms)
3. ZeroClaw loads
4. Agent Runner starts:
   a. Reads /data/config/employee-package.json (mounted from volume)
   b. Initializes ZeroClaw with:
      - Agent system prompt + skill prompts
      - Model configuration (API keys from mounted secrets)
      - Memory DB path (/data/memory/memory.db)
   c. Registers tools:
      - Platform built-in tools → wrapped as ZeroClaw tools
      - Custom tools → HTTP executors pointing to external URLs
      - MCP tools → ZeroClaw's native MCP client connects to servers
      - ClawHub skills → installed from ZeroClaw's skill registry
   d. Syncs knowledge base data:
      - Platform API → download embeddings for configured KB groups
      - Store in local SQLite for RAG queries during execution
   e. Reads trigger context (what triggered this run)
   f. Loads the appropriate workflow
   g. Executes workflow with full agent capabilities
5. During execution:
   - Tool calls go through ZeroClaw's executor
   - Approval-required actions → webhook to Gateway (see 07-INTERACTION-GATEWAY.md)
   - Progress updates → reported to platform API
   - Memory writes → persisted to /data/memory/memory.db
6. On completion:
   - Results reported to platform API
   - WorkflowRun + EmployeeRun records updated
   - VM tears down
   - Volume persists (memory, workspace, logs survive)
```

### 3. Tool Resolution in VM

Tools come from multiple sources. The Agent Runner resolves them at boot:

| Source | How it gets into the VM | Execution |
|--------|------------------------|-----------|
| **Platform built-in tools** (web_search, knowledge_search, etc.) | Defined in Employee Package JSON | Agent Runner implements them: some call platform API, some run locally |
| **Custom tools** | `executionConfig` in Package (URL, method, headers) | HTTP fetch from inside VM to external endpoint |
| **MCP tools** | MCP server URL in Package | ZeroClaw's MCP client connects directly |
| **ClawHub skills** | Skill name/version in Package | Installed from ClawHub registry at boot (or pre-baked in image) |
| **Community tools** | Config in Package | Loaded from ZeroClaw's tool registry |

#### Knowledge Search in VM

The `knowledge_search` tool works differently in VM vs. platform:

**Platform (current)**: Calls `smartRetrieve()` which queries the platform's vector DB (Prisma + pgvector).

**VM (new)**: At boot, the Agent Runner syncs relevant embeddings from the platform API into the VM's local SQLite (with vector extension). During execution, RAG queries run locally — no platform dependency during task execution. This means:
- Faster queries (no network round-trip)
- Works even if platform is temporarily unreachable
- Stale data risk: KB sync happens at boot, not real-time. Acceptable for most use cases.

### 4. Persistent Volume Structure

Each Digital Employee gets a persistent volume mounted at `/data/`:

```
/data/
├── config/
│   └── employee-package.json     # Deployment config (written by orchestrator)
├── memory/
│   ├── memory.db                 # SQLite: conversation history, semantic memory
│   └── memory.db-wal             # WAL for crash recovery
├── workspace/
│   ├── drafts/                   # Work-in-progress files
│   ├── outputs/                  # Completed deliverables
│   └── temp/                     # Scratch space (cleaned on boot)
├── kb/
│   └── embeddings.db             # Synced knowledge base data
├── logs/
│   ├── runs/                     # Per-run execution logs
│   └── agent.log                 # Agent runtime log
└── secrets/
    └── .env                      # Mounted secrets (API keys, credentials)
```

### 5. Communication: VM ↔ Platform

The VM communicates with the platform via HTTP APIs:

```
VM → Platform:
  POST /api/runtime/runs/{runId}/status     — update run status
  POST /api/runtime/runs/{runId}/step       — report step completion
  POST /api/runtime/runs/{runId}/output     — submit final output
  POST /api/runtime/approvals               — request human approval
  GET  /api/runtime/kb/{groupId}/sync       — download KB embeddings
  POST /api/runtime/employees/{id}/heartbeat — I'm alive

Platform → VM:
  (via orchestrator, not direct HTTP)
  - Boot with config
  - Inject approval response (resume signal)
  - Terminate signal
```

Authentication: Each VM gets a short-lived JWT token (scoped to the employee + run) injected via environment variable at boot. The platform API validates this token for all runtime endpoints.

## Orchestrator

The orchestrator sits between the platform and Firecracker, managing VM lifecycle:

```typescript
// Conceptual — likely a separate service, not in Next.js

interface Orchestrator {
  // Deploy an employee (create volume, prepare config)
  deploy(employeeId: string, package: EmployeePackage): Promise<DeployResult>

  // Spin up VM for a run
  startRun(employeeId: string, trigger: TriggerContext): Promise<RunHandle>

  // Resume a paused run (after approval)
  resumeRun(runId: string, approvalData: ApprovalResponse): Promise<void>

  // Terminate a running VM
  terminate(runId: string): Promise<void>

  // Cleanup: remove volume, deregister
  undeploy(employeeId: string): Promise<void>

  // Health check
  getStatus(employeeId: string): Promise<EmployeeRuntimeStatus>
}
```

### Orchestrator Flow

```
Platform Scheduler fires cron trigger
        │
        ▼
Orchestrator.startRun(employeeId, { trigger: "schedule", cron: "0 8 * * *" })
        │
        ├── 1. Load Employee Package from DB
        ├── 2. Write package to employee's volume (/data/config/)
        ├── 3. Generate short-lived JWT token
        ├── 4. Call Firecracker API:
        │      - Create VM with base image
        │      - Mount volume at /data/
        │      - Inject env vars (JWT, API URL, run ID)
        │      - Set resource limits (CPU, memory, timeout)
        ├── 5. VM boots → Agent Runner executes
        ├── 6. Monitor via heartbeat
        │      - If no heartbeat for 60s → force terminate
        │      - If execution time exceeds limit → force terminate
        └── 7. On completion/failure:
               - Collect results from platform API
               - Update EmployeeRun record
               - VM tears down automatically
               - Volume persists
```

## Development Mode

For local development (before Firecracker infra is ready), the "VM" can be a Docker container or even a local process:

```
Development:  Employee Package → Docker container with Alpine + ZeroClaw
Staging:      Employee Package → Firecracker VM (single host)
Production:   Employee Package → Firecracker VM (distributed, auto-scaling)
```

The Agent Runner code is identical across all modes — only the container/VM layer changes.

## Image Building Pipeline

```
Base Image (built once, rarely changes):
  Alpine Linux
  + ZeroClaw runtime
  + RantAI Agent Runner binary
  + Common dependencies (Node.js/Python for code execution tools)
  + ClawHub CLI (for installing skills at boot)

Per-Employee Customization (at boot, NOT baked into image):
  - Employee Package JSON (defines agent, tools, workflows)
  - Mounted volume (memory, workspace, KB data)
  - Environment variables (API keys, secrets)
  - ClawHub skills (installed on first boot, cached on volume)
```

This means ONE base image serves ALL employees. Customization is entirely config-driven.

## Security Model

| Concern | Mitigation |
|---------|-----------|
| Rogue agent escapes VM | Firecracker's hardware-level isolation (KVM). No host access. |
| Agent accesses other employees' data | Each VM mounts only its own volume. No shared storage. |
| API key leakage | Secrets mounted as files, not in package JSON. Rotated per-run. |
| Infinite loops / resource abuse | `maxRunDuration` hard timeout. CPU/memory limits via Firecracker. |
| Network abuse (DDoS, scraping) | Network policy: only allow platform API + configured MCP server URLs. |
| Prompt injection via tools | Tools execute in VM sandbox. Blast radius = single employee. |

## Open Questions

1. **ZeroClaw skill format compatibility**: Can RantAI platform Skills (markdown prompt injections) be wrapped as ZeroClaw skills? Or do they need a translation layer?

2. **ClawHub vs. RantAI Marketplace**: Should ClawHub skills be installable from the RantAI platform UI? Or does the user manage them separately through ZeroClaw?

3. **Real-time vs. batch KB sync**: Should the VM sync KB embeddings once at boot, or maintain a live connection? Boot-sync is simpler but risks stale data. Live connection adds complexity but ensures freshness.

4. **Multi-model support in VM**: If the agent uses OpenRouter, the VM needs outbound HTTPS to OpenRouter's API. Should models be proxied through the platform API (for billing/metering) or called directly from the VM?

5. **Warm pools**: For frequently-triggered employees, should the orchestrator maintain pre-booted VMs (warm pool) to avoid the ~135ms cold start? Tradeoff: compute cost vs. latency.
