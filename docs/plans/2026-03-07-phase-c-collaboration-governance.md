# Phase C: Collaboration & Governance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable inter-employee communication, audit trails, RBAC, visual cron builder, and team collaboration for the digital employee platform.

**Architecture:** Platform-relayed messaging (containers never talk directly), audit logging at API boundaries, RBAC via middleware guards on existing org roles, TEAM.md auto-generation in package-generator.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, React hooks, shadcn/ui, runtime JWT auth, AES-256-GCM encryption.

---

## Dependency Graph & Batch Order

```
C1 (Messaging) ──→ C2 (Task Delegation)
               ──→ C3 (TEAM.md)
               ──→ C4 (Message Center)
               ──→ C7 (Supervisor Approval)
C5 (Audit)     ──→ C6 (RBAC)
C8, C9, C10, C11, C12 — independent / lighter
```

| Batch | Items | Description |
|-------|-------|-------------|
| **1** | C1, C5, C8 | Foundations: messaging model, audit log, visual cron |
| **2** | C2, C3, C6, C9 | Extensions: task delegation, TEAM.md, RBAC, integration defs |
| **3** | C4, C7, C10 | UX: message center, supervisor approval, template marketplace |
| **4** | C11, C12 | Capstone: handoff pipelines, data retention |

---

## Schema Changes (all batches)

All applied via `bunx prisma db push` (not migrate dev).

### New Models

```prisma
// C1 — Inter-Employee Messaging
model EmployeeMessage {
  id               String          @id @default(cuid())
  organizationId   String
  organization     Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  fromEmployeeId   String
  fromEmployee     DigitalEmployee @relation("sentMessages", fields: [fromEmployeeId], references: [id], onDelete: Cascade)
  toEmployeeId     String?
  toEmployee       DigitalEmployee? @relation("receivedMessages", fields: [toEmployeeId], references: [id], onDelete: SetNull)
  toGroup          String?          // tag group for broadcasts
  type             String           // "message" | "task" | "handoff" | "broadcast"
  subject          String
  content          String          @db.Text
  attachments      Json            @default("[]")
  priority         String          @default("normal") // "low" | "normal" | "high" | "urgent"
  status           String          @default("pending") // "pending" | "delivered" | "in_progress" | "completed" | "failed" | "cancelled"
  requiresApproval Boolean         @default(false)
  approvalStatus   String?          // "pending" | "approved" | "rejected"
  responseContent  String?         @db.Text
  responseData     Json?
  respondedAt      DateTime?
  parentMessageId  String?
  parentMessage    EmployeeMessage? @relation("messageThread", fields: [parentMessageId], references: [id])
  childMessages    EmployeeMessage[] @relation("messageThread")
  runId            String?
  metadata         Json             @default("{}")
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([toEmployeeId, status])
  @@index([fromEmployeeId])
  @@index([organizationId, createdAt])
}

// C5 — Audit Trail
model AuditLog {
  id              String          @id @default(cuid())
  organizationId  String
  organization    Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  employeeId      String?
  userId          String?
  action          String           // "tool.execute" | "approval.respond" | "credential.access" | "message.send" | "employee.create" | etc.
  resource        String           // "tool:gmail_send" | "employee:abc123" | "message:xyz"
  detail          Json             @default("{}")
  ipAddress       String?
  riskLevel       String           @default("low") // "low" | "medium" | "high" | "critical"
  createdAt       DateTime         @default(now())

  @@index([organizationId, createdAt])
  @@index([employeeId, createdAt])
  @@index([action])
  @@index([riskLevel, createdAt])
}

// C10 — Community Template Marketplace
model EmployeeTemplateShare {
  id              String          @id @default(cuid())
  organizationId  String
  organization    Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name            String
  description     String?
  category        String
  templateData    Json             // full EmployeeTemplate serialized
  version         Int              @default(1)
  isPublic        Boolean          @default(false)
  createdBy       String
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@index([organizationId])
  @@index([isPublic, category])
}
```

### DigitalEmployee Model Additions

```prisma
// Add to DigitalEmployee model:
  sentMessages     EmployeeMessage[] @relation("sentMessages")
  receivedMessages EmployeeMessage[] @relation("receivedMessages")
```

### Organization Model Additions

```prisma
// Add to Organization model:
  employeeMessages  EmployeeMessage[]
  auditLogs         AuditLog[]
  sharedTemplates   EmployeeTemplateShare[]
```

---

## BATCH 1: C1, C5, C8

### Step 1: Schema — Add EmployeeMessage, AuditLog models

**Files:**
- Modify: `prisma/schema.prisma`

Add the `EmployeeMessage`, `AuditLog` models listed above. Add `sentMessages`/`receivedMessages` relations to `DigitalEmployee`. Add `employeeMessages`/`auditLogs` relations to `Organization`.

**Verify:**
```bash
bunx prisma db push && bunx prisma generate
```

### Step 2: C1 — Inter-Employee Messaging Library

**New files:**
| File | Purpose |
|------|---------|
| `lib/digital-employee/messaging.ts` | Message types, validation, delivery logic |

```typescript
// lib/digital-employee/messaging.ts

export const MESSAGE_TYPES = ["message", "task", "handoff", "broadcast"] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

export const MESSAGE_STATUSES = ["pending", "delivered", "in_progress", "completed", "failed", "cancelled"] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const MESSAGE_PRIORITIES = ["low", "normal", "high", "urgent"] as const

export const MESSAGE_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  delivered: { label: "Delivered", className: "bg-blue-500/10 text-blue-500" },
  in_progress: { label: "In Progress", className: "bg-amber-500/10 text-amber-500" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-500" },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-500" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

export const MESSAGE_TYPE_STYLES: Record<string, { label: string; icon: string }> = {
  message: { label: "Message", icon: "💬" },
  task: { label: "Task", icon: "📋" },
  handoff: { label: "Handoff", icon: "🤝" },
  broadcast: { label: "Broadcast", icon: "📢" },
}
```

### Step 3: C1 — Runtime API routes for messaging

**New files:**
| File | Purpose |
|------|---------|
| `app/api/runtime/messages/send/route.ts` | POST — agent sends message to another employee |
| `app/api/runtime/messages/inbox/route.ts` | GET — agent checks inbox for messages |
| `app/api/runtime/messages/[id]/reply/route.ts` | POST — agent replies to a message |
| `app/api/runtime/employees/list/route.ts` | GET — agent lists coworkers |

**`send/route.ts` pattern:**
```typescript
// Verify runtime token
// Validate: toEmployeeId exists in same org, type is valid
// If requiresApproval and sender is supervised: create EmployeeApproval instead
// Create EmployeeMessage record
// If recipient container is running: notify via gateway /internal/message endpoint
// If recipient offline and autoStart: trigger container start
// Return { success: true, messageId }
```

**`inbox/route.ts` pattern:**
```typescript
// Verify runtime token → get employeeId
// Query EmployeeMessage where toEmployeeId = employeeId, status in ["pending", "delivered"]
// Mark fetched messages as "delivered" if currently "pending"
// Return messages array
```

**`[id]/reply/route.ts` pattern:**
```typescript
// Verify runtime token
// Find original message, verify toEmployeeId matches caller
// Create child message with parentMessageId
// Update original: status = "completed", responseContent, respondedAt
// If task type: notify sender
// Return { success: true }
```

**`employees/list/route.ts` pattern:**
```typescript
// Verify runtime token → get employeeId
// Get employee's organizationId
// Query all DigitalEmployees in same org (exclude self)
// Return: [{ id, name, description, avatar, status, autonomyLevel }]
```

### Step 4: C1 — Agent runner messaging tools

**Modify:** `docker/employee/agent-runner/tools.js`

Add 4 tools after the onboarding tools section:

```javascript
// ── Inter-employee messaging tools ──

tools.push({
  name: "send_message",
  description: "Send a message to another digital employee. Types: 'message' (FYI), 'task' (request with expected response), 'handoff' (transfer ownership), 'broadcast' (to all/group).",
  parameters: {
    type: "object",
    properties: {
      toEmployeeId: { type: "string", description: "Target employee ID (omit for broadcasts)" },
      toGroup: { type: "string", description: "Group tag for broadcasts (e.g. 'engineering', 'all')" },
      type: { type: "string", enum: ["message", "task", "handoff", "broadcast"] },
      subject: { type: "string" },
      content: { type: "string" },
      priority: { type: "string", enum: ["low", "normal", "high", "urgent"], description: "Default: normal" },
      waitForResponse: { type: "boolean", description: "If true (task type), pause until recipient responds" },
    },
    required: ["type", "subject", "content"],
  },
  type: "builtin",
  execute: async (input) => { /* POST to /api/runtime/messages/send */ },
})

tools.push({
  name: "check_inbox",
  description: "Check for messages from other employees. Returns pending and delivered messages.",
  parameters: { type: "object", properties: {} },
  type: "builtin",
  execute: async () => { /* GET /api/runtime/messages/inbox */ },
})

tools.push({
  name: "reply_message",
  description: "Reply to a message from another employee. For task messages, this sends the result back.",
  parameters: {
    type: "object",
    properties: {
      messageId: { type: "string" },
      content: { type: "string" },
      data: { type: "object", description: "Structured response data (optional)" },
    },
    required: ["messageId", "content"],
  },
  type: "builtin",
  execute: async (input) => { /* POST to /api/runtime/messages/[id]/reply */ },
})

tools.push({
  name: "list_employees",
  description: "List other digital employees in the same organization. Use to discover who to delegate tasks to.",
  parameters: { type: "object", properties: {} },
  type: "builtin",
  execute: async () => { /* GET /api/runtime/employees/list */ },
})
```

### Step 5: C1 — Dashboard API for messages

**New files:**
| File | Purpose |
|------|---------|
| `app/api/dashboard/digital-employees/[id]/messages/route.ts` | GET — list messages for an employee |

```typescript
// GET: auth + orgContext
// Query EmployeeMessage where fromEmployeeId = id OR toEmployeeId = id
// Include fromEmployee: { select: { name, avatar } }, toEmployee: { select: { name, avatar } }
// Order by createdAt desc, paginate with ?cursor= and ?limit=
// Return serialized messages
```

### Step 6: C5 — Audit Trail Library

**New files:**
| File | Purpose |
|------|---------|
| `lib/digital-employee/audit.ts` | Audit logging utility functions |

```typescript
// lib/digital-employee/audit.ts
import { prisma } from "@/lib/prisma"

export interface AuditEntry {
  organizationId: string
  employeeId?: string
  userId?: string
  action: string
  resource: string
  detail?: Record<string, unknown>
  ipAddress?: string
  riskLevel?: "low" | "medium" | "high" | "critical"
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      employeeId: entry.employeeId || null,
      userId: entry.userId || null,
      action: entry.action,
      resource: entry.resource,
      detail: entry.detail || {},
      ipAddress: entry.ipAddress || null,
      riskLevel: entry.riskLevel || "low",
    },
  })
}

// Classify action risk level
export function classifyActionRisk(action: string): "low" | "medium" | "high" | "critical" {
  if (action.startsWith("credential.")) return "critical"
  if (action.startsWith("employee.delete") || action.startsWith("employee.archive")) return "high"
  if (action.startsWith("approval.") || action.startsWith("message.send")) return "medium"
  return "low"
}

export const AUDIT_ACTIONS = {
  TOOL_EXECUTE: "tool.execute",
  APPROVAL_RESPOND: "approval.respond",
  CREDENTIAL_ACCESS: "credential.access",
  CREDENTIAL_STORE: "credential.store",
  MESSAGE_SEND: "message.send",
  MESSAGE_REPLY: "message.reply",
  EMPLOYEE_CREATE: "employee.create",
  EMPLOYEE_UPDATE: "employee.update",
  EMPLOYEE_DELETE: "employee.delete",
  EMPLOYEE_DEPLOY: "employee.deploy",
  EMPLOYEE_PROMOTE: "employee.promote",
  EMPLOYEE_DEMOTE: "employee.demote",
  RUN_START: "run.start",
  RUN_COMPLETE: "run.complete",
  RUN_FAIL: "run.fail",
  INTEGRATION_CONNECT: "integration.connect",
  INTEGRATION_DISCONNECT: "integration.disconnect",
} as const
```

### Step 7: C5 — Audit API Routes

**New files:**
| File | Purpose |
|------|---------|
| `app/api/dashboard/audit/route.ts` | GET — query audit logs with filters |
| `app/api/runtime/audit/log/route.ts` | POST — agent writes audit entry |

**Dashboard route (`GET /api/dashboard/audit`):**
```typescript
// auth + orgContext
// Query params: ?employeeId=&action=&riskLevel=&from=&to=&cursor=&limit=50
// Return paginated audit entries with cursor
```

**Runtime route (`POST /api/runtime/audit/log`):**
```typescript
// Verify runtime token → get employeeId
// Create audit entry with employeeId from token
// Return { success: true }
```

### Step 8: C5 — Audit Dashboard Page

**New files:**
| File | Purpose |
|------|---------|
| `app/dashboard/audit/page.tsx` | Audit log viewer with filters |
| `hooks/use-audit-logs.ts` | Hook for fetching audit logs |

**Page structure:**
- Header: "Audit Log"
- Filter bar: employee dropdown, action type, risk level, date range
- Table: timestamp, employee, action, resource, risk badge, detail expand
- Export CSV button
- Infinite scroll with cursor pagination

### Step 9: C5 — Wire audit logging to existing endpoints

**Modify (add `logAudit()` calls to):**
| File | Audit Action |
|------|-------------|
| `app/api/dashboard/digital-employees/route.ts` POST | `employee.create` |
| `app/api/dashboard/digital-employees/[id]/route.ts` PUT | `employee.update` |
| `app/api/dashboard/digital-employees/[id]/route.ts` DELETE | `employee.delete` |
| `app/api/dashboard/digital-employees/[id]/integrations/route.ts` POST | `integration.connect` |
| `app/api/dashboard/digital-employees/[id]/trust/promote/route.ts` | `employee.promote` |
| `app/api/dashboard/digital-employees/[id]/trust/demote/route.ts` | `employee.demote` |
| `app/api/runtime/messages/send/route.ts` | `message.send` |
| `app/api/runtime/integrations/store-credentials/route.ts` | `credential.store` |

Pattern: add after the successful operation, before the response:
```typescript
await logAudit({
  organizationId: orgContext.organizationId,
  userId: session.user.id,
  action: AUDIT_ACTIONS.EMPLOYEE_CREATE,
  resource: `employee:${employee.id}`,
  detail: { name: employee.name },
  riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_CREATE),
})
```

### Step 10: C8 — Visual Cron Builder Component

**New files:**
| File | Purpose |
|------|---------|
| `app/dashboard/digital-employees/[id]/_components/cron-builder.tsx` | Visual cron schedule builder |

**Component spec:**
- Props: `value: string` (cron expression), `onChange: (cron: string) => void`
- Frequency selector: "Every X minutes", "Hourly", "Daily", "Weekly", "Monthly", "Custom"
- For each frequency: appropriate dropdowns (hour, minute, day of week, day of month)
- "Next 5 occurrences" preview using `cron-parser` (or manual parsing)
- Timezone selector with current time display
- Raw cron input toggle for power users
- No new dependencies — parse cron with simple utility functions

**Cron utility (`lib/digital-employee/cron-utils.ts`):**
```typescript
export function getNextOccurrences(cron: string, count: number, tz?: string): Date[]
export function describeCron(cron: string): string  // "Every day at 9:00 AM"
export function buildCron(freq: string, options: CronOptions): string
```

### Step 11: C8 — Replace raw cron input in Settings

**Modify:** `app/dashboard/digital-employees/[id]/_components/tab-settings.tsx`

Replace the raw cron string `<Input>` in the Schedule/Triggers section with `<CronBuilder value={...} onChange={...} />`.

### Step 12: Verify Batch 1

```bash
bunx prisma db push && bunx prisma generate
bunx tsc --noEmit  # zero new errors
```

Commit: `feat(C1,C5,C8): inter-employee messaging, audit trail, visual cron builder`

---

## BATCH 2: C2, C3, C6, C9

### Step 13: C2 — Task Delegation Extensions

**Modify:** `app/api/runtime/messages/send/route.ts`

Add task delegation logic:
- When `type === "task"` and `waitForResponse === true`:
  - Set message `status: "pending"`
  - Return `{ success: true, messageId, waitingForResponse: true }`
  - Agent runner should poll or use callback pattern
- Auto-start: if recipient is offline and org has auto-start enabled:
  - Call orchestrator `startContainer(toEmployeeId)` then deliver message
- Task status tracking: pending → delivered → in_progress → completed/failed

**New file:**
| File | Purpose |
|------|---------|
| `app/api/runtime/messages/[id]/status/route.ts` | GET — check task message status |

```typescript
// Verify runtime token
// Query message by id, verify fromEmployeeId matches
// Return { status, responseContent, responseData, respondedAt }
```

**Modify:** `docker/employee/agent-runner/tools.js`

Add `check_task_status` tool:
```javascript
tools.push({
  name: "check_task_status",
  description: "Check the status of a delegated task message. Returns status and response if completed.",
  parameters: {
    type: "object",
    properties: {
      messageId: { type: "string", description: "The task message ID to check" },
    },
    required: ["messageId"],
  },
  type: "builtin",
  execute: async (input) => { /* GET /api/runtime/messages/[id]/status */ },
})
```

### Step 14: C3 — TEAM.md Workspace File Generation

**Modify:** `lib/digital-employee/types.ts`

Add `TEAM.md` to `WORKSPACE_FILES` array:
```typescript
{
  filename: "TEAM.md",
  purpose: "Coworkers and communication guide",
  readOnly: true,
  defaultContent: (ctx) => {
    // ctx needs new field: coworkers
    if (!ctx.coworkers || ctx.coworkers.length === 0) {
      return "# Team\n\n_No coworkers in this organization._\n"
    }
    const list = ctx.coworkers
      .map((c) => `- **${c.name}** (${c.avatar || "🤖"}) — ${c.description || "Digital employee"}. Status: ${c.status}.`)
      .join("\n")
    return `# Team\n\n## Coworkers\n${list}\n\n## Communication\n- Use \`send_message\` to message a coworker\n- Use \`check_inbox\` to see replies\n- Use \`list_employees\` to discover available team members\n`
  },
}
```

**Modify:** `lib/digital-employee/types.ts` — `WorkspaceFileContext` interface:
```typescript
// Add:
coworkers?: Array<{ name: string; description?: string | null; avatar?: string | null; status: string }>
```

**Modify:** `lib/digital-employee/package-generator.ts`

In `generateEmployeePackage()`, before workspace file generation:
```typescript
// Fetch coworkers for TEAM.md
const coworkers = await prisma.digitalEmployee.findMany({
  where: {
    organizationId: employee.organizationId,
    id: { not: employeeId },
    status: { in: ["ACTIVE", "PAUSED", "ONBOARDING"] },
  },
  select: { name: true, description: true, avatar: true, status: true },
})

// Add to ctx:
const ctx: WorkspaceFileContext = {
  ...existingFields,
  coworkers,
}
```

### Step 15: C6 — RBAC Middleware Guard

**New files:**
| File | Purpose |
|------|---------|
| `lib/digital-employee/rbac.ts` | Role-based permission matrix and guard functions |

```typescript
// lib/digital-employee/rbac.ts

export type EmployeePermission =
  | "employee.create" | "employee.read" | "employee.update" | "employee.delete"
  | "employee.deploy" | "employee.run"
  | "approval.respond"
  | "integration.manage"
  | "audit.read"
  | "message.read"
  | "template.share"

const ROLE_PERMISSIONS: Record<string, EmployeePermission[]> = {
  owner: [
    "employee.create", "employee.read", "employee.update", "employee.delete",
    "employee.deploy", "employee.run", "approval.respond",
    "integration.manage", "audit.read", "message.read", "template.share",
  ],
  admin: [
    "employee.create", "employee.read", "employee.update", "employee.delete",
    "employee.deploy", "employee.run", "approval.respond",
    "integration.manage", "audit.read", "message.read", "template.share",
  ],
  member: [
    "employee.read", "employee.update", "employee.run",
    "approval.respond", "message.read",
  ],
  viewer: [
    "employee.read", "message.read",
  ],
}

export function hasPermission(role: string, permission: EmployeePermission): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(permission)
}

// For supervisors: members can only manage employees they supervise
export function canManageEmployee(
  role: string,
  userId: string,
  employee: { supervisorId?: string | null; createdBy: string }
): boolean {
  if (role === "owner" || role === "admin") return true
  if (role === "member") {
    return employee.supervisorId === userId || employee.createdBy === userId
  }
  return false
}
```

### Step 16: C6 — Apply RBAC guards to existing routes

**Modify these files** — add permission checks after auth:

| Route | Permission Required |
|-------|-------------------|
| `POST /api/dashboard/digital-employees` | `employee.create` |
| `PUT /api/dashboard/digital-employees/[id]` | `employee.update` + `canManageEmployee` |
| `DELETE /api/dashboard/digital-employees/[id]` | `employee.delete` |
| `GET /api/dashboard/audit` | `audit.read` |
| `POST /api/dashboard/digital-employees/[id]/integrations` | `integration.manage` |

Pattern:
```typescript
import { hasPermission, canManageEmployee } from "@/lib/digital-employee/rbac"

// After orgContext:
if (!hasPermission(orgContext.membership.role, "employee.create")) {
  return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
}
```

For member-level routes that need supervisor check:
```typescript
if (!canManageEmployee(orgContext.membership.role, session.user.id, existing)) {
  return NextResponse.json({ error: "You can only manage employees you supervise" }, { status: 403 })
}
```

### Step 17: C9 — Pre-built Integration Definitions

**Modify:** `lib/digital-employee/integrations.ts`

Ensure the `INTEGRATION_REGISTRY` has complete definitions for all specified integrations. Each needs:
- `id`, `name`, `icon`, `category`, `description`
- `setupType`: "oauth" | "api-key" | "chat-guided" | "manual"
- `fields`: array of credential fields with `key`, `label`, `type`, `required`, `placeholder`, `helpText`
- `testConnection`: tool name to verify

Full list from spec:
| Integration | setupType | Key Fields |
|-------------|-----------|------------|
| `gmail` | oauth | Client ID, Client Secret, Refresh Token |
| `google-calendar` | oauth | (shared with Gmail) |
| `google-drive` | oauth | (shared with Gmail) |
| `slack` | api-key | Bot Token, Signing Secret |
| `github` | api-key | Personal Access Token |
| `linear` | api-key | API Key |
| `notion` | api-key | Integration Token |
| `discord` | api-key | Bot Token |
| `smtp` | manual | Host, Port, Username, Password, From Address |
| `custom-mcp` | chat-guided | URL, Auth (varies) |
| `custom-api` | manual | Base URL, API Key, Headers |

### Step 18: Verify Batch 2

```bash
bunx prisma db push && bunx prisma generate  # (schema already applied in Batch 1)
bunx tsc --noEmit  # zero new errors
```

Commit: `feat(C2,C3,C6,C9): task delegation, TEAM.md, RBAC guards, integration definitions`

---

## BATCH 3: C4, C7, C10

### Step 19: C4 — Global Message Center Page

**New files:**
| File | Purpose |
|------|---------|
| `app/dashboard/messages/page.tsx` | Message center page |
| `app/api/dashboard/messages/route.ts` | GET — all messages in org |
| `hooks/use-employee-messages.ts` | Hook for message data |

**API route (`GET /api/dashboard/messages`):**
```typescript
// auth + orgContext
// Query params: ?employeeId=&type=&status=&cursor=&limit=50
// Query EmployeeMessage where organizationId matches
// Include fromEmployee, toEmployee (name + avatar)
// Order by createdAt desc
// Return paginated
```

**Page structure:**
- Header: "Messages"
- Filter bar: employee dropdown (sender/receiver), type filter (message/task/handoff/broadcast), status filter
- Message list: sender avatar + name → recipient avatar + name, type badge, subject, preview, status, timestamp
- Click to expand: full content, thread (child messages), response data
- Each message card shows the thread if parentMessageId links exist

**Hook pattern:**
```typescript
export function useEmployeeMessages(filters?: { employeeId?: string; type?: string; status?: string }) {
  // fetch, return { messages, isLoading, fetchMore }
}
```

### Step 20: C4 — Add Messages link to sidebar

**Modify:** `app/dashboard/_components/app-sidebar.tsx`

Add "Messages" nav item below "Digital Employees" (or in a logical spot):
```typescript
{ title: "Messages", url: "/dashboard/messages", icon: MessageSquare }
```

### Step 21: C7 — Supervisor Message Approval

**Modify:** `app/api/runtime/messages/send/route.ts`

Before creating the message, check if sender employee is supervised and `requiresApproval` rules apply:
```typescript
// If employee.autonomyLevel is L1 or L2 and message type is "task" or "handoff":
//   requiresApproval = true
//   Create EmployeeApproval record with requestType: "message_send"
//   Set message status to "pending_approval"
//   Return { success: true, messageId, requiresApproval: true }
```

**Modify:** Approval response handler (wherever approvals are resolved)

When an approval for `requestType: "message_send"` is approved:
- Find the pending message
- Update status to "pending" (ready for delivery)
- Deliver to recipient

When rejected:
- Update message status to "cancelled"

### Step 22: C7 — Show message approvals in Activity tab

**Modify:** `app/dashboard/digital-employees/[id]/_components/tab-activity.tsx`

The existing approval cards already render based on `requestType`. Add handling for `requestType === "message_send"`:
- Show: "Send task to [Employee Name]: [subject]"
- Approve/Reject buttons already work via `respondToApproval`

### Step 23: C10 — Template Marketplace (Org-Level)

**New files:**
| File | Purpose |
|------|---------|
| `app/api/dashboard/templates/route.ts` | GET (list org + public), POST (save as template) |
| `app/api/dashboard/templates/[id]/route.ts` | PUT (update), DELETE |
| `hooks/use-shared-templates.ts` | Hook for template CRUD |

**Schema note:** `EmployeeTemplateShare` model was added in Batch 1.

**Save flow:**
- Employee detail page → Settings → "Save as Template" button
- Serializes: name, description, autonomyLevel, tools, skills, integrations, schedules, goals into `templateData`
- Org-scoped by default, optional `isPublic` toggle (admin/owner only)

**Gallery integration:**
- Modify `new/_components/template-gallery.tsx` to also fetch org/public shared templates
- Show two sections: "Built-in Templates" and "Organization Templates"

### Step 24: Verify Batch 3

```bash
bunx tsc --noEmit  # zero new errors
```

Commit: `feat(C4,C7,C10): message center, supervisor message approval, template marketplace`

---

## BATCH 4: C11, C12

### Step 25: C11 — Handoff Pipelines (Data Model + Basic UI)

**New files:**
| File | Purpose |
|------|---------|
| `lib/digital-employee/pipelines.ts` | Pipeline definition types |
| `app/api/dashboard/pipelines/route.ts` | GET (list), POST (create) |
| `app/api/dashboard/pipelines/[id]/route.ts` | GET, PUT, DELETE |
| `app/api/dashboard/pipelines/[id]/run/route.ts` | POST — execute pipeline |
| `hooks/use-pipelines.ts` | Hook for pipeline CRUD |
| `app/dashboard/pipelines/page.tsx` | Pipeline list page |
| `app/dashboard/pipelines/[id]/page.tsx` | Pipeline detail/editor page |

**Pipeline types:**
```typescript
export interface PipelineStep {
  id: string
  employeeId: string
  instruction: string
  waitForCompletion: boolean
  timeoutMinutes: number
  onFailure: "stop" | "skip" | "retry"
}

export interface Pipeline {
  id: string
  organizationId: string
  name: string
  description?: string
  steps: PipelineStep[]
  createdBy: string
}
```

**Note:** For Phase C, pipelines use the existing `EmployeeMessage` model with `type: "handoff"` for step transitions. No new Prisma model needed — store pipeline config as JSON on a generic record or as an EmployeeFile.

**Simpler approach:** Store pipelines as JSON in `Organization` settings or a new `organizationId`-scoped record. Use `EmployeeMessage` `type: "handoff"` for actual step execution.

**Execution flow:**
1. POST `/api/dashboard/pipelines/[id]/run` → creates first handoff message to step[0] employee
2. When step[0] completes (message responded), platform sends handoff to step[1]
3. Each step auto-chains via a completion webhook/check

**UI:** Simple list of steps with employee avatars, drag-to-reorder, add/remove steps. No full visual graph builder yet (that's a future enhancement).

### Step 26: C12 — Data Retention + Export

**New files:**
| File | Purpose |
|------|---------|
| `lib/digital-employee/retention.ts` | Retention policy logic |
| `app/api/dashboard/digital-employees/[id]/export/route.ts` | GET — export all employee data as JSON |
| `app/api/dashboard/digital-employees/[id]/purge/route.ts` | POST — right-to-delete (purge all data) |

**Retention policy (`retention.ts`):**
```typescript
export interface RetentionPolicy {
  runsRetentionDays: number      // default: 90
  messagesRetentionDays: number  // default: 90
  auditRetentionDays: number     // default: 365
  autoArchive: boolean
}

export async function applyRetentionPolicy(
  organizationId: string,
  policy: RetentionPolicy
): Promise<{ deletedRuns: number; deletedMessages: number; deletedAuditLogs: number }>

export async function exportEmployeeData(employeeId: string): Promise<Record<string, unknown>>
// Returns: { employee, runs, approvals, files, messages, memory, goals, integrations }

export async function purgeEmployeeData(employeeId: string): Promise<void>
// Cascading delete of all employee data (runs, files, messages, memory, etc.)
// DigitalEmployee itself is also deleted
```

**Export route:**
```typescript
// auth + orgContext + permission check (owner/admin only)
// Call exportEmployeeData(id)
// Return as JSON with Content-Disposition: attachment header
```

**Purge route:**
```typescript
// auth + orgContext + owner only
// Confirm: require body { confirmName: employee.name } to prevent accidents
// Call purgeEmployeeData(id)
// Log audit: employee.delete
// Return { success: true }
```

**Credential rotation alerts:**
```typescript
// In retention.ts:
export async function getExpiringCredentials(
  organizationId: string,
  withinDays: number = 7
): Promise<Array<{ employeeId: string; employeeName: string; integrationId: string; expiresAt: Date }>>
```

### Step 27: C12 — Settings page for retention + export

**Modify:** `app/dashboard/digital-employees/[id]/_components/tab-settings.tsx`

In the "Danger Zone" section, add:
- "Export Data" button → calls export API, downloads JSON
- "Purge All Data" button → confirmation dialog with name re-type → calls purge API

### Step 28: Verify Batch 4

```bash
bunx tsc --noEmit  # zero new errors
```

Commit: `feat(C11,C12): handoff pipelines, data retention and export`

---

## Files Summary

### New Files (25)

| File | Batch |
|------|-------|
| `lib/digital-employee/messaging.ts` | 1 |
| `lib/digital-employee/audit.ts` | 1 |
| `lib/digital-employee/cron-utils.ts` | 1 |
| `lib/digital-employee/rbac.ts` | 2 |
| `lib/digital-employee/pipelines.ts` | 4 |
| `lib/digital-employee/retention.ts` | 4 |
| `app/api/runtime/messages/send/route.ts` | 1 |
| `app/api/runtime/messages/inbox/route.ts` | 1 |
| `app/api/runtime/messages/[id]/reply/route.ts` | 1 |
| `app/api/runtime/messages/[id]/status/route.ts` | 2 |
| `app/api/runtime/employees/list/route.ts` | 1 |
| `app/api/runtime/audit/log/route.ts` | 1 |
| `app/api/dashboard/audit/route.ts` | 1 |
| `app/api/dashboard/messages/route.ts` | 3 |
| `app/api/dashboard/digital-employees/[id]/messages/route.ts` | 1 |
| `app/api/dashboard/digital-employees/[id]/export/route.ts` | 4 |
| `app/api/dashboard/digital-employees/[id]/purge/route.ts` | 4 |
| `app/api/dashboard/templates/route.ts` | 3 |
| `app/api/dashboard/templates/[id]/route.ts` | 3 |
| `app/api/dashboard/pipelines/route.ts` | 4 |
| `app/api/dashboard/pipelines/[id]/route.ts` | 4 |
| `app/api/dashboard/pipelines/[id]/run/route.ts` | 4 |
| `app/dashboard/audit/page.tsx` | 1 |
| `app/dashboard/messages/page.tsx` | 3 |
| `app/dashboard/pipelines/page.tsx` | 4 |
| `app/dashboard/pipelines/[id]/page.tsx` | 4 |
| `[id]/_components/cron-builder.tsx` | 1 |
| `hooks/use-audit-logs.ts` | 1 |
| `hooks/use-employee-messages.ts` | 3 |
| `hooks/use-shared-templates.ts` | 3 |
| `hooks/use-pipelines.ts` | 4 |

### Modified Files (key)

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | 3 new models + DigitalEmployee relations + Organization relations |
| `docker/employee/agent-runner/tools.js` | 5 new tools: send_message, check_inbox, reply_message, list_employees, check_task_status |
| `lib/digital-employee/types.ts` | Add TEAM.md to WORKSPACE_FILES, add `coworkers` to WorkspaceFileContext |
| `lib/digital-employee/package-generator.ts` | Fetch coworkers for TEAM.md context |
| `lib/digital-employee/integrations.ts` | Complete all 11 integration definitions |
| `app/dashboard/_components/app-sidebar.tsx` | Add Messages nav item |
| `[id]/_components/tab-settings.tsx` | CronBuilder, export/purge buttons |
| `[id]/_components/tab-activity.tsx` | Message approval card handling |
| `new/_components/template-gallery.tsx` | Org/public shared templates section |
| Multiple existing API routes | RBAC guards + audit logging |

---

## Verification

After each batch:
1. `bunx prisma db push && bunx prisma generate` — schema applies cleanly
2. `bunx tsc --noEmit` — zero new TS errors
3. Batch-specific checks:
   - **B1**: Employee sends message via tool → recipient receives in inbox → reply flows back
   - **B1**: Audit log records appear for key actions, filterable in dashboard
   - **B1**: Visual cron builder generates valid cron, shows next occurrences
   - **B2**: Task delegation with waitForResponse pauses sender, delivers to recipient
   - **B2**: TEAM.md auto-generated with coworker list on deploy
   - **B2**: Viewer role cannot create/delete employees, member can only manage supervised employees
   - **B2**: All 11 integrations have complete field definitions
   - **B3**: Message center shows all org messages, filterable
   - **B3**: Supervised employee's task messages require approval before delivery
   - **B3**: Save employee config as template, appears in creation wizard
   - **B4**: Pipeline with 3 steps chains handoffs correctly
   - **B4**: Export downloads complete JSON, purge removes all data
