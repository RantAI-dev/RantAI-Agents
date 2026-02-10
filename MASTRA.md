# RantAI Agentic Platform Evolution

## Vision

Transform RantAI-Agents from a chat platform into a **full agentic AI platform** with:

- SOTA chat with full memory system (semantic, working, long-term)
- Visual agent/workflow builder (drag-and-drop canvas)
- MCP integration for extensible tools
- Agentic tools that agents can use autonomously

**Approach**: Hybrid - Use Mastra packages for core capabilities, custom UI/integrations on top

---

## Implementation Roadmap

### Phase 1: SOTA Chat with Full Memory System ⭐ FIRST PRIORITY

#### 1.1 Install Mastra Memory Packages

```bash
pnpm add @mastra/core @mastra/memory @mastra/libsql
```

#### 1.2 Memory Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Memory System                       │
├────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  Working    │  │  Semantic   │  │   Long-term     │ │
│  │  Memory     │  │  Recall     │  │   Memory        │ │
│  ├─────────────┤  ├─────────────┤  ├─────────────────┤ │
│  │ Current     │  │ Vector      │  │ User Profile    │ │
│  │ context,    │  │ search of   │  │ Preferences     │ │
│  │ entities,   │  │ past        │  │ Facts learned   │ │
│  │ facts       │  │ messages    │  │ Interaction     │ │
│  │             │  │ by meaning  │  │ history         │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│         │                │                  │          │
│         └────────────────┼──────────────────┘          │
│                          ▼                             │
│                   ┌─────────────┐                      │
│                   │  LibSQL /   │                      │
│                   │  PostgreSQL │                      │
│                   └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

#### 1.3 Memory Types Implementation

**Working Memory** - Track entities and facts in current conversation:

```typescript
// lib/memory/working-memory.ts
interface WorkingMemory {
  entities: Map<string, Entity>; // People, products, dates mentioned
  facts: Map<string, Fact>; // "User has 2 kids", "Budget is 500k"
  context: ConversationContext; // Current topic, intent, sentiment
}
```

**Semantic Recall** - Find relevant past messages:

```typescript
// lib/memory/semantic-memory.ts
import { Memory } from "@mastra/memory";

const semanticMemory = new Memory({
  storage: storageProvider,
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 5, // Retrieve top 5 similar messages
      messageRange: { before: 3, after: 1 },
    },
  },
});
```

**Long-term Memory** - Persistent user profiles:

```typescript
// lib/memory/long-term-memory.ts
interface UserProfile {
  id: string;
  facts: Fact[]; // Learned facts about user
  preferences: Preference[]; // Communication style, topics
  interactionSummary: string; // LLM-generated summary
  lastUpdated: Date;
}
```

#### 1.4 Database Schema Updates

```prisma
// prisma/schema.prisma additions

model UserMemory {
  id          String   @id @default(cuid())
  userId      String
  type        MemoryType // WORKING, SEMANTIC, LONG_TERM
  key         String
  value       Json
  embedding   Float[]? // For semantic search
  confidence  Float?
  source      String?  // Which conversation/message
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  expiresAt   DateTime? // For working memory TTL

  user        User     @relation(fields: [userId], references: [id])

  @@index([userId, type])
  @@index([key])
}

enum MemoryType {
  WORKING
  SEMANTIC
  LONG_TERM
}
```

#### 1.5 Integration with Chat Flow

```typescript
// Updated chat flow
async function chat(message: string, userId: string, threadId: string) {
  // 1. Load working memory for current session
  const workingMemory = await loadWorkingMemory(threadId);

  // 2. Semantic recall of relevant past messages
  const relevantHistory = await semanticMemory.recall(message, {
    resourceId: userId,
    threadId: threadId,
    topK: 5,
  });

  // 3. Load long-term user profile
  const userProfile = await loadUserProfile(userId);

  // 4. Inject into system prompt
  const enhancedPrompt = buildPromptWithMemory(
    basePrompt,
    workingMemory,
    relevantHistory,
    userProfile
  );

  // 5. Generate response
  const response = await llm.generate(enhancedPrompt, messages);

  // 6. Update memories
  await updateWorkingMemory(threadId, message, response);
  await storeForSemanticRecall(userId, threadId, message, response);
  await updateUserProfile(userId, message, response);

  return response;
}
```

#### 1.6 Files to Create/Modify

- `lib/memory/index.ts` - Memory system exports
- `lib/memory/working-memory.ts` - Working memory implementation
- `lib/memory/semantic-memory.ts` - Semantic recall with Mastra
- `lib/memory/long-term-memory.ts` - User profile management
- `lib/memory/storage.ts` - Storage provider setup
- `app/api/chat/route.ts` - Integrate memory into chat
- `prisma/schema.prisma` - Add memory models

---

### Phase 2: Agentic Tools System

#### 2.1 Tool Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Tool System                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  Built-in   │  │   Custom    │  │     MCP         │ │
│  │   Tools     │  │   Tools     │  │    Tools        │ │
│  ├─────────────┤  ├─────────────┤  ├─────────────────┤ │
│  │ Calculator  │  │ User-       │  │ External MCP    │ │
│  │ Web Search  │  │ defined     │  │ servers         │ │
│  │ RAG Search  │  │ via UI      │  │ (Wikipedia,     │ │
│  │ Code Exec   │  │             │  │  Slack, etc.)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│         │                │                  │          │
│         └────────────────┼──────────────────┘          │
│                          ▼                             │
│                   ┌─────────────┐                      │
│                   │  Tool       │                      │
│                   │  Registry   │                      │
│                   └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

#### 2.2 Tool Definition Schema

```typescript
// lib/tools/types.ts
interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: any, context: ToolContext) => Promise<ToolResult>;
  category: ToolCategory;
  requiresAuth?: boolean;
  rateLimit?: RateLimit;
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}
```

#### 2.3 Built-in Tools

```typescript
// lib/tools/builtin/index.ts
export const builtinTools = {
  calculator: calculatorTool,
  webSearch: webSearchTool,
  ragSearch: ragSearchTool, // Use existing RAG pipeline
  codeExecutor: codeExecutorTool,
  dateTime: dateTimeTool,
  jsonParser: jsonParserTool,
  httpRequest: httpRequestTool,
};
```

#### 2.4 Tool Execution in Chat

```typescript
// Agent can autonomously call tools
const response = await agent.generate(message, {
  tools: await toolRegistry.getToolsForAgent(agentId),
  maxSteps: 5, // Max tool calls before final answer
  onToolCall: (tool, params) => {
    // Log tool usage
    await logToolCall(agentId, tool, params);
  },
});
```

#### 2.5 Files to Create

```
lib/tools/
├── index.ts
├── registry.ts
├── types.ts
├── executor.ts
└── builtin/
    ├── calculator.ts
    ├── web-search.ts
    ├── rag-search.ts
    ├── code-executor.ts
    └── http-request.ts
```

---

### Phase 3: MCP Integration

#### 3.1 Install MCP Package

```bash
pnpm add @mastra/mcp
```

#### 3.2 MCP Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    RantAI Platform                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐     ┌────────────────────────────────┐  │
│  │  MCPClient │────▶│  External MCP Servers          │  │
│  │            │     │  - Wikipedia                   │  │
│  │  (Consume  │     │  - Slack                       │  │
│  │   tools)   │     │  - Google Drive                │  │
│  └────────────┘     │  - Custom enterprise tools     │  │
│                     └────────────────────────────────┘  │
│                                                          │
│  ┌────────────┐     ┌────────────────────────────────┐  │
│  │  MCPServer │◀────│  External MCP Clients          │  │
│  │            │     │  - Claude Desktop              │  │
│  │  (Expose   │     │  - Other AI agents             │  │
│  │   tools)   │     │  - Third-party apps            │  │
│  └────────────┘     └────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 3.3 MCP Client Setup

```typescript
// lib/mcp/client.ts
import { MCPClient } from "@mastra/mcp";

export const mcpClient = new MCPClient({
  servers: {
    // Pre-configured servers
    wikipedia: {
      command: "npx",
      args: ["-y", "@anthropic/mcp-wikipedia"],
    },
    filesystem: {
      command: "npx",
      args: ["-y", "@anthropic/mcp-filesystem", "/allowed/path"],
    },
    // Dynamic servers from DB config
    ...(await loadMCPServersFromDB()),
  },
});
```

#### 3.4 MCP Server (Expose RantAI tools)

```typescript
// lib/mcp/server.ts
import { MCPServer } from "@mastra/mcp";

export const mcpServer = new MCPServer({
  name: "rantai-tools",
  version: "1.0.0",
  tools: {
    searchKnowledge: ragSearchTool,
    getInsuranceQuote: quoteTool,
    // Expose RantAI capabilities to external clients
  },
});
```

#### 3.5 MCP Management UI

- List connected MCP servers
- Add/remove MCP servers
- View available tools from each server
- Test tool execution
- Manage credentials

#### 3.6 Files to Create

```
lib/mcp/
├── index.ts
├── client.ts
├── server.ts
└── config.ts
```

---

### Phase 4: Visual Agent/Workflow Builder

#### 4.1 Technology Choice

**React Flow** - Most mature, great DX, used by n8n

```bash
pnpm add @xyflow/react
```

#### 4.2 Builder Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Visual Workflow Builder                 │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │                    Canvas                        │   │
│  │  ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐      │   │
│  │  │Start│───▶│Agent│───▶│Tool │───▶│ End │      │   │
│  │  └─────┘    └─────┘    └─────┘    └─────┘      │   │
│  │                 │                               │   │
│  │                 ▼                               │   │
│  │            ┌─────────┐                          │   │
│  │            │Condition│                          │   │
│  │            └────┬────┘                          │   │
│  │           ┌─────┴─────┐                         │   │
│  │           ▼           ▼                         │   │
│  │      ┌─────┐     ┌─────┐                        │   │
│  │      │Path1│     │Path2│                        │   │
│  │      └─────┘     └─────┘                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Node Palette │  │  Properties  │  │   Variables  │  │
│  │  - Trigger   │  │  Panel       │  │   Panel      │  │
│  │  - Agent     │  │              │  │              │  │
│  │  - Tool      │  │  [Selected   │  │  input       │  │
│  │  - Condition │  │   node       │  │  output      │  │
│  │  - Loop      │  │   config]    │  │  context     │  │
│  │  - Human     │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

#### 4.3 Node Types

```typescript
// lib/workflow/nodes.ts
enum NodeType {
  // Triggers
  TRIGGER_MANUAL = "trigger_manual",
  TRIGGER_WEBHOOK = "trigger_webhook",
  TRIGGER_SCHEDULE = "trigger_schedule",
  TRIGGER_EVENT = "trigger_event",

  // AI
  AGENT = "agent", // Run an AI agent
  LLM = "llm", // Direct LLM call
  PROMPT = "prompt", // Prompt template

  // Tools
  TOOL = "tool", // Execute a tool
  MCP_TOOL = "mcp_tool", // MCP tool
  CODE = "code", // Custom code execution
  HTTP = "http", // HTTP request

  // Flow Control
  CONDITION = "condition", // If/else branching
  SWITCH = "switch", // Multi-way branch
  LOOP = "loop", // Iterate over array
  PARALLEL = "parallel", // Run in parallel
  MERGE = "merge", // Merge parallel paths

  // Human
  HUMAN_INPUT = "human_input", // Wait for human input
  APPROVAL = "approval", // Require approval
  HANDOFF = "handoff", // Hand to human agent

  // Data
  TRANSFORM = "transform", // Transform data
  FILTER = "filter", // Filter data
  AGGREGATE = "aggregate", // Combine data

  // Integration
  RAG_SEARCH = "rag_search", // Knowledge base search
  DATABASE = "database", // DB operations
  STORAGE = "storage", // File storage ops
}
```

#### 4.4 Workflow Data Model

```prisma
// prisma/schema.prisma additions

model Workflow {
  id              String   @id @default(cuid())
  name            String
  description     String?

  // Canvas data (React Flow format)
  nodes           Json     // Node positions, types, configs
  edges           Json     // Connections between nodes

  // Metadata
  trigger         Json     // How workflow is triggered
  variables       Json     // Input/output schema

  // Status
  status          WorkflowStatus @default(DRAFT)
  version         Int      @default(1)

  // Relations
  organizationId  String
  createdBy       String
  runs            WorkflowRun[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model WorkflowRun {
  id              String   @id @default(cuid())
  workflowId      String
  status          RunStatus
  input           Json
  output          Json?
  error           String?

  // Execution trace
  steps           Json     // Step-by-step execution log
  startedAt       DateTime @default(now())
  completedAt     DateTime?

  workflow        Workflow @relation(fields: [workflowId], references: [id])
}

enum WorkflowStatus {
  DRAFT
  ACTIVE
  PAUSED
  ARCHIVED
}

enum RunStatus {
  PENDING
  RUNNING
  PAUSED      // Waiting for human input
  COMPLETED
  FAILED
}
```

#### 4.5 Workflow Execution Engine

```typescript
// lib/workflow/engine.ts
import { createWorkflow, createStep } from "@mastra/core/workflow";

class WorkflowEngine {
  async execute(workflow: Workflow, input: any): Promise<WorkflowRun> {
    // Convert visual workflow to Mastra workflow
    const mastraWorkflow = this.compileWorkflow(workflow);

    // Execute with Mastra's durable execution
    const run = await mastraWorkflow.start(input);

    // Track execution
    await this.trackRun(workflow.id, run);

    return run;
  }

  private compileWorkflow(workflow: Workflow) {
    // Convert React Flow nodes/edges to Mastra workflow
    const { nodes, edges } = workflow;
    // ... compilation logic
  }
}
```

#### 4.6 Builder UI Components

```
app/dashboard/workflows/
├── page.tsx                    # Workflow list
├── [id]/
│   ├── page.tsx               # Workflow editor
│   └── _components/
│       ├── canvas.tsx         # React Flow canvas
│       ├── node-palette.tsx   # Draggable node types
│       ├── properties-panel.tsx # Node configuration
│       ├── variables-panel.tsx  # Input/output vars
│       ├── toolbar.tsx        # Save, run, debug
│       └── nodes/
│           ├── agent-node.tsx
│           ├── tool-node.tsx
│           ├── condition-node.tsx
│           ├── human-node.tsx
│           └── ...
```

---

## Files to Create (Summary)

### Phase 1: Memory System

```
lib/memory/
├── index.ts
├── working-memory.ts
├── semantic-memory.ts
├── long-term-memory.ts
├── storage.ts
└── types.ts
```

### Phase 2: Tools System

```
lib/tools/
├── index.ts
├── registry.ts
├── types.ts
├── executor.ts
└── builtin/
    ├── calculator.ts
    ├── web-search.ts
    ├── rag-search.ts
    ├── code-executor.ts
    └── http-request.ts
```

### Phase 3: MCP

```
lib/mcp/
├── index.ts
├── client.ts
├── server.ts
└── config.ts
```

### Phase 4: Workflow Builder

```
lib/workflow/
├── index.ts
├── engine.ts
├── compiler.ts
├── nodes/
│   └── [node-type].ts
└── types.ts

app/dashboard/workflows/
├── page.tsx
├── new/page.tsx
├── [id]/
│   ├── page.tsx
│   ├── runs/page.tsx
│   └── _components/
│       └── [components].tsx
```

---

## Verification Plan

### Phase 1 Testing

1. Create test user and conversation
2. Verify working memory tracks entities ("I have 2 kids")
3. Start new session, verify semantic recall finds relevant past messages
4. Check long-term profile updates after multiple conversations

### Phase 2 Testing

1. Test each built-in tool in isolation
2. Test agent using multiple tools in one conversation
3. Verify tool rate limiting and auth

### Phase 3 Testing

1. Connect to Wikipedia MCP server
2. Test tool discovery and execution
3. Expose RantAI tool via MCP server, test with Claude Desktop

### Phase 4 Testing

1. Create simple 3-node workflow in UI
2. Execute and verify each node runs
3. Test branching with condition node
4. Test human-in-the-loop pause/resume

---

## RantAI Strengths to Keep

| Component              | Why Keep It                                           |
| ---------------------- | ----------------------------------------------------- |
| OCR Pipeline           | Best-in-class, Mastra has nothing comparable          |
| SurrealDB Vector Store | Working well, hybrid search + reranking               |
| Socket.io Handoff      | Better for live chat than Mastra's workflow pause     |
| Multi-Channel Handlers | Production-tested (WhatsApp, Email, Salesforce)       |
| HorizonLife Prompts    | Domain expertise, framework-agnostic                  |

---

## Resources

- **Mastra Docs**: https://mastra.ai/docs
- **Mastra GitHub**: https://github.com/mastra-ai/mastra
- **React Flow**: https://reactflow.dev
- **MCP Protocol**: https://modelcontextprotocol.io
