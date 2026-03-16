# Task Engine Frontend — Design Spec

**Date:** 2026-03-13
**Status:** Approved design
**Depends on:** [Backend spec](2026-03-12-clickup-task-system-design.md) (implemented & merged)

## Overview

Build the frontend UI for the task engine that was implemented in RantaiClaw. The dashboard provides a unified view of tasks across all digital employees, with Kanban board, list view, task detail slide-over, teams tab, and per-employee task filtering.

## Architecture: Fan-Out + Prisma Cache

### Data Flow

RantaiClaw containers are the source of truth. Each employee container runs its own gateway with a SQLite-backed task engine. The dashboard aggregates across all containers.

**Container types:**
- **Individual containers** — one per standalone employee. Port stored in `DigitalEmployee.containerPort`.
- **Group containers** — one per team (`MODE=group-gateway`). Port stored in `EmployeeGroup.containerPort`. Employees in a group do NOT have their own container; their tasks live in the group gateway.

**Reads:**
1. Dashboard API routes query ALL active containers' `/tasks` endpoints in parallel
2. Two query paths:
   - Individual employees: `DigitalEmployee` where `containerPort IS NOT NULL` → `http://localhost:{containerPort}/tasks`
   - Group containers: `EmployeeGroup` where `containerPort IS NOT NULL` → `http://localhost:{containerPort}/tasks`
3. Auth: each request includes `Authorization: Bearer {gatewayToken}` (from `DigitalEmployee.gatewayToken` or `EmployeeGroup.gatewayToken`)
4. Results are merged, deduplicated by task ID (RantaiClaw uses UUID v4; collisions assumed negligible). Tiebreak: latest `updatedAt` wins.
5. Merged results are cached in Prisma (`EmployeeTask`, `EmployeeTaskComment`, `EmployeeTaskEvent`)
6. For stopped containers, dashboard serves from Prisma cache (read-only, greyed out)

**Writes:**
1. Dashboard sends write (create/update/review/comment) to the target container's gateway
2. Target container lookup:
   - Check `DigitalEmployee.groupId` for the assignee. If non-null and the group has a running container (`EmployeeGroup.containerPort IS NOT NULL`), use the group gateway URL.
   - Otherwise, use the employee's own `containerPort`.
   - Same `/tasks` endpoint in both cases (group gateway routes internally by assignee).
3. Auth: `Authorization: Bearer {gatewayToken}` on all outbound requests
4. On success, Prisma cache is updated with the response
5. Unassigned tasks go to the first active container; Prisma-only if none running

**Cache sync triggers:**
- Every dashboard task list query (opportunistic refresh)
- Container start/stop lifecycle events (via docker orchestrator)
- Heartbeat responses (piggyback task counts)

### Why Not Prisma-Only?

RantaiClaw's task engine already exists with full state machine, validation, event recording, and review logic. Duplicating this in Next.js would be redundant. The container gateway is the authoritative system — Prisma is a read-through cache for offline visibility.

### Offline Container Behavior

- Tasks from stopped containers show with a "Container offline" indicator
- Status changes and comments are disabled (greyed out buttons)
- Task detail panel shows cached data but marks it as stale
- When container restarts, cache refreshes automatically

## Data Model (Prisma Cache Tables)

Mirrors the RantaiClaw SQLite schema. These tables are caches, not sources of truth.

**Important:** IDs on all three cache models are sourced from the RantaiClaw SQLite engine (UUID v4) and must be provided explicitly on upsert — do NOT add `@default(cuid())`. `createdAt` and `updatedAt` are passed through from the container response, not set by Prisma defaults.

```prisma
model EmployeeTask {
  id                  String    @id
  organizationId      String
  title               String
  description         String?   @db.Text
  status              String    @default("TODO")
  priority            String    @default("MEDIUM")
  assigneeId          String?
  groupId             String?
  reviewerId          String?
  humanReview         Boolean   @default(false)
  reviewStatus        String?
  reviewComment       String?   @db.Text
  parentTaskId        String?
  createdByEmployeeId String?
  createdByUserId     String?
  dueDate             DateTime?
  completedAt         DateTime?
  orderInStatus       Int       @default(0)
  orderInParent       Int       @default(0)
  metadata            Json      @default("{}")
  sourceEmployeeId    String    // which container this task came from
  isStale             Boolean   @default(false) // true when container is offline
  cachedAt            DateTime  @default(now())
  createdAt           DateTime
  updatedAt           DateTime

  subtasks   EmployeeTask[]  @relation("subtasks")
  parentTask EmployeeTask?   @relation("subtasks", fields: [parentTaskId], references: [id])
  comments   EmployeeTaskComment[]
  events     EmployeeTaskEvent[]

  organization    Organization     @relation(fields: [organizationId], references: [id])
  assignee        DigitalEmployee? @relation("assignedTasks", fields: [assigneeId], references: [id])
  group           EmployeeGroup?   @relation("groupTasks", fields: [groupId], references: [id])
  reviewer        DigitalEmployee? @relation("reviewingTasks", fields: [reviewerId], references: [id])
  createdByEmployee DigitalEmployee? @relation("createdTasks", fields: [createdByEmployeeId], references: [id])

  @@index([organizationId, status])
  @@index([assigneeId, status])
  @@index([groupId])
  @@index([parentTaskId])
}

model EmployeeTaskComment {
  id                String   @id
  taskId            String
  content           String   @db.Text
  authorType        String   @default("HUMAN")
  authorEmployeeId  String?
  authorUserId      String?
  createdAt         DateTime

  task EmployeeTask @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId, createdAt])
}

model EmployeeTaskEvent {
  id                String   @id
  taskId            String
  eventType         String
  actorType         String
  actorEmployeeId   String?
  actorUserId       String?
  data              Json     @default("{}")
  createdAt         DateTime

  task EmployeeTask @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId, createdAt])
}
```

**Additional fields vs RantaiClaw:**
- `sourceEmployeeId` — tracks which container owns this task (for routing writes)
- `isStale` — set to true when the source container goes offline
- `cachedAt` — last sync timestamp

## API Routes

### Dashboard Routes

```
GET    /api/dashboard/tasks                — fan-out list (merge + cache)
POST   /api/dashboard/tasks                — create task (proxy to container)
GET    /api/dashboard/tasks/[id]           — get detail (container or cache)
PUT    /api/dashboard/tasks/[id]           — update task (proxy to container)
DELETE /api/dashboard/tasks/[id]           — delete task (proxy + remove cache)
POST   /api/dashboard/tasks/[id]/review    — submit review (proxy to container)
GET    /api/dashboard/tasks/[id]/comments  — list comments (container or cache)
POST   /api/dashboard/tasks/[id]/comments  — add comment (proxy to container)
GET    /api/dashboard/tasks/[id]/events    — list events (container or cache)
```

### Fan-Out Helper

`lib/digital-employee/task-aggregator.ts` — shared logic for querying containers:

```typescript
async function fanOutTaskQuery(orgId: string, filter?: TaskFilter): Promise<AggregatedTasks> {
  // 1. Get all active individual employees (containerPort IS NOT NULL, groupId IS NULL)
  // 2. Get all active group containers (EmployeeGroup where containerPort IS NOT NULL)
  // 3. Build target list: [{ url, gatewayToken, sourceId }] for both types
  // 4. Query each container's GET /tasks in parallel with Promise.allSettled
  //    - Include Authorization: Bearer {gatewayToken} header
  // 5. Merge results, deduplicate by task ID (latest updatedAt wins)
  // 6. Upsert merged tasks into Prisma cache
  // 7. Add cached tasks from offline containers (marked isStale)
  // 8. Return merged + cached results
}
```

## UI Components

### 1. Digital Employees Page — Tab Structure

The `/dashboard/digital-employees` page gets three top-level tabs via query param routing (`?tab=employees|teams|tasks`):

- **Employees** (default, existing) — unchanged, but employee cards now show open task count
- **Teams** (new) — grid of team cards with task progress
- **Tasks** (new) — Kanban board + list view with task management

Tab badge: Tasks tab shows red badge with open task count (non-done, non-cancelled).

### 2. Tasks Tab — Board View (Kanban)

Four columns: **To Do → In Progress → In Review → Done**

Each column:
- Colored dot + title + count
- "+" button to quick-add a task into that status
- Scrollable task cards

Task card contents (from mockup `tasks-kanban.html`):
- Title
- Priority badge (High=red / Medium=amber / Low=blue)
- Creator attribution ("assigned by human" or "created by Aria")
- Subtask progress bar if subtasks exist ("3/5 done")
- Running indicator for active tasks ("● Running", "⏳ 45m elapsed")
- Review indicator ("👁 Needs human review" or "🤖 Reviewing: Aria")
- Assignee avatar + name
- Due date (red if overdue)
- Done tasks: strikethrough title, faded opacity, "✓ Approved" badge

CANCELLED tasks are hidden from the board by default. A "Show cancelled" toggle in the toolbar reveals them as a fifth column with red-dim styling.

Visual cues:
- In Progress cards: blue left border
- In Review cards: violet left border
- Done cards: opacity 0.7

### 3. Tasks Tab — List View

Table with columns: **Name | Assignee | Team | Due date | Priority | ⋯ menu**

Grouped by status (default) with collapsible status group headers:
- Status dot + label + count ("● In Progress — 2")
- "+ Add Task" row at the bottom of each group

Task rows:
- Subtask toggle (▼) with count chip if has subtasks
- Status icon (⚪/🔵/🟣/✅)
- Subtasks indented below parent with own columns
- Done items: strikethrough + faded
- Review tags inline

"Group by" dropdown: **Status** (default) | Team | Assignee | Priority

CANCELLED tasks: hidden by default in list view. Same "Show cancelled" toggle as board view reveals them as a collapsed status group.

### 4. Task Detail — Slide-Over Panel

640px panel from the right. Contents (from mockup `task-detail-v2.html`):

**Header:** Close button, task ID (monospace), attach/copy link/⋯ buttons

**Title area:** Status dropdown (clickable), editable title (inline)

**Properties grid:**
- 👤 Assignee — employee avatar + name + online indicator
- 👥 Team — colored team tag pill
- 🚩 Priority — badge
- 📅 Due date — red if overdue
- 👁 Reviewer — "Human review required" / employee name / "None"
- ✏️ Created by — avatar + name + relative time

**Description:** Rich text block

**Subtasks section:**
- Progress bar ("3 of 4 done")
- Each subtask: checkbox (styled per status), text, assignee, review status tag
- Review status tags: "✓ Approved" (green) | "👁 Awaiting review" (violet, with inline approve/changes/reject buttons) | "👁 Review required" (violet dimmed) | "No review" (gray italic)
- "+ Add subtask" row
- Hint: "Toggle review per subtask via the ⋯ menu"

**Task-level review bar** (only when status = IN_REVIEW):
- Purple highlight: "{Employee} completed this task and is awaiting your review"
- Three buttons: ✓ Approve | ↩ Changes | ✗ Reject
- When not in review: dashed placeholder "Task-level review will activate when all subtasks are done"

**Activity timeline:**
- Chronological with dot + line connector
- Events: created, status changes, subtask completions, reviews, comments, assignments
- Each entry: avatar dot, description with bold names, relative timestamp

**Comment box** (sticky at bottom):
- Input: "Add a comment or instruction..."
- Send button

### 5. Teams Tab

Grid of team cards (from mockup `teams-tab.html`):

Each card:
- Team icon + name + description + status badge
- Member avatar stack with online dots
- Stacked progress bar (done=green / review=violet / in-progress=blue)
- Task count breakdown by status
- "Manage" button → existing group detail page
- Empty teams: dashed border + "Add Members" CTA

### 6. Employee Detail Page — Tasks Nav

New **Tasks** sidebar nav item (between History and Workspace):
- Shows tasks filtered to this employee (assignee_id = employee.id)
- Same list view (grouped by status)
- Click → slide-over panel
- "+ New Task" pre-fills this employee as assignee

### 7. Task Creation

"+ New Task" or "+ Add Task" opens a dialog:
- Title (required)
- Description (textarea)
- Assignee (employee dropdown from org)
- Team (group dropdown)
- Priority (High / Medium / Low, default Medium)
- Due date (date picker)
- Reviewer (None / Human / specific employee)
- Subtasks (optional, inline add rows — title + assignee per subtask)

## Hooks

### `useTasks(filter?)`
```typescript
// Fetches tasks via /api/dashboard/tasks with optional filters
// Returns: { tasks, isLoading, error, refresh, createTask, updateTask, deleteTask }
// Supports: status, assigneeId, groupId, priority, topLevelOnly filters
// Polling: auto-refreshes every 30s when the Tasks tab is active
```

### `useTaskDetail(taskId)`
```typescript
// Fetches full task detail via /api/dashboard/tasks/[id]
// Returns: { task, subtasks, comments, events, isLoading, error,
//            updateTask, addComment, submitReview, addSubtask }
// Polling: auto-refreshes every 15s while the slide-over panel is open
```

## File Structure

```
app/dashboard/digital-employees/
  page.tsx                              — add tab routing (?tab=)
  _components/
    tab-tasks.tsx                       — Tasks tab (board + list views)
    tab-teams.tsx                       — Teams tab
    task-board.tsx                      — Kanban board component
    task-list.tsx                       — List/table view component
    task-card.tsx                       — Kanban card component
    task-detail-panel.tsx               — Slide-over panel
    task-create-dialog.tsx              — Create task dialog
    task-review-bar.tsx                 — Review action bar
    subtask-list.tsx                    — Subtask list with review buttons
    team-card.tsx                       — Team card component

app/dashboard/digital-employees/[id]/
  _components/
    tab-tasks.tsx                       — Per-employee tasks tab

app/api/dashboard/tasks/
  route.ts                             — GET (fan-out list) + POST (create)
  [id]/
    route.ts                           — GET (detail) + PUT (update) + DELETE
    review/route.ts                    — POST (submit review)
    comments/route.ts                  — GET + POST
    events/route.ts                    — GET

hooks/
  use-tasks.ts                         — Task list hook
  use-task-detail.ts                   — Task detail hook

lib/digital-employee/
  task-aggregator.ts                   — Fan-out + cache logic
  task-types.ts                        — TypeScript types matching RantaiClaw
```

## What's NOT Changing

- Employee lifecycle (deploy, start, stop)
- Autonomy/trust system
- Integrations, Workspace IDE, Chat tab
- Pipelines
- Groups detail page (member management)
- RantaiClaw Rust source (backend is complete)

## Visual Reference

Mockups from brainstorming session in `.superpowers/brainstorm/1524008-1773288967/`:
- `tasks-kanban.html` — Kanban board view
- `tasks-subtasks-v2.html` — Grouped list view with nested subtasks
- `task-detail-v2.html` — Task detail slide-over with per-subtask review
- `teams-tab.html` — Teams tab with team cards
