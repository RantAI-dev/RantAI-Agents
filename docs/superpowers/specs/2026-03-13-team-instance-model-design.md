# Team = Instance Model — Design Spec

**Date:** 2026-03-13
**Status:** Approved
**Approach:** Hard migration (Approach B) — no backwards compatibility needed

## Overview

Restructure Digital Employees so that every employee belongs to a team, and every team maps to exactly one RantaiClaw container instance. Solo employees get an implicit team of one. This replaces the current dual model where employees can run either as solo containers or as part of a group container.

## Core Principle

**Team = Instance = Container.** One team, one container, one RantaiClaw gateway. All employees in a team share the same workspace and gateway.

## Decisions

| Question | Answer |
|----------|--------|
| Can employees exist without a team? | No — every employee belongs to exactly one team |
| Solo employees? | Get an implicit team (isImplicit=true) automatically created |
| Subscription limits? | Not enforced yet — build the model, add billing later |
| Employee creation flow? | Wizard asks: "Add to existing team" or "Create new team" |
| Migration strategy? | Hard migration — not in production, no backwards compat needed |

---

## Section 1: Data Model

### EmployeeGroup (updated)

Add one field:

```
isImplicit  Boolean  @default(false)
```

Marks auto-created solo teams. These are real teams that run as real containers, but the UI can treat them differently (e.g. show the employee's name instead of a team name).

Keep all existing fields: `containerId`, `containerPort`, `noVncPort`, `gatewayToken`, `status`.

### DigitalEmployee (changes)

**Make required:**
- `groupId` — non-nullable FK to EmployeeGroup

**Remove fields:**
- `containerId` — container state lives on the team
- `containerPort` — container state lives on the team
- `noVncPort` — container state lives on the team
- `gatewayToken` — container state lives on the team

An employee's container status = their team's container status.

### Migration

Since we're not in production, use `prisma db push` after schema changes. For any existing data:

1. For each ungrouped employee (`groupId IS NULL`): create an implicit EmployeeGroup with `isImplicit: true`, name = employee name
2. If the employee had solo container fields, copy them to the new implicit team
3. Set `groupId` on all employees
4. Remove the container columns from DigitalEmployee

---

## Terminology

**Group** (code) = **Team** (UI). The Prisma model is `EmployeeGroup`, API routes are `/groups/`, code uses `groupId`. The UI says "Team" everywhere. This mapping is canonical.

---

## Section 2: Backend — Orchestrator & API

### Orchestrator Interface (`lib/digital-employee/orchestrator.ts`)

The `EmployeeOrchestrator` interface defines solo container methods. These must be removed or redirected:

**Remove from interface and `docker-orchestrator.ts` implementation:**
- `deploy(employeeId)` — solo container deployment
- `startContainer(employeeId)` — solo container start
- `stopContainer(employeeId)` — solo container stop
- `undeploy(employeeId)` — solo container teardown
- `getContainerUrl(employeeId)` — solo container URL lookup
- `getStatus(employeeId)` — solo container status
- `startRun(employeeId, ...)` — solo run trigger
- `resumeRun(employeeId, ...)` — solo run resume
- `terminate(employeeId)` — solo run termination
- Any code reading `containerPort`/`gatewayToken` from DigitalEmployee

**Keep (unchanged):**
- `deployGroup()` — deploys a team's container
- `startGroupContainer()` — starts a team's container
- `stopGroupContainer()` — stops a team's container
- `getGroupContainerUrl()` — returns container URL for a team

These become the only container lifecycle methods.

### Per-Employee Action Routes — redirect to team

These routes currently call solo orchestrator methods and must be updated to delegate through the employee's team:

- `app/api/dashboard/digital-employees/[id]/deploy/route.ts` — look up employee's `groupId`, call `orchestrator.deployGroup(groupId)`
- `app/api/dashboard/digital-employees/[id]/start/route.ts` — look up employee's `groupId`, call `orchestrator.startGroupContainer(groupId)`
- `app/api/dashboard/digital-employees/[id]/stop/route.ts` — look up employee's `groupId`, call `orchestrator.stopGroupContainer(groupId)`
- `app/api/dashboard/digital-employees/[id]/resume/route.ts` — resolve container through group, use group's `gatewayToken`/`containerPort`

These become thin wrappers: employee → group → container action.

### Chat Route (`app/api/dashboard/digital-employees/[id]/chat/route.ts`)

Currently reads `employee.gatewayToken` and `employee.containerPort` directly. Must be updated to:
1. Look up employee's `groupId`
2. Get group's `containerPort` and `gatewayToken`
3. Proxy to group container

### Workspace/VNC Proxy Routes

These routes resolve container URLs and must route through the group:
- `app/api/dashboard/digital-employees/[id]/vnc/` — use group's `noVncPort`
- `app/api/dashboard/digital-employees/[id]/workspace/` — use group's `containerPort`

### Employee Creation API (`POST /api/dashboard/digital-employees`)

Updated flow:

1. Accept optional `groupId` in request body
2. If `groupId` provided → validate team exists and belongs to org → assign employee
3. If `groupId` not provided → auto-create implicit team (`isImplicit: true`, name = employee name) → assign employee
4. Return employee with `groupId` set

### Task Aggregator (`lib/digital-employee/task-aggregator.ts`)

**`getActiveContainers(orgId)`:**
- Remove the solo employee query (current lines 39-58 that query DigitalEmployee for containerPort)
- Only query EmployeeGroup containers

**`resolveWriteTarget(assigneeId, orgId)`:**
- Look up employee → get their `groupId` → get group's `containerPort`/`gatewayToken`
- Remove direct employee container field lookup

**`resolveContainerForSource(sourceEmployeeId, sourceGroupId)`:**
- Always resolve through group container
- Remove employee container fallback
- `ContainerTarget.sourceType` can be simplified (always "group"), but may keep for now to minimize churn

### Groups API

Existing CRUD stays. One behavior change:
- `DELETE /api/dashboard/groups/:id` — return 409 if group has members. Members must be moved to another team (or removed, which auto-creates implicit solo teams for them) before the group can be deleted

---

## Section 3: Frontend — Teams Tab & Team Card

### Teams Tab (`tab-teams.tsx`)

- Shows all teams (explicit and implicit)
- Each team rendered as a TeamCard
- "Create Team" button → dialog with name + description (functional, not "coming soon")
- Search filters by team name
- Status filter: All / Active / Idle

### Team Card (`team-card.tsx`) — updated

- Prominent instance status badge: green dot + "Running" when container is active, gray "Idle" when stopped
- Container port displayed subtly (dev purposes)
- Quick actions: Deploy / Start / Stop buttons directly on card (calls existing group API)
- Implicit solo teams: show single employee's avatar large, team name = employee name
- Multi-member teams: avatar stack (existing implementation)
- Task counts strip stays (todo/in-progress/review/done)
- Click card → navigates to `/dashboard/groups/{id}`

### Employee Cards (Employees tab)

- Show which team the employee belongs to (small badge/label under name)
- Remove any direct container-related display from individual employee cards

---

## Section 4: Frontend — Employee Wizard & Team Management Page

### New Employee Wizard (update `/dashboard/digital-employees/new`)

Add "Team Assignment" step:
- Radio: "Add to existing team" → dropdown of available teams
- Radio: "Create new team" → inline name + description fields
- Default: "Create new team" (pre-filled with employee name)
- On submit: create team if needed → create employee with groupId

### Team Management Page (`/dashboard/groups/[id]/page.tsx`) — new

**Header:**
- Team name + description (editable inline)
- Instance status badge (IDLE / DEPLOYING / ACTIVE / STOPPING)

**Instance Controls:**
- Deploy / Start / Stop / Restart buttons
- Calls existing `/api/dashboard/groups/:id/deploy`, `/start`, `/stop` endpoints

**Members Section:**
- List of employees in this team
- "Add member" — select from unassigned employees or create new
- "Remove member" — moves employee to a new implicit solo team (cannot be ungrouped)
- Click member → navigates to employee detail page

**Tasks Section:**
- Filtered task list for this team's groupId
- Reuses existing TabTasks component with groupId filter

**Activity Feed:**
- Recent events from the team's container
- Reuses existing events API filtered by group

**Implicit solo teams:**
- Same page layout
- Members section shows single employee
- "Add member" converts implicit → explicit team (sets `isImplicit: false`)

---

## Files Affected

### Schema
- `prisma/schema.prisma` — add `isImplicit` to EmployeeGroup, make `groupId` required on DigitalEmployee, remove container fields from DigitalEmployee

### Backend — Orchestrator
- `lib/digital-employee/orchestrator.ts` — remove solo methods from interface
- `lib/digital-employee/docker-orchestrator.ts` — remove solo container implementation

### Backend — API Routes
- `app/api/dashboard/digital-employees/route.ts` — auto-create implicit team on employee creation
- `app/api/dashboard/digital-employees/[id]/deploy/route.ts` — redirect to group deploy
- `app/api/dashboard/digital-employees/[id]/start/route.ts` — redirect to group start
- `app/api/dashboard/digital-employees/[id]/stop/route.ts` — redirect to group stop
- `app/api/dashboard/digital-employees/[id]/resume/route.ts` — resolve container through group
- `app/api/dashboard/digital-employees/[id]/chat/route.ts` — resolve gateway through group
- `app/api/dashboard/digital-employees/[id]/vnc/` — resolve noVncPort through group
- `app/api/dashboard/digital-employees/[id]/workspace/` — resolve containerPort through group
- `app/api/dashboard/groups/[id]/route.ts` — return 409 on delete with members

### Backend — Task Aggregator
- `lib/digital-employee/task-aggregator.ts` — remove solo employee container queries

### Frontend
- `app/dashboard/digital-employees/_components/tab-teams.tsx` — functional create, status filter
- `app/dashboard/digital-employees/_components/team-card.tsx` — instance controls, status badge, implicit team handling
- `app/dashboard/digital-employees/page.tsx` — employee cards show team badge
- `app/dashboard/digital-employees/new/page.tsx` — team assignment step
- `app/dashboard/groups/[id]/page.tsx` — **new** team management page

### Hooks
- `hooks/use-employee-groups.ts` — add `isImplicit` to return type, remove `containerPort` from `TeamMember` (container state is on the group, not the member)
