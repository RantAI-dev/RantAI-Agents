# RantAI Agents

Enterprise-grade AI agent platform for building and deploying autonomous digital employees with RAG capabilities, multi-channel communication, and human-in-the-loop workflows.

## Overview

RantAI Agents enables organizations to create, manage, and orchestrate intelligent AI agents powered by large language models. It combines a traditional assistant/chatbot platform with a full **Digital Employee** layer — autonomous agents that run in isolated Docker containers, execute tools, use integrations, and collaborate with each other and with humans.

### Key Features

- **Digital Employees** — Autonomous AI agents running in isolated Docker containers via the RantaiClaw Rust framework
- **Graduated Autonomy (L1–L4)** — Configurable trust levels from fully supervised to fully autonomous
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

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, Radix UI, Zustand |
| **Backend** | Next.js API Routes, NextAuth.js v5, Socket.io |
| **AI/LLM** | Vercel AI SDK v6, OpenRouter API, OpenAI Embeddings, Ollama (Local OCR) |
| **Agent Runtime** | RantaiClaw (Rust), Docker / Dockerode |
| **Databases** | PostgreSQL 16 (Prisma ORM), SurrealDB (Vector Store) |
| **Storage** | RustFS (S3-compatible object storage) |
| **Workflows** | XYFlow (visual DAG builder) |
| **Integrations** | Twilio, Meta Cloud API, Nodemailer, Salesforce CRM |

---

## Prerequisites

### Required

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | v18+ | v20+ recommended |
| **bun** | latest | Package manager (`npm install -g bun`) |
| **Docker** | v20+ | With Docker Compose v2 |
| **OpenRouter API Key** | — | Get at [openrouter.ai/keys](https://openrouter.ai/keys) |

### Hardware Requirements

#### Minimum (Cloud OCR Only)
- 2 CPU cores, 4 GB RAM
- No GPU required (uses OpenRouter for OCR fallback)

#### Recommended (Local OCR)

| Setup | RAM | GPU VRAM | OCR Model |
|-------|-----|----------|-----------|
| **CPU-Only** | 8 GB+ | None | `moondream` or `qwen3-vl:2b` |
| **Budget GPU** | 8 GB+ | 4–6 GB | `glm-ocr` (recommended) |
| **Mid-Range GPU** | 16 GB+ | 8–12 GB | `glm-ocr` + `qwen3-vl:8b` |
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
git submodule update --init --recursive   # pull RantaiClaw
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
# Start PostgreSQL, SurrealDB, RustFS, and Ollama containers
bun docker:up

# Initialize database
bun db:push
bun db:generate
bun db:seed
```

Or use the all-in-one setup command:

```bash
bun setup
```

### 4. Run Development Server

```bash
bun dev
```

Access the application:
- **Dashboard**: http://localhost:3000/dashboard
- **Operator Login**: http://localhost:3000/agent/login

---

## Project Structure

```
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── dashboard/
│   │   │   ├── digital-employees/   # Digital employee CRUD + chat + workspace
│   │   │   │   └── [id]/
│   │   │   │       ├── chat/        # Streaming agentic chat
│   │   │   │       ├── integrations/ # Credential management
│   │   │   │       ├── vnc/         # VNC remote desktop proxy
│   │   │   │       └── workspace/   # File explorer & shell
│   │   │   ├── groups/              # Employee group management
│   │   │   ├── pipelines/           # Workflow pipelines
│   │   │   ├── templates/           # Employee templates
│   │   │   ├── messages/            # Inter-employee messaging
│   │   │   ├── audit/               # Audit log API
│   │   │   └── marketplace/         # Marketplace catalog
│   │   ├── runtime/
│   │   │   └── employees/[id]/      # Runtime heartbeat & status
│   │   └── webhooks/
│   │       └── whatsapp/            # Meta Cloud API webhook
│   └── dashboard/
│       ├── digital-employees/       # Employee management UI
│       ├── groups/                  # Group management UI
│       ├── messages/                # Message center UI
│       ├── marketplace/             # Skill/tool marketplace
│       └── settings/
│           └── mcp/                 # MCP server configuration
├── lib/
│   ├── digital-employee/
│   │   ├── orchestrator.ts          # Lifecycle orchestration
│   │   ├── docker-orchestrator.ts   # Docker container management
│   │   ├── integrations.ts          # Integration registry (20+ connectors)
│   │   ├── package-generator.ts     # Employee package builder
│   │   ├── workspace-proxy.ts       # Workspace API proxy
│   │   ├── types.ts                 # All platform types
│   │   └── shared-constants.ts      # Shared enums and constants
│   ├── rag/                         # RAG pipeline (chunker, embeddings, retriever)
│   ├── ocr/                         # OCR pipeline (Ollama + OpenRouter fallback)
│   └── mcp/                         # MCP client manager
├── docker/
│   └── employee/
│       ├── Dockerfile               # Employee container image
│       └── agent-runner/
│           ├── index.js             # Agent bootstrap and lifecycle
│           └── tools.js             # Platform tool implementations
├── packages/
│   └── rantaiclaw/                  # RantaiClaw Rust agent framework (submodule)
├── hooks/                           # React data hooks
├── components/                      # Shared UI components
└── prisma/                          # Database schema & migrations
```

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
DRAFT → ONBOARDING → ACTIVE → PAUSED / SUSPENDED
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
- **File Explorer** — Browse, edit, and delete workspace files
- **Shell Access** — Execute commands in the employee container
- **VNC Desktop** — Stream a graphical desktop view of the employee's session

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

---

## Pipelines & Workflows

Visual drag-and-drop pipeline builder (XYFlow) with node types:

- **Tool** — Execute a bound tool
- **Integration** — Call an external service
- **Approval** — Human approval gate (blocks until approved)
- **Condition** — Branching logic
- **Handoff** — Escalate to a human operator

Pipelines support variables, input/output validation, run tracking, and import/export.

---

## MCP (Model Context Protocol)

Connect any MCP-compatible server to extend tool capabilities:

1. Add the server in **Settings → MCP Servers** (stdio or HTTP transport)
2. Bind it to an assistant or employee
3. Tools are auto-discovered and made available in chat

---

## Knowledge Base & OCR

### Document Support
PDF, PNG/JPG, markdown, Word (.docx), Excel (.xlsx), RTF

### OCR Pipeline

| Model | VRAM | Best For |
|-------|------|----------|
| **GLM-OCR** | 2–3 GB | Tables, printed text (94.62% OmniDocBench) |
| **Moondream** | 3–4 GB | CPU-friendly basic OCR |
| **Qwen3-VL 2B** | 4 GB | Multilingual, CPU-friendly |
| **Qwen3-VL 8B** | 6–8 GB | Complex layouts |
| **MiniCPM-V 4.5** | 10–12 GB | Handwritten documents (SOTA) |

Scanned PDFs are auto-detected. Cloud fallback via OpenRouter if Ollama is unavailable.

---

## Audit & Compliance

Every significant action is logged with:
- Resource type and ID
- User or employee performing the action
- Risk level: low / medium / high / critical
- IP address and detailed metadata

Audit logs are viewable and filterable in the dashboard. Data retention policies and full export are available for compliance needs.

---

## Available Scripts

### Development

```bash
bun dev              # Start development server
bun build            # Build for production
bun start            # Start production server
bun lint             # Run ESLint
```

### Database

```bash
bun db:push          # Push schema to database
bun db:migrate       # Run migrations
bun db:seed          # Seed initial data
bun db:studio        # Open Prisma Studio
bun db:generate      # Generate Prisma client
```

### Docker

```bash
bun docker:up        # Start containers (PostgreSQL, SurrealDB, RustFS, Ollama)
bun docker:down      # Stop containers
bun docker:logs      # View container logs
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
┌────────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────────┐
│ Web Portal │  │  WhatsApp   │  │  Widget  │  │  Webhooks    │
└─────┬──────┘  └──────┬──────┘  └────┬─────┘  └──────┬───────┘
      │                │              │                │
      └────────────────┴──────────────┴────────────────┘
                                │
                       ┌────────▼────────┐
                       │  Next.js API    │
                       │  (Auth + Org)   │
                       └────────┬────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
    ┌──────▼──────┐    ┌────────▼────────┐   ┌──────▼──────┐
    │  Assistants │    │ Digital         │   │  Pipelines  │
    │  (Chat/RAG) │    │ Employees       │   │  (Workflows)│
    └─────────────┘    │ (Docker +       │   └─────────────┘
                       │  RantaiClaw)    │
                       └─────────────────┘
```

### Agent Conversation Flow

```
User Message → AI Agent (RAG-Enhanced) → Response
                      ↓
               [Escalation Needed?]
                      ↓
         Human Operator Queue → Operator Accepts → Live Chat
                      ↓
               [Resolution] → Conversation Closed
```

### Digital Employee Runtime

```
Dashboard → package-generator → employee-package.json
                                       ↓
                               Docker Container
                               (RantaiClaw binary)
                                       ↓
                        Gateway (0.0.0.0, paired tokens)
                                       ↓
                          agent-runner (Node.js)
                          ├── tools.js (platform tools)
                          └── HTTP proxy → platform API
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

### Groups & Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/dashboard/groups` | List / create groups |
| GET/POST | `/api/dashboard/messages` | List / send messages |

### Pipelines & Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/dashboard/pipelines` | List / create pipelines |
| POST | `/api/dashboard/pipelines/[id]/run` | Execute pipeline |
| GET/POST | `/api/dashboard/templates` | List / create templates |

### Audit & Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/audit` | Query audit log |
| POST | `/api/webhooks/whatsapp` | Meta Cloud API webhook |
| GET | `/api/runtime/employees/[id]/heartbeat` | Employee heartbeat |

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

Features: API key validation, domain whitelisting, customizable theme/position/messages, rate limiting, usage analytics.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting: `bun lint`
5. Submit a pull request

## License

Proprietary — All rights reserved.

---

Built with Next.js, RantaiClaw, Prisma, SurrealDB, and OpenRouter.
