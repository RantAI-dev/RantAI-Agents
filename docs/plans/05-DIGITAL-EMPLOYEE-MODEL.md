# 05 — Digital Employee Data Model

## Concept

A Digital Employee is a **deployable bundle** that combines:
- An **Agent** (identity, personality, LLM config)
- Its attached **Workflows** (jobs it can execute)
- Its attached **Tools**, **Skills**, **MCP Servers** (capabilities)
- Its attached **Knowledge Bases** (domain expertise)
- **Deployment config** (schedule, triggers, permissions, gateway, resource limits)

The platform user "hires" a Digital Employee by configuring this bundle and deploying it to the runtime layer.

## Data Model

### DigitalEmployee

```prisma
model DigitalEmployee {
  id              String                @id @default(cuid())
  name            String                // "Marketing Manager", "Sales Researcher"
  description     String?
  avatar          String?               // URL or emoji
  status          EmployeeStatus        @default(DRAFT)

  // The agent that IS this employee
  assistantId     String
  assistant       Assistant             @relation(fields: [assistantId], references: [id])

  // Deployment configuration
  deploymentConfig Json                 // See EmployeeDeploymentConfig type below
  resourceLimits   Json?                // CPU, memory, storage, execution time limits

  // Runtime state
  runtimeId       String?               // ID of the running VM/container (null if not deployed)
  volumeId        String?               // Persistent storage volume ID
  lastActiveAt    DateTime?
  lastRunId       String?               // Most recent WorkflowRun ID

  // Gateway / supervisor
  supervisorId    String?               // User ID of the assigned supervisor
  gatewayConfig   Json?                 // See GatewayConfig type below

  // Metrics
  totalRuns       Int                   @default(0)
  successfulRuns  Int                   @default(0)
  failedRuns      Int                   @default(0)
  totalTokensUsed BigInt                @default(0)

  // Organization
  organizationId  String
  organization    Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy       String
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  // Relations
  runs            EmployeeRun[]
  approvals       EmployeeApproval[]

  @@index([organizationId])
  @@index([status])
  @@index([assistantId])
}

enum EmployeeStatus {
  DRAFT       // Being configured, not yet deployed
  ONBOARDING  // First-time setup in progress
  ACTIVE      // Deployed and running on schedule
  PAUSED      // Temporarily stopped (by user or system)
  SUSPENDED   // Stopped due to error or limit breach
  ARCHIVED    // Deactivated, data preserved
}
```

### EmployeeRun (Execution History)

```prisma
model EmployeeRun {
  id                String          @id @default(cuid())
  digitalEmployeeId String
  digitalEmployee   DigitalEmployee @relation(fields: [digitalEmployeeId], references: [id], onDelete: Cascade)

  // What triggered this run
  trigger           String          // "schedule", "webhook", "event", "manual", "approval_callback"
  triggerData       Json?           // Cron expression, event payload, etc.

  // Which workflow was executed
  workflowId        String?
  workflowRunId     String?         // FK to WorkflowRun for detailed step trace

  // Runtime info
  vmId              String?         // Firecracker VM ID
  bootTimeMs        Int?            // VM boot duration
  executionTimeMs   Int?            // Total execution duration

  // Status
  status            RunStatus       // PENDING, RUNNING, PAUSED, COMPLETED, FAILED
  output            Json?
  error             String?

  // Token usage
  promptTokens      Int             @default(0)
  completionTokens  Int             @default(0)

  startedAt         DateTime        @default(now())
  completedAt       DateTime?

  @@index([digitalEmployeeId, startedAt])
}
```

### EmployeeApproval (Human-in-the-Loop)

```prisma
model EmployeeApproval {
  id                String          @id @default(cuid())
  digitalEmployeeId String
  digitalEmployee   DigitalEmployee @relation(fields: [digitalEmployeeId], references: [id], onDelete: Cascade)

  // Run context
  employeeRunId     String
  workflowStepId    String?         // Which workflow step triggered this

  // Approval content
  requestType       String          // "publish", "send_email", "execute_action", "confirm_data"
  title             String          // "Review LinkedIn Post Draft"
  description       String?         // Detailed description of what needs approval
  content           Json            // The actual content to review (draft text, action details, etc.)
  options           Json            // Available responses: approve, reject, edit, etc.

  // Gateway delivery
  channel           String          // "telegram", "whatsapp", "discord", "slack", "email", "dashboard"
  messageId         String?         // External message ID (Telegram msg ID, etc.)
  deliveredAt       DateTime?
  deliveryError     String?

  // Response
  status            ApprovalStatus  @default(PENDING)
  respondedBy       String?         // User ID or external identifier
  response          String?         // "approved", "rejected", "edited"
  responseData      Json?           // Edited content, rejection reason, etc.
  respondedAt       DateTime?

  // Timeout
  expiresAt         DateTime?
  timeoutAction     String?         // "auto_approve", "auto_reject", "escalate"

  createdAt         DateTime        @default(now())

  @@index([digitalEmployeeId, status])
  @@index([status, expiresAt])
}

enum ApprovalStatus {
  PENDING
  DELIVERED
  APPROVED
  REJECTED
  EDITED
  EXPIRED
  CANCELLED
}
```

## TypeScript Types for JSON Fields

```typescript
// types/digital-employee.ts

interface EmployeeDeploymentConfig {
  // Scheduling
  schedules: EmployeeSchedule[]         // Multiple cron schedules
  timezone: string                      // "Asia/Jakarta", "UTC"

  // Execution
  maxConcurrentRuns: number             // Default: 1
  maxRunDuration: number                // Seconds, default: 300
  retryPolicy: {
    maxRetries: number
    backoffMs: number
  }

  // Permissions — what the employee can do without approval
  autoApprove: string[]                 // Action types that don't need approval
  requireApproval: string[]             // Action types that always need approval

  // Environment
  environmentVariables: Record<string, string>  // Injected into VM
  mountedSecrets: string[]                      // Secret IDs to mount
}

interface EmployeeSchedule {
  id: string
  name: string                          // "Morning Post", "End of Day Report"
  cron: string                          // "0 8 * * 1-5"
  workflowId: string                    // Which workflow to execute
  input?: Record<string, unknown>       // Default input for this schedule
  enabled: boolean
}

interface GatewayConfig {
  defaultChannel: string                // "telegram" | "whatsapp" | "discord" | "slack" | "email"
  channels: GatewayChannelConfig[]
  escalationChain: string[]             // User IDs: if primary doesn't respond, escalate
  responseTimeout: number               // Minutes before timeout action triggers
}

interface GatewayChannelConfig {
  type: string                          // "telegram" | "whatsapp" | etc.
  enabled: boolean
  config: Record<string, string>        // Channel-specific: chatId, phoneNumber, webhookUrl, etc.
}
```

## Employee Package (Deployment Artifact)

When a Digital Employee is deployed, the platform generates an **Employee Package** — a JSON config that the runtime layer consumes:

```typescript
interface EmployeePackage {
  version: "1.0"
  employee: {
    id: string
    name: string
  }

  // Agent identity
  agent: {
    id: string
    systemPrompt: string
    model: string
    modelConfig: ModelConfig
    memoryConfig: MemoryConfig
  }

  // Skills (prompt injections)
  skills: Array<{
    id: string
    name: string
    content: string          // The skill markdown to inject
    priority: number
  }>

  // Workflows (job descriptions)
  workflows: Array<{
    id: string
    name: string
    category: "task"
    nodes: WorkflowNode[]    // React Flow nodes
    edges: WorkflowEdge[]    // React Flow edges
    trigger: TriggerConfig
    variables: WorkflowVariables
  }>

  // Tools (capabilities)
  tools: Array<{
    id: string
    name: string
    category: string         // "builtin" | "custom" | "mcp" | "community"
    parameters: JSONSchema
    executionConfig?: ToolExecutionConfig
  }>

  // MCP Servers (external integrations)
  mcpServers: Array<{
    id: string
    name: string
    transport: string
    url: string
  }>

  // Knowledge Bases (domain expertise)
  knowledgeBases: Array<{
    groupId: string
    name: string
    documentCount: number
    // Actual embeddings/documents are synced to the VM's local SQLite
  }>

  // Deployment config
  deployment: EmployeeDeploymentConfig
  gateway: GatewayConfig
  resourceLimits: ResourceLimits
}
```

## API Routes

```
# Employee CRUD
GET    /api/dashboard/digital-employees              — list employees
POST   /api/dashboard/digital-employees              — create employee
GET    /api/dashboard/digital-employees/[id]          — get employee details
PUT    /api/dashboard/digital-employees/[id]          — update employee
DELETE /api/dashboard/digital-employees/[id]          — archive employee

# Deployment lifecycle
POST   /api/dashboard/digital-employees/[id]/deploy   — deploy (generate package, spin up)
POST   /api/dashboard/digital-employees/[id]/pause     — pause employee
POST   /api/dashboard/digital-employees/[id]/resume    — resume employee
POST   /api/dashboard/digital-employees/[id]/terminate — terminate and cleanup

# Execution
POST   /api/dashboard/digital-employees/[id]/run       — trigger manual run
GET    /api/dashboard/digital-employees/[id]/runs       — list run history
GET    /api/dashboard/digital-employees/[id]/runs/[runId] — get run details

# Approvals
GET    /api/dashboard/digital-employees/[id]/approvals  — list pending approvals
POST   /api/dashboard/digital-employees/approvals/[id]/respond — approve/reject

# Package
GET    /api/dashboard/digital-employees/[id]/package    — generate & download Employee Package
```

## Relationship to Existing Models

```
DigitalEmployee
  └── assistantId ──► Assistant (1:1)
                        ├── AssistantTool[]        ──► Tool[]
                        ├── AssistantSkill[]        ──► Skill[]
                        ├── AssistantMcpServer[]    ──► McpServerConfig[]
                        ├── AssistantKnowledgeGroup[] ──► KnowledgeBaseGroup[]
                        └── AssistantWorkflow[]     ──► Workflow[] (TASK category)
```

The `DigitalEmployee` doesn't duplicate any of these bindings — it references the `Assistant`, and the assistant's attachments ARE the employee's capabilities. The employee adds deployment config, runtime state, and supervisor management on top.

---

## Design Decision: 1:1 vs Many-to-Many (Employee ↔ Agent)

**Chosen: 1:1** — each Digital Employee maps to exactly one Agent.

Why:
- Simpler mental model: "this agent IS this employee"
- The agent's tools, skills, workflows, KB are the employee's capabilities
- If you need two employees with similar capabilities, clone the agent
- Avoids confusion about "which agent config applies when"

Future consideration: An agent could be deployed as multiple employees with different schedules/supervisors. This would require changing to many-to-many. Design the Employee Package to not assume the agent ID is globally unique — use the employee ID as the primary runtime identifier.
