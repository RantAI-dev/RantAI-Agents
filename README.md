<p align="center">
  <img src="public/logo/logo-rantai.png" alt="RantAI Agents" width="120" />
</p>

<h1 align="center">RantAI Agents</h1>

<p align="center">
  Enterprise-grade AI agent platform for building and deploying autonomous digital employees with RAG capabilities, multi-channel communication, and human-in-the-loop workflows.
</p>

## Overview

RantAI Agents enables organizations to create, manage, and orchestrate intelligent AI agents powered by large language models. It combines a traditional assistant/chatbot platform with a full **Digital Employee** layer — autonomous agents that run in isolated Docker containers, execute tools, use integrations, and collaborate with each other and with humans.

## Architecture Map

Canonical backend/domain slices live in `src/features/*`:

- `digital-employees` — employee lifecycle, trust, runs, chat, workspace, files, integrations
- `workflows` — workflow CRUD, import/export, execution and runs
- `knowledge` — document/category/group knowledge management
- `skills`, `tools`, `mcp` — capability and protocol surfaces
- `groups`, `handoff`, `credentials`, `embed-keys`, `templates`, `approvals`, `audit`, `statistics`
- `marketplace`, `memory`, `openapi-specs`, `tasks`, `platform-features`
- `runtime/*`, `widget/*`, `whatsapp-webhooks`, `workflows-public`, `chat-public`, `platform-routes`
- `admin`, `agent-api`, `agent-api-keys`, `conversations`, `organizations`, `settings`, `shared`, `user`

Delivery contexts (`app/api/dashboard/*`, `app/api/runtime/*`) stay thin and orchestrate these domain slices.

## Frontend Compliance

The frontend guardrail is incremental, not all-or-nothing:

- Strict scopes fail when a client effect introduces mount-time data fetching or mutations.
- Report-only scopes still log warnings while they finish their migration to server-fed data and thin route shells.

Canonical compliant patterns:

- Fetch initial data in async Server Components.
- Keep `page.tsx` files thin by re-exporting the matching feature slice or redirecting.
- Use Server Actions and `useActionState` for mutations.
- Keep client components focused on local state, interactions, and presentation.

Migration status map:

| Scope status | Scopes |
|--------------|--------|
| Strict | credentials, embed-keys, marketplace, mcp, memory, platform-features, statistics, tools, organizations, user, audit, digital-employees, workflows, knowledge, conversations-agent, conversations-chat |
| Report-only | none |

### Key Features

- **Digital Employees** — Autonomous AI agents running in isolated Docker containers via the RantaiClaw Rust framework
- **Graduated Autonomy (L1-L4)** — Configurable trust levels from fully supervised to fully autonomous
- **Employee Workspace & VNC** — Remote desktop and IDE access to see exactly what an employee is doing
- **Integrations** — 20+ connectors (Slack, GitHub, Gmail, Google Drive, Notion, Linear, WhatsApp, and more)
- **AI Pipelines** — Visual drag-and-drop workflow builder with approval gates and handoff nodes
- **MCP Support** — Model Context Protocol server integration for extensible tool discovery
- **RAG Pipeline** — Hybrid search + semantic reranking over your document knowledge base
- **Multi-Channel Deployment** — Web portal, WhatsApp (Meta Cloud API), email, and embeddable widget
- **Human-in-the-Loop** — Approval workflows, conversation escalation, and supervisor oversight
- **Skill Marketplace** — Browse and install skills from ClawHub; build custom platform skills
- **Audit & Compliance** — Full audit trail with risk scoring, data retention, and export
- **Inter-Employee Messaging** — Task delegation, broadcasts, and supervised handoffs between employees
- **Groups** — Organize employees into teams with shared resources and bulk operations
- **OpenAI-Compatible API** — `/v1/chat/completions` endpoint for third-party integration
- **Code Interpreter** — Sandboxed code execution via Piston (Python, JavaScript, TypeScript)
- **Web Search** — Private meta-search via SearXNG with paid Serper.dev fallback
- **White-Label Support** — Product mode branding (default RantAI or NQRust Nexus)

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, Radix UI, Zustand |
| **Backend** | Next.js API Routes, NextAuth.js v5, Socket.io |
| **AI/LLM** | Vercel AI SDK v6 (`ai@6.0.39`), OpenRouter API, OpenAI Embeddings, Ollama (Local OCR) |
| **Agent Runtime** | RantaiClaw (Rust), Docker / Dockerode |
| **Databases** | PostgreSQL 16 (Prisma ORM), SurrealDB (Vector Store) |
| **Storage** | RustFS (S3-compatible object storage) |
| **Workflows** | XYFlow (visual DAG builder) |
| **Code Execution** | Piston (sandboxed Python/JS/TS) |
| **Web Search** | SearXNG (self-hosted), Serper.dev (optional paid) |
| **Integrations** | Twilio, Meta Cloud API, Nodemailer, Salesforce CRM |
| **Visualization** | Recharts, React Force Graph, React Three Fiber, Mermaid |
| **Testing** | Vitest |

---

## Prerequisites

### Required

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | v18+ | v20+ recommended |
| **bun** | latest | Package manager (`npm install -g bun`) |
| **Docker** | v20+ | With Docker Compose v2 |
| **OpenRouter API Key** | -- | Get at [openrouter.ai/keys](https://openrouter.ai/keys) |

### Hardware Requirements

#### Minimum (Cloud OCR Only)
- 2 CPU cores, 4 GB RAM
- No GPU required (uses OpenRouter for OCR fallback)

#### Recommended (Local OCR)

| Setup | RAM | GPU VRAM | OCR Model |
|-------|-----|----------|-----------|
| **CPU-Only** | 8 GB+ | None | `moondream` or `qwen3-vl:2b` |
| **Budget GPU** | 8 GB+ | 4-6 GB | `glm-ocr` (recommended) |
| **Mid-Range GPU** | 16 GB+ | 8-12 GB | `glm-ocr` + `qwen3-vl:8b` |
| **High-End GPU** | 16 GB+ | 16 GB+ | `glm-ocr` + `minicpm-v:4.5` (SOTA) |

### System Dependencies (Linux)

```bash
# Ubuntu/Debian
sudo apt-get install -y \
  build-essential libcairo2-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev libvips-dev

# macOS (via Homebrew)
brew install vips cairo pango
```

> **Note:** Required for `sharp` (image processing) and `canvas` (PDF rendering).

---

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd RantAI-Agents
git submodule update --init --recursive   # pull RantaiClaw + community-skills
bun install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/rantai?schema=public"

# SurrealDB
SURREAL_DB_URL="ws://localhost:8000/rpc"
SURREAL_DB_USER="root"
SURREAL_DB_PASS="root"
SURREAL_DB_NAMESPACE="rantai"
SURREAL_DB_DATABASE="knowledge"

# Authentication
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# AI/LLM
OPENROUTER_API_KEY="sk-or-v1-your-key"
```

### 3. Start Services

```bash
# Start PostgreSQL, SurrealDB, RustFS, Ollama, Piston, and SearXNG containers
bun docker:up

# Initialize database (migrations + generate + full seed)
bun setup:db
```

Or use the all-in-one setup command:

```bash
bun setup
```

`bun setup:db` includes:

- Prisma migration apply (`prisma migrate deploy`)
- Prisma client generation
- Core seed (`prisma/seed.ts`)
- Marketplace catalog seeds for assistants, workflows, and MCP

### 4. Install Piston Runtimes (Optional)

After `docker:up`, install code execution runtimes:

```bash
curl -sX POST http://localhost:2000/api/v2/packages \
  -H "Content-Type: application/json" -d '{"language":"python","version":"3.10.0"}'
curl -sX POST http://localhost:2000/api/v2/packages \
  -H "Content-Type: application/json" -d '{"language":"javascript","version":"18.15.0"}'
curl -sX POST http://localhost:2000/api/v2/packages \
  -H "Content-Type: application/json" -d '{"language":"typescript","version":"5.0.3"}'
```

### 5. Run Development Server

```bash
bun dev
```

Access the application:
- **Dashboard**: http://localhost:3000/dashboard
- **Operator Login**: http://localhost:3000/agent/login

---

## TUI Installer

A Rust-based terminal UI installer is available for guided setup:

```bash
cd installer
cargo build --release
./target/release/rantai-agents-installer
```

The installer provides interactive screens for:
- **Pre-flight checks** — Validates Docker, Node.js, Bun, and Rust
- **Mode selection** — Choose installation mode
- **Configuration** — Environment variable prompts
- **Optional services** — Toggle Ollama, Piston, SearXNG
- **Progress tracking** — Real-time installation progress with log viewer
- **Verification** — Post-install health checks

---

## Release CI/CD (GitHub Actions + GHCR)

This repository ships with release automation:

### Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `test.yml` | Push to main, PRs | Unit tests, integration tests (PostgreSQL), compliance gates, build |
| `release.yml` | SemVer tags (`v*.*.*`), workflow dispatch | Publish to GHCR with multi-tag versioning |
| `pre-release.yml` | Push to main | Snapshot images (`edge`, `sha-<shortsha>`) |
| `installer-ci.yml` | Installer changes | Build and test the TUI installer |
| `build-airgap-bundle.yml` | Manual | Create offline deployment bundles |
| `test-installer.yml` | Installer changes | Installer integration tests |

### Compliance Gates

Every PR and push to main must pass:

- `check:thin-routes` — Validates API route thickness
- `check:domain-imports` — Ensures feature slice isolation
- `check:frontend-compliance` — React Server Component compliance
- `check:release-compat` — Validates release-compat.json
- `bun run build` — Full production build

### Compatibility Governance

- `release-compat.json` is the machine-readable source of truth for each tagged release.
- Each release entry pins the exact supported submodule SHAs:
  - `packages/rantaiclaw`
  - `packages/community-skills`
- Release CI fails if submodules are dirty/unpinned, SHAs are unreachable on origin, or tagged release metadata does not match `release-compat.json`.

### How to Create a Release

1. Create a SemVer tag:

```bash
git tag v1.2.3
git push origin v1.2.3
```

2. Monitor `.github/workflows/release.yml` in GitHub Actions.

3. Pull the published image from GHCR:

```bash
docker pull ghcr.io/<owner>/<repo>:v1.2.3
```

Stable tags also publish:

- `ghcr.io/<owner>/<repo>:v1.2`
- `ghcr.io/<owner>/<repo>:v1`
- `ghcr.io/<owner>/<repo>:latest`

Pre-release tags (for example `v1.2.3-rc.1`) publish only the exact tag by default.

### Manual Release Rebuild

Use workflow dispatch on `Release` and provide:

- `tag`: existing tag name (`v1.2.3`)
- `push_latest`: optional override to also publish `latest`

### Multi-Repo Release Order

Use this order for coordinated updates:

1. Release `rantaiclaw` (if runtime changes are needed).
2. Release `community-skills` (if marketplace package updates are needed).
3. Bump submodule SHAs in `rantai-agents` and update `release-compat.json`.
4. Merge to `main` after full CI passes.
5. Tag and release `rantai-agents`.

---

## Project Structure

```
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── dashboard/            # Protected dashboard API routes
│   │   │   ├── digital-employees/   # Digital employee CRUD + chat + workspace
│   │   │   │   └── [id]/
│   │   │   │       ├── chat/        # Streaming agentic chat
│   │   │   │       ├── integrations/ # Credential management
│   │   │   │       ├── vnc/         # VNC remote desktop proxy
│   │   │   │       └── workspace/   # File explorer & shell
│   │   │   ├── groups/              # Employee group management
│   │   │   ├── workflows/           # Workflow pipelines
│   │   │   ├── templates/           # Employee templates
│   │   │   ├── approvals/           # Approval workflow management
│   │   │   ├── audit/               # Audit log API
│   │   │   ├── marketplace/         # Marketplace catalog
│   │   │   ├── skills/              # Skill management
│   │   │   ├── tools/               # Tool management
│   │   │   ├── mcp-servers/         # MCP server configuration
│   │   │   ├── mcp-api-keys/        # MCP API key management
│   │   │   ├── credentials/         # Credential CRUD
│   │   │   ├── embed-keys/          # Embed key management
│   │   │   ├── memory/              # Memory management
│   │   │   ├── models/              # Available LLM models
│   │   │   ├── statistics/          # Usage analytics
│   │   │   ├── search/              # Full-text search
│   │   │   ├── tasks/               # Task management
│   │   │   ├── handoff/             # Human handoff management
│   │   │   ├── chat/                # Assistant chat
│   │   │   ├── files/               # File management
│   │   │   ├── features/            # Feature flags
│   │   │   ├── openapi-specs/       # OpenAPI spec management
│   │   │   └── agent-api-keys/      # API key management
│   │   ├── runtime/                 # Agent-accessible runtime API
│   │   │   ├── employees/[id]/      # Runtime heartbeat & status
│   │   │   ├── messages/            # Inter-employee messaging
│   │   │   ├── integrations/        # Integration credentials & testing
│   │   │   ├── tools/               # Platform tool execution
│   │   │   ├── skills/              # Skill search & install
│   │   │   ├── goals/               # Goal progress tracking
│   │   │   ├── runs/                # Run status & logs
│   │   │   ├── approvals/           # Pending approvals
│   │   │   ├── onboarding/          # Onboarding report
│   │   │   └── audit/               # Runtime audit logging
│   │   ├── cron/                    # Scheduled jobs
│   │   │   ├── workflows/           # Scheduled workflow execution
│   │   │   ├── approvals/           # Approval timeout handling
│   │   │   ├── cleanup-attachments/ # Storage cleanup
│   │   │   └── sync-models/         # LLM model catalog sync
│   │   ├── v1/
│   │   │   └── chat/completions/    # OpenAI-compatible chat API
│   │   ├── webhooks/
│   │   │   ├── whatsapp/            # Meta Cloud API webhook
│   │   │   └── employees/           # Employee webhook endpoint
│   │   ├── widget/                  # Embeddable widget API
│   │   │   ├── chat/                # Widget chat
│   │   │   ├── config/              # Widget configuration
│   │   │   ├── handoff/             # Widget human escalation
│   │   │   └── upload/              # Widget file upload
│   │   ├── chat/                    # Public chat endpoint
│   │   ├── auth/                    # NextAuth authentication
│   │   ├── admin/                   # Admin API
│   │   ├── upload/                  # S3 presigned URLs
│   │   ├── files/                   # Direct file download
│   │   └── organizations/           # Organization management
│   └── dashboard/
│       ├── digital-employees/       # Employee management UI
│       ├── groups/                  # Group management UI
│       ├── workflows/               # Workflow editor UI
│       ├── chat/                    # Assistant chat UI
│       ├── files/                   # Knowledge base UI
│       ├── marketplace/             # Marketplace UI
│       │   ├── skills/              # Skill marketplace
│       │   ├── tools/               # Tool marketplace
│       │   ├── workflows/           # Workflow templates
│       │   └── mcp/                 # MCP server catalog
│       ├── audit/                   # Audit log viewer
│       ├── organization/            # Organization management
│       ├── account/                 # User account
│       ├── agent-builder/           # Agent configuration builder
│       ├── agent/                   # Operator login
│       └── settings/                # Platform settings
│           ├── general/             # General settings
│           ├── agent-config/        # Agent configuration
│           ├── analytics/           # Analytics
│           ├── mcp/                 # MCP server configuration
│           ├── tools/               # Tool configuration
│           ├── skills/              # Skill management
│           ├── credentials/         # Credential management
│           ├── embed/               # Embed key settings
│           ├── memory/              # Memory settings
│           ├── statistics/          # Usage statistics
│           ├── organization/        # Organization settings
│           ├── members/             # Team members
│           ├── billing/             # Billing
│           ├── features/            # Feature flags
│           └── about/               # Platform info
├── src/features/                    # Vertical domain slices
│   ├── digital-employees/          # Employee lifecycle, chat, integrations
│   ├── workflows/                  # Workflow execution engine
│   ├── knowledge/                  # Document management + RAG
│   ├── skills/                     # Skill marketplace
│   ├── tools/                      # Platform tools catalog
│   ├── mcp/                        # MCP server management
│   ├── credentials/                # AES-256-GCM credential encryption
│   ├── memory/                     # Semantic memory (Mastra-style)
│   ├── marketplace/                # Unified marketplace catalog
│   ├── audit/                      # Audit trail logging
│   ├── statistics/                 # Usage metrics
│   ├── handoff/                    # Human escalation
│   ├── embed-keys/                 # Widget API keys
│   ├── conversations/              # Chat history
│   ├── assistants/                 # Assistant management
│   ├── organizations/              # Multi-tenant support
│   ├── templates/                  # Employee templates
│   ├── platform-features/          # Feature flags
│   ├── runtime/                    # Employee runtime API
│   ├── widget/                     # Widget backend
│   ├── user/                       # User management
│   ├── admin/                      # Admin features
│   ├── agent-api/                  # Agent API
│   ├── agent-api-keys/             # API key management
│   ├── openapi-specs/              # OpenAPI specification
│   ├── settings/                   # Settings UI
│   ├── shared/                     # Cross-feature utilities
│   ├── chat-public/                # Public chat
│   ├── workflows-public/           # Public workflows
│   ├── platform-routes/            # Platform route handlers
│   └── whatsapp-webhooks/          # WhatsApp webhook handling (Meta Cloud API)
├── lib/
│   ├── digital-employee/
│   │   ├── orchestrator.ts          # Lifecycle orchestration
│   │   ├── docker-orchestrator.ts   # Docker container management
│   │   ├── integrations.ts         # Integration registry (20+ connectors)
│   │   ├── package-generator.ts     # Employee package builder
│   │   ├── workspace-proxy.ts       # Workspace API proxy
│   │   ├── types.ts                 # All platform types
│   │   └── shared-constants.ts      # Shared enums and constants
│   ├── rag/                         # RAG pipeline (chunker, embeddings, retriever)
│   ├── ocr/                         # OCR pipeline (Ollama + OpenRouter fallback)
│   ├── mcp/                         # MCP client manager (singleton + pooling)
│   ├── models/                      # LLM model registry and sync
│   ├── tools/                       # Platform tool implementations
│   ├── skills/                      # Skill SDK
│   ├── memory/                      # Memory management
│   ├── s3/                          # S3 storage client
│   ├── chat/                        # Chat utilities
│   ├── channels/                    # Channel management
│   ├── prompts/                     # System prompts
│   ├── templates/                   # Template utilities
│   ├── marketplace/                 # Marketplace utilities
│   ├── workflow/                    # Workflow engine
│   ├── document-intelligence/       # Document processing
│   ├── surrealdb/                   # SurrealDB client
│   ├── openapi/                     # OpenAPI utilities
│   ├── github/                      # GitHub integration
│   ├── slides/                      # Presentation generation
│   ├── embed/                       # Widget embedding
│   ├── files/                       # File handling
│   ├── assistants/                  # Assistant utilities
│   └── types/                       # Shared type definitions
├── docker/
│   ├── employee/
│   │   ├── Dockerfile               # Employee container image (multi-stage)
│   │   └── agent-runner/
│   │       ├── index.js             # Agent bootstrap and lifecycle
│   │       ├── tools.js             # Platform tool implementations
│   │       ├── file-sync.js         # Workspace file synchronization
│   │       ├── memory.js            # Daily memory management
│   │       └── browser-services.js  # Playwright/VNC desktop services
│   └── searxng-settings.yml         # SearXNG configuration
├── packages/
│   ├── rantaiclaw/                  # RantaiClaw Rust agent framework (submodule)
│   └── community-skills/           # Community skill packages (submodule)
├── installer/                       # Rust TUI installer
│   └── src/
│       ├── main.rs                  # Entry point
│       ├── app.rs                   # TUI application state
│       ├── theme.rs                 # UI theme
│       ├── installer/               # Installation logic
│       │   ├── preflight.rs         # Pre-flight checks
│       │   ├── config.rs            # Configuration
│       │   ├── deps.rs              # Dependency validation
│       │   ├── database.rs          # Database setup
│       │   ├── infrastructure.rs    # Docker services
│       │   ├── services.rs          # Service startup
│       │   ├── executor.rs          # Orchestration
│       │   ├── app_setup.rs         # App initialization
│       │   └── verify.rs            # Post-install verification
│       └── ui/                      # Interactive screens & widgets
├── hooks/                           # React data hooks
├── components/                      # Shared UI components (shadcn/ui)
├── prisma/                          # Database schema & migrations
├── scripts/                         # Utility scripts (seeding, migration, compliance checks)
├── knowledge-base/                  # Sample RAG documents
├── .github/workflows/               # CI/CD automation
├── release-compat.json              # Release compatibility matrix
└── CONTRIBUTING.md                  # Architecture & code style guide
```

---

## Docker Services

All infrastructure runs via Docker Compose:

| Service | Container | Port(s) | Purpose |
|---------|-----------|---------|---------|
| **PostgreSQL 16** | `rantai-agents-postgres` | 5432 | Primary database |
| **SurrealDB** | `rantai-agents-surrealdb` | 8000 | Vector embeddings (RAG) |
| **RustFS** | `rantai-agents-rustfs` | 9000 (API), 9001 (Console) | S3-compatible object storage |
| **Ollama** | `rantai-agents-ollama` | 11434 | Local OCR models |
| **Piston** | `rantai-agents-piston` | 2000 | Sandboxed code execution |
| **SearXNG** | `rantai-agents-searxng` | 8080 | Private meta-search engine |

GPU support for Ollama can be enabled by uncommenting the `deploy` section in `docker-compose.yml`.

---

## Digital Employees

Digital Employees are the core of the agentic layer. Each employee runs as a Docker container powered by the **RantaiClaw** Rust agent framework, with a gateway interface for bidirectional communication.

### Autonomy Levels

| Level | Name | Description |
|-------|------|-------------|
| **L1** | Supervised | All actions require human approval |
| **L2** | Delegated | Can act within defined constraints |
| **L3** | Autonomous | Independent with full audit trail |
| **L4** | Unrestricted | Full autonomy, minimal oversight |

### Employee Lifecycle

```
DRAFT -> ONBOARDING -> ACTIVE -> PAUSED / SUSPENDED
```

### Workspace Files

Each employee has a persistent workspace with structured files:

| File | Purpose |
|------|---------|
| `SOUL.md` | Behavioral philosophy and values |
| `IDENTITY.md` | Name, avatar, description |
| `MEMORY.md` | Curated long-term facts |
| `BOOTSTRAP.md` | Session initialization instructions |
| `HEARTBEAT.md` | Scheduled behaviors |
| `TEAM.md` | Coworkers and communication guide |
| `TOOLS.md` | Available tools (auto-generated, read-only) |
| `AGENTS.md` | Capabilities (auto-generated, read-only) |

### Workspace IDE & VNC

Operators can inspect an employee's live environment:
- **File Explorer** -- Browse, edit, and delete workspace files
- **Shell Access** -- Execute commands in the employee container
- **VNC Desktop** -- Stream a graphical desktop view of the employee's session

### Integrations

Employees can connect to 20+ services:

| Category | Integrations |
|----------|-------------|
| **Communication** | Slack, Gmail, Telegram, WhatsApp (Business + Web), Discord, SMTP |
| **Productivity** | Google Calendar, Google Drive, Notion |
| **Development** | GitHub, Linear, Custom API, Custom MCP |

Credentials are encrypted at rest (AES-256-GCM) with OAuth token refresh support.

### Skills

- Install skills from the **ClawHub** marketplace (browseable in-app)
- Create custom platform skills as `SKILL.md` files in the workspace
- Enable/disable skills per employee

### Triggers & Automation

| Trigger Type | Description |
|-------------|-------------|
| **Manual** | User-initiated runs from the dashboard |
| **Schedule/Cron** | Visual cron builder with timezone and active hours |
| **Webhook** | External event-driven execution with filter rules |
| **Workflow** | Triggered by pipeline execution |

### Inter-Employee Messaging

Employees can delegate tasks, send messages, and broadcast to groups:
- **Types**: message, task, handoff, broadcast
- **Priorities**: low, normal, high, urgent
- **Approval**: Messages can require supervisor sign-off before delivery

### Goal Tracking

- **Types**: counter, threshold, boolean, percentage
- **Periods**: daily, weekly, monthly, total
- **Auto-tracking**: Derived from run metadata

### Employee Container Architecture

```
Dashboard -> package-generator -> employee-package.json
                                       |
                               Docker Container
                               (RantaiClaw binary)
                                       |
                        Gateway (0.0.0.0, paired tokens)
                                       |
                          agent-runner (Node.js/Bun)
                          +-- tools.js (platform tools)
                          +-- file-sync.js (workspace sync)
                          +-- memory.js (daily memory)
                          +-- browser-services.js (VNC/Playwright)
                          +-- HTTP proxy -> platform API
```

The agent-runner follows a 10-step bootstrap sequence:
1. Read `/data/config/employee-package.json`
2. Write workspace files to `/data/workspace/`
3. Write `SKILL.md` files for each ClawHub skill
4. Initialize RantaiClaw with agent config
5. Register tools (platform, custom, MCP)
6. Read trigger context
7. Execute target workflow
8. Write daily note to `/data/memory/`
9. Report results to platform
10. Exit

---

## Pipelines & Workflows

Visual drag-and-drop pipeline builder (XYFlow) with node types:

- **Tool** -- Execute a bound tool
- **Integration** -- Call an external service
- **Approval** -- Human approval gate (blocks until approved)
- **Condition** -- Branching logic
- **Handoff** -- Escalate to a human operator

Pipelines support variables, input/output validation, run tracking, and import/export.

---

## MCP (Model Context Protocol)

Connect any MCP-compatible server to extend tool capabilities:

1. Add the server in **Settings -> MCP Servers** (stdio or HTTP transport)
2. Bind it to an assistant or employee
3. Tools are auto-discovered and made available in chat

The platform uses a singleton `McpClientManager` with connection pooling for efficient server management.

---

## Knowledge Base & OCR

### Document Support
PDF, PNG/JPG, markdown, Word (.docx), Excel (.xlsx), RTF, EPUB

### OCR Pipeline

| Model | VRAM | Best For |
|-------|------|----------|
| **GLM-OCR** | 2-3 GB | Tables, printed text (94.62% OmniDocBench) |
| **Moondream** | 3-4 GB | CPU-friendly basic OCR |
| **Qwen3-VL 2B** | 4 GB | Multilingual, CPU-friendly |
| **Qwen3-VL 8B** | 6-8 GB | Complex layouts |
| **MiniCPM-V 4.5** | 10-12 GB | Handwritten documents (SOTA) |

Scanned PDFs are auto-detected. Cloud fallback via OpenRouter if Ollama is unavailable.

### RAG Pipeline

- Hybrid search combining keyword and semantic retrieval
- Semantic reranking over SurrealDB vector store
- Configurable chunking strategies
- Multi-format document ingestion

---

## Audit & Compliance

Every significant action is logged with:
- Resource type and ID
- User or employee performing the action
- Risk level: low / medium / high / critical
- IP address and detailed metadata

Audit logs are viewable and filterable in the dashboard. Data retention policies and full export are available for compliance needs.

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SURREAL_DB_URL` | SurrealDB WebSocket endpoint |
| `SURREAL_DB_USER` | SurrealDB username |
| `SURREAL_DB_PASS` | SurrealDB password |
| `SURREAL_DB_NAMESPACE` | SurrealDB namespace |
| `SURREAL_DB_DATABASE` | SurrealDB database name |
| `NEXTAUTH_SECRET` | Session signing key (generate: `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Application base URL |
| `OPENROUTER_API_KEY` | OpenRouter API key |

### S3 Storage (Required for file uploads)

| Variable | Description |
|----------|-------------|
| `S3_ENDPOINT` | RustFS/S3 endpoint |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_BUCKET` | Bucket name |
| `S3_REGION` | Region |
| `S3_ENABLE_PATH_STYLE` | Path-style access (`1`) |
| `S3_PRESIGNED_URL_EXPIRE` | Presigned URL TTL (seconds) |

### Optional

| Variable | Description |
|----------|-------------|
| `OLLAMA_ENDPOINT` | Ollama server URL for local OCR |
| `OLLAMA_TIMEOUT` | Ollama request timeout (ms) |
| `OCR_MODEL_DEFAULT` | Default OCR model |
| `OCR_MODEL_HANDWRITTEN` | Handwriting OCR model |
| `OCR_MODEL_TABLE` | Table OCR model |
| `OCR_MODEL_FIGURE` | Figure OCR model |
| `OCR_ENABLE_FALLBACK` | Cloud fallback if Ollama fails |
| `OCR_FALLBACK_MODEL` | Fallback cloud model |
| `PISTON_URL` | Piston code execution endpoint |
| `SEARCH_API_URL` | SearXNG search endpoint |
| `SERPER_API_KEY` | Serper.dev search API key (paid) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | Twilio WhatsApp number |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | SMTP from address |
| `NEXT_PUBLIC_PRODUCT_MODE` | White-label mode (`default` or `nexus`) |
| `MASTRA_MEMORY_ENABLED` | Enable Mastra-style memory |
| `CLAIMS_SERVICE_API_KEY` | External claims API key |

See `.env.example` for full documentation and example configurations.

---

## Available Scripts

### Development

```bash
bun dev              # Start development server (with Socket.io)
bun dev:next         # Start Next.js dev server only
bun build            # Build for production
bun start            # Start production server
bun lint             # Run ESLint
```

### Testing

```bash
bun test             # Run all tests
bun test:unit        # Run unit tests
bun test:integration # Run integration tests (requires PostgreSQL)
bun test:watch       # Watch mode
bun test:chat        # Test chat systems
bun test:models      # Test model integrations
```

### Database

```bash
bun db:push          # Push schema to database (no migration)
bun db:migrate       # Run migrations (dev)
bun db:migrate:deploy # Run migrations (production)
bun db:seed          # Seed initial data
bun db:seed:all      # Core seed + marketplace seeds
bun db:seed:marketplace  # Seed marketplace catalogs
bun db:studio        # Open Prisma Studio
bun db:generate      # Generate Prisma client
bun db:cleanup       # Clean up old conversations
bun db:reset-memory  # Reset memory storage
```

### Docker

```bash
bun docker:up        # Start all containers
bun docker:down      # Stop all containers
bun docker:logs      # Tail container logs
```

### Setup

```bash
bun setup            # All-in-one: docker:up + setup:db
bun setup:clean      # Clean setup: docker:up + db:push + fresh seed
bun setup:db         # Database: wait + migrate + generate + seed
bun setup:db:clean   # Clean database: wait + push + generate + force seed
```

### RAG & Knowledge

```bash
bun rag:ingest       # Ingest knowledge base documents
bun rag:ingest:r3f   # Ingest R3F docs
bun rag:test         # Test RAG retrieval
```

### Migrations

```bash
bun migrate:s3           # Migrate files to S3
bun migrate:s3:dry-run   # Dry run S3 migration
bun migrate:knowledge:rustfs         # Migrate knowledge to RustFS
bun migrate:knowledge:rustfs:dry-run # Dry run knowledge migration
```

### Compliance Checks

```bash
bun check:thin-routes        # Validate API route thickness
bun check:domain-imports     # Validate feature isolation
bun check:frontend-compliance # Validate RSC compliance
bun check:release-compat     # Validate release compatibility
```

### Digital Employee Image

```bash
# Build the employee container image from the repo root
docker build -f docker/employee/Dockerfile .
```

### OCR Models

```bash
# Pull models after docker:up
docker exec -it rantai-agents-ollama ollama pull glm-ocr          # 4 GB+ VRAM
docker exec -it rantai-agents-ollama ollama pull moondream         # CPU-only
docker exec -it rantai-agents-ollama ollama pull minicpm-v:4.5     # 16 GB+ VRAM
```

---

## Architecture

### Platform Overview

```
+--------------+  +---------------+  +------------+  +----------------+
|  Web Portal  |  |   WhatsApp    |  |   Widget   |  |   Webhooks     |
+------+-------+  +-------+-------+  +-----+------+  +-------+--------+
       |                  |               |                   |
       +------------------+---------------+-------------------+
                                |
                       +--------v--------+
                       |  Next.js API    |
                       |  (Auth + Org)   |
                       +--------+--------+
                                |
           +--------------------+--------------------+
           |                    |                    |
    +------v------+    +--------v--------+   +------v------+
    |  Assistants |    | Digital         |   |  Pipelines  |
    |  (Chat/RAG) |    | Employees       |   |  (Workflows)|
    +-------------+    | (Docker +       |   +-------------+
                       |  RantaiClaw)    |
                       +-----------------+
```

### Agent Conversation Flow

```
User Message -> AI Agent (RAG-Enhanced) -> Response
                      |
               [Escalation Needed?]
                      |
         Human Operator Queue -> Operator Accepts -> Live Chat
                      |
               [Resolution] -> Conversation Closed
```

### Data Flow

```
+-------------------+     +-------------------+     +-------------------+
|   PostgreSQL 16   |     |    SurrealDB      |     |     RustFS        |
|   (Prisma ORM)    |     |  (Vector Store)   |     |  (S3 Storage)     |
+-------------------+     +-------------------+     +-------------------+
| Employees         |     | Document chunks   |     | Uploaded files    |
| Conversations     |     | Embeddings        |     | Knowledge docs    |
| Workflows         |     | Semantic search   |     | Employee packages |
| Credentials       |     |                   |     | Avatars           |
| Audit logs        |     |                   |     |                   |
| Organizations     |     |                   |     |                   |
+-------------------+     +-------------------+     +-------------------+
```

---

## API Endpoints (Key Routes)

### Digital Employees

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/dashboard/digital-employees` | List / create employees |
| GET/PATCH/DELETE | `/api/dashboard/digital-employees/[id]` | Manage employee |
| POST | `/api/dashboard/digital-employees/[id]/chat` | Streaming chat |
| GET/POST | `/api/dashboard/digital-employees/[id]/integrations` | Integrations |
| GET/POST/DELETE | `/api/dashboard/digital-employees/[id]/workspace` | Workspace files |
| GET | `/api/dashboard/digital-employees/[id]/vnc` | VNC stream proxy |
| GET | `/api/dashboard/digital-employees/pending-approvals` | Approval queue |

### Groups & Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/dashboard/groups` | List / create groups |
| GET/PATCH/DELETE | `/api/dashboard/groups/[id]` | Manage group |
| GET/POST | `/api/runtime/messages/send` | Send messages |
| GET | `/api/runtime/messages/inbox` | Message inbox |

### Pipelines & Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/dashboard/workflows` | List / create workflows |
| POST | `/api/dashboard/workflows/[id]/run` | Execute workflow |
| GET/POST | `/api/dashboard/templates` | List / create templates |

### Marketplace

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/marketplace` | Browse marketplace catalog |
| GET/POST | `/api/dashboard/skills` | Skill management |
| GET/POST | `/api/dashboard/tools` | Tool management |
| GET/POST | `/api/dashboard/mcp-servers` | MCP server management |

### Audit, Search & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/audit` | Query audit log |
| GET | `/api/dashboard/search` | Full-text search |
| GET | `/api/dashboard/statistics` | Usage analytics |
| GET | `/api/dashboard/models` | Available LLM models |

### Credentials & Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/dashboard/credentials` | Credential CRUD |
| GET/POST | `/api/dashboard/embed-keys` | Widget API keys |
| GET/POST | `/api/dashboard/agent-api-keys` | Agent API keys |
| GET/POST | `/api/dashboard/mcp-api-keys` | MCP API keys |

### Runtime (Agent-Accessible)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/runtime/employees/[id]/heartbeat` | Employee heartbeat |
| POST | `/api/runtime/tools/execute` | Execute platform tools |
| GET/POST | `/api/runtime/skills/search` | Search/install ClawHub skills |
| POST | `/api/runtime/goals/update` | Update goal progress |
| POST | `/api/runtime/onboarding/report` | Submit onboarding report |
| GET/POST | `/api/runtime/integrations` | Integration management |
| GET | `/api/runtime/approvals` | Pending approvals |
| POST | `/api/runtime/audit` | Log audit events |

### External APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/chat/completions` | OpenAI-compatible chat API |
| POST | `/api/webhooks/whatsapp/[employeeId]` | Meta Cloud API webhook |
| POST | `/api/webhooks/employees/[token]` | Employee webhook endpoint |
| POST | `/api/widget/chat` | Embeddable widget chat |
| GET | `/api/widget/config` | Widget configuration |

### Cron Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron/workflows` | Execute scheduled workflows |
| GET | `/api/cron/approvals` | Handle approval timeouts |
| GET | `/api/cron/cleanup-attachments` | Storage cleanup |
| GET | `/api/cron/sync-models` | Sync LLM model catalog |

---

## Embeddable Widget

```html
<script>
  window.RantAIConfig = {
    apiKey: 'your-embed-api-key',
    theme: 'light',
    position: 'bottom-right'
  };
</script>
<script src="https://your-domain.com/widget.js"></script>
```

Features: API key validation, domain whitelisting, customizable theme/position/messages, rate limiting, usage analytics, file upload, human handoff escalation.

---

## Troubleshooting

- **`Unable to acquire lock at .next/dev/lock`**: Another dev server is running. Stop the old process before rerunning.
- **`bun install --frozen-lockfile` failure**: Lockfile drift. Regenerate locally and commit `bun.lock`.
- **GHCR push denied**: Ensure repository Actions permissions allow package write.
- **Compatibility check failed**: Ensure `release-compat.json` includes the target `vX.Y.Z` and exact current submodule SHAs.
- **Upstream RantaiClaw check gate failed**: Ensure pinned `packages/rantaiclaw` commit has successful required checks (default: `CI Required Gate`) in `RantAIClaw`.
- **Integration tests fail in CI**: Validate Prisma schema and DB setup against CI `postgres:16` service.
- **Ollama models not loading**: Ensure the container is running (`docker ps`) and pull models with `docker exec`.
- **Piston runtimes unavailable**: Install language runtimes after first start (see Quick Start step 4).
- **SurrealDB connection refused**: Check WebSocket endpoint matches `SURREAL_DB_URL` in `.env`.
- **S3/RustFS upload fails**: Verify RustFS is running and bucket exists (`S3_BUCKET` in `.env`).

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run compliance checks: `bun check:thin-routes && bun check:domain-imports && bun check:frontend-compliance`
5. Run tests: `bun test`
6. Run linting: `bun lint`
7. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed architecture guidelines, code style, and the vertical feature slice pattern.

## License

Proprietary -- All rights reserved.

---

Built with Next.js, RantaiClaw, Vercel AI SDK, Prisma, SurrealDB, and OpenRouter.
