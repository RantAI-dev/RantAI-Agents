# RantAI Agents

Enterprise-grade AI agent platform for building intelligent, knowledge-driven applications with RAG capabilities, multi-channel communication, and human-in-the-loop workflows.

## Overview

RantAI Agents is a flexible AI agent platform that enables organizations to build and deploy intelligent agents powered by large language models. Whether you're building customer support bots, internal knowledge assistants, or domain-specific AI applications, RantAI Agents provides the infrastructure to create, manage, and scale AI-powered solutions.

### Key Features

- **AI Agent Framework** - Build configurable AI assistants with custom system prompts and behaviors
- **RAG Pipeline** - Advanced retrieval-augmented generation with hybrid search and semantic reranking
- **Knowledge Base Management** - Document ingestion, categorization, and intelligent chunking
- **Document Intelligence** - Entity extraction and knowledge graph visualization
- **Multi-Channel Deployment** - Deploy agents across web, WhatsApp, email, and embeddable widgets
- **Human-in-the-Loop** - Seamless handoff between AI agents and human operators
- **Real-Time Communication** - Socket.io powered live interactions
- **Embeddable Widget** - Drop-in chat widget for any website

### Use Cases

- **Customer Support** - Automated support with knowledge base integration and agent handoff
- **Internal Knowledge Assistant** - Help employees find information across company documents
- **Domain-Specific Agents** - Build specialized agents for insurance, healthcare, legal, etc.
- **Lead Qualification** - Intelligent chatbots that qualify and route leads
- **FAQ Automation** - Self-service answers powered by your documentation

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, Radix UI, Zustand |
| **Backend** | Next.js API Routes, NextAuth.js v5, Socket.io |
| **AI/LLM** | OpenRouter API, OpenAI Embeddings |
| **Databases** | PostgreSQL 16 (Prisma ORM), SurrealDB (Vector Store) |
| **Integrations** | Twilio (WhatsApp), Nodemailer (Email), Salesforce CRM |

## Prerequisites

- Node.js v18+
- pnpm v10.21.0+
- Docker & Docker Compose
- OpenRouter API key

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd RantAI-Agents
pnpm install
```

### 2. Environment Setup

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://horizonlife:horizonlife_secret@localhost:5432/horizonlife_insurance?schema=public"

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
# Start PostgreSQL and SurrealDB containers
pnpm docker:up

# Initialize database
pnpm db:push
pnpm db:generate
pnpm db:seed
```

Or use the all-in-one setup command:

```bash
pnpm setup
```

### 4. Run Development Server

```bash
pnpm dev
```

Access the application:
- **Dashboard**: http://localhost:3000/dashboard
- **Operator Login**: http://localhost:3000/agent/login

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API endpoints
│   │   ├── chat/          # Agent chat API
│   │   ├── conversations/ # Conversation management
│   │   ├── dashboard/     # Dashboard APIs
│   │   ├── widget/        # Embeddable widget API
│   │   ├── assistants/    # AI agent management
│   │   └── whatsapp/      # WhatsApp channel
│   └── dashboard/         # Management dashboard
│       ├── agent/         # Operator workspace
│       ├── knowledge/     # Knowledge base management
│       ├── assistants/    # AI agent configuration
│       └── settings/      # Platform settings
├── lib/                   # Core business logic
│   ├── rag/              # RAG implementation
│   │   ├── embeddings.ts # Embedding generation
│   │   ├── vector-store.ts # SurrealDB operations
│   │   ├── retriever.ts  # Context retrieval
│   │   ├── hybrid-search.ts # Hybrid search
│   │   ├── smart-chunker.ts # Semantic chunking
│   │   └── reranker.ts   # Result reranking
│   ├── channels/         # Multi-channel deployment
│   ├── document-intelligence/ # Entity extraction
│   ├── assistants/       # AI agent logic
│   └── surrealdb/        # SurrealDB client
├── components/           # React UI components
├── prisma/               # Database schema & migrations
├── scripts/              # Utility scripts
├── widget/               # Embeddable chat widget
└── knowledge-base/       # Sample knowledge documents
```

## Available Scripts

### Development

```bash
pnpm dev              # Start development server with custom server
pnpm dev:next         # Start Next.js dev server only
pnpm build            # Build for production
pnpm start            # Start production server
```

### Database

```bash
pnpm db:push          # Push schema to database
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed initial data
pnpm db:studio        # Open Prisma Studio
pnpm db:generate      # Generate Prisma client
```

### RAG & Knowledge Base

```bash
pnpm rag:ingest       # Ingest documents from knowledge-base/
pnpm rag:test         # Test RAG functionality
```

### Docker

```bash
pnpm docker:up        # Start Docker containers
pnpm docker:down      # Stop containers
pnpm docker:logs      # View container logs
```

## Architecture

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

### RAG Pipeline

1. **Document Ingestion** - Upload documents to knowledge base
2. **Chunking** - Split documents into semantic chunks
3. **Embedding** - Generate vector embeddings (OpenAI)
4. **Storage** - Store vectors in SurrealDB
5. **Retrieval** - Semantic + keyword hybrid search
6. **Reranking** - LLM-based relevance scoring
7. **Generation** - Context-aware response generation

### Platform Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Web Portal │     │  WhatsApp   │     │   Widget    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Unified   │
                    │  Agent API  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌───▼───┐ ┌─────▼─────┐
       │  LLM Engine │ │  RAG  │ │  Human    │
       │ (OpenRouter)│ │       │ │  Handoff  │
       └─────────────┘ └───────┘ └───────────┘
```

## API Endpoints

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Main chat endpoint (streaming) |
| POST | `/api/widget/chat` | Widget chat (CORS-enabled) |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/[id]` | Get conversation |
| POST | `/api/conversations/[id]/messages` | Add message |

### Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/knowledge` | List documents |
| POST | `/api/dashboard/knowledge` | Upload document |
| GET | `/api/dashboard/knowledge/[id]` | Get document |
| DELETE | `/api/dashboard/knowledge/[id]` | Delete document |

### WebSocket Events

Connect to `/api/socket` for real-time communication:

- `chat:join` - Join conversation room
- `chat:message` - Send/receive messages
- `chat:request-agent` - Request human operator escalation
- `agent:accept` - Operator accepts conversation
- `agent:status` - Operator status updates

## Embeddable Widget

Deploy your AI agent on any website with the embeddable widget:

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

### Widget Features

- **API Key Validation** - Secure access with domain whitelisting
- **Customization** - Theme, position, welcome message, avatar
- **Rate Limiting** - Per-IP request limits
- **Usage Analytics** - Track conversations and interactions

## Configuration

### Feature Flags

Enable/disable features via the admin dashboard:

- Multi-channel support
- Document intelligence
- Knowledge graph visualization
- Analytics tracking

### Channel Configuration

Deploy your AI agents across multiple channels:

| Channel | Configuration |
|---------|---------------|
| Web Portal | Built-in dashboard interface |
| Widget | Embeddable snippet with API key |
| WhatsApp | Twilio Account SID, Auth Token, Phone Number |
| Email | SMTP settings via Nodemailer |
| Salesforce | OAuth credentials, Session management |

## Database Schema

Key models in Prisma:

- **Agent** - Human operators who can handle escalated conversations
- **Customer** - End users interacting with AI agents
- **Conversation** - Chat sessions with status tracking
- **Message** - Individual messages (USER, ASSISTANT, AGENT, SYSTEM)
- **Document** - Knowledge base documents for RAG
- **Assistant** - Configurable AI agents with custom prompts and behaviors
- **EmbedApiKey** - Widget API keys with domain whitelisting
- **ChannelConfig** - Multi-channel deployment configuration
- **FeatureConfig** - Feature flags for enabling/disabling capabilities

## Development

### HTTPS Development

For local HTTPS development:

```bash
pnpm dev:https:setup
pnpm dev
```

### Testing

```bash
pnpm test:models     # Test LLM connectivity
pnpm rag:test        # Test RAG functionality
pnpm lint            # Run ESLint
```

### Database Management

```bash
pnpm db:studio       # Open Prisma Studio GUI
pnpm db:cleanup      # Clean old conversations
```

## Deployment

### Production Build

```bash
pnpm build
pnpm start
```

### Docker Deployment

The project includes Docker Compose configuration for PostgreSQL and SurrealDB. For production, configure appropriate credentials and volumes.

### Environment Variables

Ensure all production environment variables are set:

- Strong `NEXTAUTH_SECRET`
- Production `DATABASE_URL`
- Secure API keys
- Proper `NEXTAUTH_URL`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting: `pnpm lint`
5. Submit a pull request

## License

Proprietary - All rights reserved.

---

Built with Next.js, Prisma, SurrealDB, and OpenRouter API.
