# 08 — Management Layer: HR Dashboard

## Overview

The "HR Dashboard" is where non-technical users manage their Digital Employees. It's a new section in the existing RantAI platform — accessible from the sidebar, separate from the technical agent builder / workflow editor.

## Information Architecture

```
Dashboard (existing)
├── Chat (existing)
├── Agent Builder (existing)
├── Workflows (existing)
├── Knowledge Base (existing)
├── Tools (existing)
├── MCP Servers (existing)
│
├── Digital Employees (NEW) ─────────────────────────
│   ├── Employee Directory     — browse, hire, deploy
│   ├── My Employees          — manage active employees
│   │   ├── [employee]        — individual employee view
│   │   │   ├── Overview      — status, schedule, metrics
│   │   │   ├── Activity      — run history, logs
│   │   │   ├── Approvals     — pending/completed approvals
│   │   │   ├── Memory        — what the employee remembers
│   │   │   ├── Settings      — schedule, permissions, gateway
│   │   │   └── Performance   — success rate, token usage, cost
│   │   └── ...
│   ├── Supervisor Board      — Kanban of all employee activities
│   └── Team Pipelines        — multi-employee coordination (Phase 4)
│
└── Settings (existing)
```

## Pages

### 1. Employee Directory (`/dashboard/digital-employees`)

Browse and deploy employee templates:

```
┌─────────────────────────────────────────────────────┐
│  Digital Employees                    [+ Create New] │
│                                                     │
│  ┌─── Filter ──────────────────────────────────┐   │
│  │ All │ Active │ Paused │ Draft │ Templates    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ 📝          │  │ 📊          │  │ 📧         │ │
│  │ Content     │  │ Data        │  │ Email      │ │
│  │ Writer      │  │ Analyst     │  │ Manager    │ │
│  │             │  │             │  │            │ │
│  │ ● Active    │  │ ● Active    │  │ ○ Draft    │ │
│  │ Last: 2h ago│  │ Last: 1d ago│  │ Not deployed│ │
│  │ 42 runs     │  │ 18 runs     │  │            │ │
│  │ 95% success │  │ 89% success │  │            │ │
│  │             │  │             │  │            │ │
│  │ [View] [⏸] │  │ [View] [⏸] │  │ [Edit]     │ │
│  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 2. Create / Onboarding Flow (`/dashboard/digital-employees/new`)

Step-by-step wizard to "hire" a new employee:

```
Step 1: Identity
  ├── Name the employee ("Marketing Manager")
  ├── Select or create an Agent (personality, system prompt, model)
  └── Choose avatar

Step 2: Skills & Capabilities
  ├── Review agent's attached tools
  ├── Review agent's attached skills
  ├── Review agent's MCP connections
  └── Add/remove as needed (links to agent editor)

Step 3: Job Description (Workflows)
  ├── Attach TASK workflows ("Write LinkedIn Post", "Generate Report")
  ├── Create new workflow from template
  └── Set execution priority

Step 4: Knowledge & Training
  ├── Attach knowledge bases (brand guidelines, company docs)
  ├── Upload additional documents
  └── Preview: "Your employee knows about: X, Y, Z"

Step 5: Schedule & Triggers
  ├── Set working hours (cron builder UI)
  ├── Map: which schedule triggers which workflow
  ├── Timezone selection
  └── Preview next 5 scheduled runs

Step 6: Supervisor & Approvals
  ├── Assign supervisor (team member)
  ├── Choose notification channel (Telegram, Slack, Dashboard)
  ├── Configure: what needs approval vs. auto-approved
  └── Set timeout and escalation rules

Step 7: Review & Deploy
  ├── Summary of all configuration
  ├── Resource estimate (tokens/day, cost/month)
  ├── [Deploy Now] or [Save as Draft]
  └── Post-deploy: first test run option
```

### 3. Individual Employee View (`/dashboard/digital-employees/[id]`)

#### Overview Tab
```
┌─────────────────────────────────────────────────────┐
│  ← Back    Content Writer                    [⏸ Pause]│
│                                                      │
│  Status: ● Active          Supervisor: @john         │
│  Schedule: Daily 8:00 AM   Channel: Telegram         │
│  Since: Jan 15, 2026       Total runs: 142           │
│                                                      │
│  ┌─── This Week ─────────────────────────────────┐  │
│  │  Runs: 5/5 completed  │  Approvals: 3 pending │  │
│  │  Success rate: 100%   │  Avg time: 45s        │  │
│  │  Tokens used: 24,500  │  Est. cost: $1.23     │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌─── Recent Activity ───────────────────────────┐  │
│  │  ✅ 8:00 AM  Wrote LinkedIn post (approved)   │  │
│  │  ✅ Yesterday Wrote LinkedIn post (approved)   │  │
│  │  ❌ Mar 27   Failed: API rate limit           │  │
│  │  ✅ Mar 26   Wrote LinkedIn post (approved)   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

#### Activity Tab
- Chronological list of all runs
- Each run expandable to show:
  - Workflow steps executed
  - Tool calls made
  - Approval requests and responses
  - Output/artifacts produced
  - Token usage and duration

#### Approvals Tab
- Pending approvals (actionable from dashboard)
- Completed approvals (history)
- Inline content review and respond

#### Memory Tab
- What the employee "remembers" (contents of memory.db)
- Conversation history summary
- Semantic memory entries
- Ability to clear or edit memories

#### Settings Tab
- Edit schedule, permissions, gateway config
- Link to underlying agent config (opens agent editor)
- Link to attached workflows (opens workflow editor)
- Resource limits and budget caps
- Danger zone: archive employee

### 4. Supervisor Board (`/dashboard/digital-employees/board`)

Kanban-style overview across ALL employees:

```
┌──────────────────────────────────────────────────────────┐
│  Supervisor Board                          [Filter ▾]    │
│                                                          │
│  ┌─ Needs Approval ─┐  ┌── In Progress ──┐  ┌─ Done ──┐│
│  │                   │  │                  │  │          ││
│  │ ┌──────────────┐ │  │ ┌──────────────┐│  │ ┌──────┐ ││
│  │ │📝 Content    │ │  │ │📊 Analyst    ││  │ │✅ Post││ ││
│  │ │Writer        │ │  │ │Analyzing Q1  ││  │ │published││
│  │ │Review post   │ │  │ │data...       ││  │ │9:01 AM││ ││
│  │ │[Approve]     │ │  │ │Started 2m ago││  │ └──────┘ ││
│  │ │[Reject]      │ │  │ └──────────────┘│  │          ││
│  │ └──────────────┘ │  │                  │  │ ┌──────┐ ││
│  │                   │  │                  │  │ │✅    ││ ││
│  │                   │  │                  │  │ │Report││ ││
│  │                   │  │                  │  │ │sent  ││ ││
│  │                   │  │                  │  │ └──────┘ ││
│  └───────────────────┘  └──────────────────┘  └─────────┘│
└──────────────────────────────────────────────────────────┘
```

Real-time updates via WebSocket — cards move across columns as employees complete tasks or request approvals.

## Template System

Employee templates are pre-configured bundles that users can "hire" with minimal setup:

```prisma
model EmployeeTemplate {
  id              String   @id @default(cuid())
  name            String                 // "LinkedIn Content Marketer"
  description     String
  category        String                 // "marketing", "sales", "operations", "data"
  icon            String

  // Template contents (used to scaffold a new employee)
  agentTemplate   Json                   // System prompt, model, config
  workflowTemplates Json                 // Pre-built workflow definitions
  requiredTools   String[]               // Tool names the employee needs
  requiredSkills  String[]               // Skill names
  requiredMcp     String[]               // MCP server types
  suggestedKb     Json?                  // KB topics / sample docs

  // Marketplace metadata
  author          String?
  downloads       Int      @default(0)
  rating          Float?
  isOfficial      Boolean  @default(false)

  organizationId  String?                // null = public template
  createdAt       DateTime @default(now())
}
```

## Components to Build

| Component | Type | Purpose |
|-----------|------|---------|
| `EmployeeCard` | Card component | Employee summary in directory grid |
| `EmployeeStatusBadge` | Badge component | Active/Paused/Draft status indicator |
| `OnboardingWizard` | Multi-step form | 7-step employee creation flow |
| `EmployeeOverview` | Dashboard page | Individual employee overview tab |
| `EmployeeActivity` | List/timeline | Run history with expandable details |
| `ApprovalCard` | Interactive card | Review and respond to approval requests |
| `SupervisorBoard` | Kanban board | Cross-employee activity view |
| `CronBuilder` | Form component | Visual cron expression builder |
| `SchedulePreview` | Display component | Shows next N scheduled runs |
| `TemplateGallery` | Grid component | Browse employee templates |

## Routes

```
/dashboard/digital-employees                    — directory (list + templates)
/dashboard/digital-employees/new                — onboarding wizard
/dashboard/digital-employees/[id]               — employee detail (overview)
/dashboard/digital-employees/[id]/activity      — run history
/dashboard/digital-employees/[id]/approvals     — approval queue
/dashboard/digital-employees/[id]/memory        — memory viewer
/dashboard/digital-employees/[id]/settings      — configuration
/dashboard/digital-employees/[id]/performance   — metrics
/dashboard/digital-employees/board              — supervisor Kanban
/dashboard/digital-employees/templates          — template marketplace
```

## Dependencies

- Requires `DigitalEmployee` model (see `05-DIGITAL-EMPLOYEE-MODEL.md`)
- Requires `AssistantWorkflow` junction (see `01-WORKFLOW-COMPOSITION.md`)
- Requires Gateway for approval UI (see `07-INTERACTION-GATEWAY.md`)
- Follows existing dashboard patterns (sidebar nav, `DashboardPageHeader`, etc.)
