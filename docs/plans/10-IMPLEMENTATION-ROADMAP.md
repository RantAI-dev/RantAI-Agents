# 10 — Implementation Roadmap

## Phase Overview

```
Phase 0: Foundation Fixes (Current Platform)          ██░░░░░░░░  ~2-3 weeks
Phase 1: Digital Employee MVP (Deploy + Run)          ████░░░░░░  ~4-6 weeks
Phase 2: Gateway (Human-in-the-Loop)                  ██████░░░░  ~3-4 weeks
Phase 3: Management Dashboard                         ████████░░  ~4-5 weeks
Phase 4: Ecosystem (Templates + Teams)                ██████████  ~6-8 weeks
Phase 5: Platform Identity Evolution                  (future, data-driven)
```

---

## Phase 0: Foundation Fixes

> Fix the composition gaps in the existing platform so building blocks work together.

### 0.1 — Workflow Composition (`01-WORKFLOW-COMPOSITION.md`)
- [ ] Add `WorkflowCategory` enum to Prisma schema
- [ ] Create `AssistantWorkflow` junction table
- [ ] Add `category` field to `Workflow` model
- [ ] Write data migration (existing `assistantId` → junction table)
- [ ] Create `GET/PUT /api/assistants/[id]/workflows` API routes
- [ ] Add `category` filter to `GET /api/dashboard/workflows`
- [ ] Create `use-assistant-workflows.ts` hook
- [ ] Build `tab-workflows.tsx` for agent editor
- [ ] Add "Workflows" tab to agent editor layout
- [ ] Add category selector to workflow editor settings

### 0.2 — Knowledge Base Relations (`02-KNOWLEDGE-BASE-RELATIONS.md`)
- [ ] Create `AssistantKnowledgeGroup` junction table
- [ ] Write data migration (string array → junction table)
- [ ] Create `GET/PUT /api/assistants/[id]/knowledge` API routes
- [ ] Update `tab-knowledge.tsx` to use junction table
- [ ] Update `resolveToolsForAssistant()` to read from junction table
- [ ] Update chat API route to use junction table
- [ ] Add reverse query support ("which agents use this KB?")

### 0.3 — Agent Node Execution (`03-AGENT-NODE-EXECUTION.md`)
- [ ] Create `resolveSkillsForAssistant()` helper
- [ ] Refactor chat API route to use the helper
- [ ] Upgrade `executeAgent()` in `lib/workflow/nodes/agent.ts`
  - [ ] Call `resolveToolsForAssistant()`
  - [ ] Inject skills into system prompt
  - [ ] Use `stopWhen: stepCountIs(maxSteps)`
  - [ ] Capture tool call trace in output
- [ ] Ensure `ExecutionContext` carries `userId` and `organizationId`

### 0.4 — Trigger Infrastructure (`04-TRIGGER-INFRASTRUCTURE.md`)
- [ ] Add `croner` package dependency
- [ ] Create `lib/scheduler/cron-scheduler.ts`
- [ ] Create `lib/events/event-bus.ts`
- [ ] Wire up scheduler init in `instrumentation.ts`
- [ ] Update workflow status change API to register/unregister schedules
- [ ] Test: create workflow with cron trigger, verify it fires

**Milestone:** Agent in a workflow runs with full tools/skills/KB. Workflows can be attached to agents. Cron triggers work.

---

## Phase 1: Digital Employee MVP

> Deploy an agent as a Digital Employee that runs on a schedule.

### 1.1 — Data Model
- [ ] Add `DigitalEmployee`, `EmployeeRun`, `EmployeeApproval` to Prisma schema
- [ ] Add `EmployeeStatus`, `ApprovalStatus` enums
- [ ] Run migration
- [ ] Create CRUD API routes for Digital Employees
- [ ] Create `use-digital-employees.ts` hook

### 1.2 — Employee Package Generator
- [ ] Create `lib/digital-employee/package-generator.ts`
- [ ] Bundle agent config + workflows + tools + skills + MCP + KB into JSON
- [ ] Create `GET /api/dashboard/digital-employees/[id]/package` route
- [ ] Validate package completeness (all tools available, all KB groups exist, etc.)

### 1.3 — Development Runtime (Docker-based)
- [ ] Create Docker image: Alpine + ZeroClaw + Agent Runner
- [ ] Build Agent Runner that reads Employee Package
- [ ] Implement workflow execution inside container
- [ ] Persistent volume mounting for memory/workspace
- [ ] Communication: container ↔ platform API (status, results)
- [ ] Test: deploy employee → run workflow → results visible in platform

### 1.4 — Production Runtime (Firecracker)
- [ ] Integrate with existing Firecracker product
- [ ] Build Orchestrator service (deploy, startRun, terminate)
- [ ] VM lifecycle management (boot, heartbeat, timeout, teardown)
- [ ] Volume management (create, mount, persist, cleanup)
- [ ] JWT token generation for VM ↔ platform auth
- [ ] Test: same employee runs in Firecracker instead of Docker

### 1.5 — Scheduler Integration
- [ ] Connect Digital Employee schedules to trigger infrastructure
- [ ] Orchestrator: on cron trigger → spin up VM → execute → tear down
- [ ] EmployeeRun records created automatically for each scheduled execution

**Milestone:** Digital Employee deploys, runs a workflow on schedule in an isolated VM, persists memory across runs.

---

## Phase 2: Gateway (Human-in-the-Loop)

### 2.1 — Gateway Core
- [ ] Create `lib/gateway/` module
- [ ] Implement `ChannelAdapter` interface
- [ ] Build Message Router (format + dispatch)
- [ ] Build Callback Handler (parse + match + trigger resume)

### 2.2 — Dashboard Adapter
- [ ] WebSocket channel for real-time approval notifications
- [ ] Approval card component in dashboard
- [ ] Inline content review and respond UI
- [ ] Test full loop: employee requests approval → shows in dashboard → approve → employee continues

### 2.3 — Telegram Adapter
- [ ] Telegram Bot setup and webhook registration
- [ ] Send approval request as formatted message
- [ ] Parse reply (1/2/text) into approve/reject/edit
- [ ] Match reply to EmployeeApproval record
- [ ] Trigger orchestrator resume
- [ ] Test full loop with Telegram

### 2.4 — Pause/Resume Protocol
- [ ] State serialization in Agent Runner (write suspended state to volume)
- [ ] VM teardown on approval wait (serverless mode)
- [ ] VM resume: read suspended state, inject approval, continue workflow
- [ ] Timeout checker (background job for expired approvals)

### 2.5 — Additional Channels (as needed)
- [ ] WhatsApp Business API adapter
- [ ] Discord Bot adapter
- [ ] Slack Bot adapter
- [ ] Email adapter (SendGrid/SMTP)

**Milestone:** Employee drafts content → sends to Telegram for approval → supervisor approves → employee publishes. Full serverless loop.

---

## Phase 3: Management Dashboard

### 3.1 — Employee Directory Page
- [ ] `/dashboard/digital-employees` page
- [ ] `EmployeeCard` component
- [ ] Grid view with status filters
- [ ] Create button → onboarding wizard

### 3.2 — Onboarding Wizard
- [ ] Multi-step form component
- [ ] Step 1: Identity (name, agent selection)
- [ ] Step 2: Capabilities (tools, skills, MCP review)
- [ ] Step 3: Job Description (attach workflows)
- [ ] Step 4: Knowledge (attach KB groups)
- [ ] Step 5: Schedule (cron builder, workflow mapping)
- [ ] Step 6: Supervisor (assign, channel config, permissions)
- [ ] Step 7: Review & Deploy

### 3.3 — Individual Employee View
- [ ] Overview tab (status, metrics, recent activity)
- [ ] Activity tab (run history timeline)
- [ ] Approvals tab (pending + history)
- [ ] Memory tab (memory.db viewer)
- [ ] Settings tab (edit config)
- [ ] Performance tab (charts: success rate, token usage, cost)

### 3.4 — Supervisor Board
- [ ] Kanban component (Needs Approval | In Progress | Done)
- [ ] Real-time updates via WebSocket
- [ ] Cross-employee view
- [ ] Inline approval actions

### 3.5 — Sidebar Navigation
- [ ] Add "Digital Employees" section to dashboard sidebar
- [ ] Sub-items: Directory, Board
- [ ] Badge showing pending approval count

**Milestone:** Non-technical user can hire, configure, and manage Digital Employees entirely from the dashboard.

---

## Phase 4: Ecosystem & Marketplace

### 4.1 — Employee Templates
- [ ] `EmployeeTemplate` model
- [ ] Template gallery page
- [ ] "Use Template" flow (scaffold from template)
- [ ] Official templates: LinkedIn Marketer, Email Manager, Data Analyst, Customer Support

### 4.2 — Template Marketplace
- [ ] Community template submissions
- [ ] Rating and review system
- [ ] Install flow (template → customize → deploy)

### 4.3 — Multi-Employee Coordination
- [ ] `EmployeeTeam` and `EmployeeTeamMember` models
- [ ] Pipeline definition format
- [ ] Pipeline engine (step execution, output routing, condition evaluation)
- [ ] Team Pipeline editor UI
- [ ] TeamRun tracking

### 4.4 — Developer APIs
- [ ] Public API for managing Digital Employees programmatically
- [ ] Webhook events for employee lifecycle (deployed, ran, approved, failed)
- [ ] SDK/CLI for deploying employees from code

**Milestone:** Third-party developers build and sell employee templates. Multi-employee pipelines work.

---

## Phase 5: Platform Identity Evolution (Future)

> Driven by adoption data, not a predetermined timeline.

- [ ] Analyze adoption metrics: % users using Digital Employees vs. chat
- [ ] If DE becomes primary use case:
  - [ ] Reposition sidebar: Digital Employees first
  - [ ] Rename: Agent Builder → "Employee Builder"
  - [ ] Rename: Workflow Editor → "Job Designer"
  - [ ] Rename: Knowledge Base → "Employee Training"
  - [ ] Landing page focuses on Digital Employees
- [ ] If DE is secondary: keep current layout, DE as a feature tab

---

## Proof of Concept: LinkedIn Digital Marketer

Build this end-to-end to validate the full stack. Cross-cuts Phases 0-3:

| Step | Phase | What |
|------|-------|------|
| 1 | 0.1 | Create "Write LinkedIn Post" TASK workflow in workflow editor |
| 2 | 0.1 | Attach workflow to a "Marketing Agent" via AssistantWorkflow |
| 3 | 0.3 | Verify agent node in workflow runs with web_search tool + brand KB |
| 4 | 0.4 | Set cron trigger: daily at 8 AM |
| 5 | 1.1 | Create DigitalEmployee record pointing to Marketing Agent |
| 6 | 1.3 | Deploy in Docker container, verify workflow executes |
| 7 | 2.2 | Add APPROVAL node to workflow before publish step |
| 8 | 2.3 | Supervisor reviews draft on Telegram, approves |
| 9 | 1.4 | Move to Firecracker VM, verify same behavior |
| 10 | 3.3 | View employee activity and metrics in dashboard |

**This single use case validates**: workflow composition, agent execution with tools, cron triggers, VM runtime, human-in-the-loop approval, and dashboard management.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Phase 0 takes longer than expected | Can start Phase 1 data model work in parallel |
| Firecracker integration complex | Docker fallback for all development. Production can wait. |
| ZeroClaw compatibility issues | Agent Runner is the abstraction layer. Can swap ZeroClaw for direct execution. |
| Approval gateway latency | Dashboard adapter first (instant). Messaging channels are additive. |
| Scope creep from multi-employee | Phase 4 is explicitly future. Pipeline data model designed now, built later. |
