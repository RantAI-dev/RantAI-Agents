# 01 — Workflow Composition Model

## Problem

Workflows cannot be attached to agents. Today:
- Tools attach to agents via `AssistantTool` junction table
- Skills attach via `AssistantSkill` junction table
- MCP servers attach via `AssistantMcpServer` junction table
- Knowledge bases attach via `knowledgeBaseGroupIds` string array
- **Workflows have no attachment mechanism** — `Workflow.assistantId` is a cosmetic reverse-FK used only for list filtering

An agent needs workflows as "jobs it can execute" — the same way it has tools as "capabilities it can use" and skills as "behaviors it knows."

## Solution

### 1. Workflow Categories

Not all workflows should be attachable to agents. Introduce a `WorkflowCategory` enum:

```prisma
enum WorkflowCategory {
  TASK         // A job an agent can execute — attachable to agents
  CHATFLOW     // Conversation handler — standalone, uses mode=CHATFLOW
  AUTOMATION   // Platform-level automation — standalone, not agent-bound
}
```

**TASK workflows** are the key new concept:
- They define a **procedure** the agent follows to deliver a specific outcome
- The agent brings its own skills, tools, KB, and MCP capabilities to execute it
- Examples: "Write LinkedIn post", "Analyze sales report", "Draft email response", "Process invoice"
- These are the "job descriptions" for Digital Employees

**CHATFLOW workflows** already exist (the `mode: CHATFLOW` concept). They handle conversation routing and streaming. Not agent-attachable.

**AUTOMATION workflows** are standalone data pipelines, sync jobs, or integrations that don't need an agent identity. They may use LLM/Agent nodes internally, but aren't "owned by" an agent.

### 2. AssistantWorkflow Junction Table

Follow the exact same pattern as `AssistantTool`:

```prisma
model AssistantWorkflow {
  id          String   @id @default(cuid())
  assistantId String
  assistant   Assistant @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  workflowId  String
  workflow    Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  enabled     Boolean  @default(true)
  priority    Int      @default(0)   // Execution priority / ordering
  createdAt   DateTime @default(now())

  @@unique([assistantId, workflowId])
  @@index([assistantId])
}
```

Update `Assistant` model:
```prisma
model Assistant {
  // ... existing fields ...
  workflows  AssistantWorkflow[]   // ADD — replaces the old reverse Workflow[] relation
}
```

Update `Workflow` model:
```prisma
model Workflow {
  // ... existing fields ...
  category        WorkflowCategory @default(TASK)
  assistantWorkflows AssistantWorkflow[]  // ADD

  // KEEP assistantId for now (backward compat for existing data)
  // but deprecate in favor of AssistantWorkflow junction
  assistantId     String?    // @deprecated — use AssistantWorkflow instead
  assistant       Assistant? @relation(fields: [assistantId], references: [id], onDelete: SetNull)
}
```

### 3. Migration Strategy for Existing Data

Existing workflows that have `assistantId` set should be migrated:
1. For each `Workflow` where `assistantId IS NOT NULL`:
   - Create an `AssistantWorkflow` row linking them
   - Set `category = TASK` (assume they were meant to be agent-bound)
2. For each `Workflow` where `mode = CHATFLOW`:
   - Set `category = CHATFLOW`
3. For remaining workflows (no assistantId, mode = STANDARD):
   - Set `category = AUTOMATION` (or leave as TASK for user to recategorize)

### 4. API Routes

Follow existing patterns from `app/api/assistants/[id]/tools/route.ts`:

```
GET  /api/assistants/[id]/workflows       — list attached workflows
PUT  /api/assistants/[id]/workflows       — set workflow bindings (array of workflowIds)
```

```
GET  /api/dashboard/workflows?category=task    — filter by category
GET  /api/dashboard/workflows?attachable=true  — only TASK workflows not yet attached
```

### 5. Agent Builder UI — "Workflows" Tab

Add a new tab to the agent editor (alongside Tools, Skills, MCP, Knowledge):

**Tab: Workflows** (`tab-workflows.tsx`)
- Lists all `TASK` category workflows in the organization
- Toggle to attach/detach each workflow to the agent
- Shows workflow name, description, trigger type, status (DRAFT/ACTIVE)
- Only `ACTIVE` and `TASK` workflows are attachable
- Clicking a workflow name opens it in the workflow editor (new tab/link)

Tab position in editor layout: after "Skills" tab, before "MCP" tab:
`configure | model | tools | skills | workflows | mcp | knowledge | memory | guardrails | chat | test | deploy`

### 6. Workflow Editor Updates

When creating/editing a workflow, add a **Category selector** to the workflow settings:
- Dropdown: Task / Chatflow / Automation
- When `TASK` is selected, show a note: "This workflow can be attached to agents as a job they can execute"
- When `CHATFLOW` is selected, show existing chatflow config options
- When `AUTOMATION` is selected, show a note: "This workflow runs independently, not bound to any agent"

### 7. How This Connects to Digital Employees

When a Digital Employee is created, its "Employee Package" bundles:
- The agent config (system prompt, model, personality)
- All attached workflows (`AssistantWorkflow` where `enabled = true`) — these become the employee's "job descriptions"
- All attached tools, skills, MCP servers, knowledge bases — these are the employee's capabilities

The runtime layer (see `06-RUNTIME-AGENTIC-OS.md`) uses this package to:
- Boot the agent in a microVM
- Load its task workflows as available jobs
- Execute workflows based on triggers (cron, event, webhook)
- Use the agent's full tool belt during execution

### 8. Future: Workflow as Tool

A powerful extension: attached `TASK` workflows could be **exposed as callable tools** to the agent during chat. When a user says "write me a LinkedIn post," the agent recognizes it has a "Write LinkedIn Post" workflow attached and executes it as a structured procedure rather than free-form generation.

This is NOT required for the initial implementation but should be designed for:
- `AssistantWorkflow` could gain a `exposeAsTool` boolean field
- At chat time, `resolveToolsForAssistant()` would also generate tool definitions from attached workflows
- The tool's `execute` function would trigger the workflow engine

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `WorkflowCategory`, `AssistantWorkflow`, update `Workflow` and `Assistant` |
| `prisma/migrations/xxx_add_workflow_composition/` | Create | Migration + data migration script |
| `app/api/assistants/[id]/workflows/route.ts` | Create | GET/PUT workflow bindings for an agent |
| `app/api/dashboard/workflows/route.ts` | Modify | Add `category` filter param |
| `hooks/use-assistant-workflows.ts` | Create | Client-side hook for workflow bindings |
| `app/dashboard/agent-builder/_components/tab-workflows.tsx` | Create | Workflow attachment UI tab |
| `app/dashboard/agent-builder/_components/agent-editor-layout.tsx` | Modify | Add "Workflows" tab |
| `app/dashboard/workflows/_components/workflow-settings.tsx` | Modify | Add category selector |
