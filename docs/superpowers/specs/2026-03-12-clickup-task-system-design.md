# ClickUp-Inspired Task System for Digital Employees

**Date:** 2026-03-12
**Status:** Approved design

## Overview

Replace the scattered messaging/task/approval system with a unified, ClickUp-inspired task management system. Tasks are the central unit of work — humans and employees create them, employees execute them, and reviewers (human or supervisor employee) approve the results.

## Design Decisions

- **No new sidebar items.** Everything lives within the Digital Employees section under three tabs: **Employees | Teams | Tasks**.
- **Teams = existing Groups.** No new entity — reuse the `EmployeeGroup` model as the team concept.
- **Tasks are top-level, subtasks nest one level deep.** No deeper nesting.
- **Team is a property on tasks/subtasks**, not the grouping structure. Tasks are grouped by Status (default), and can be re-grouped by Team, Assignee, or Priority.
- **Both humans and employees can create tasks.** Employees can also create tasks for each other or themselves via runtime tools.
- **Formal review flow** with optional per-subtask review.

## Architecture

### 1. Digital Employees Page — Tab Structure

The `/dashboard/digital-employees` page gets three top-level tabs:

**Employees tab** (existing, unchanged)
- Grid/table view of all employees
- Same SpotlightCard design, filters, search
- Employee cards now show an open task count

**Teams tab** (replaces `/dashboard/groups` as the primary view)
- Grid of team cards (existing Groups data)
- Each card shows: icon, name, description, status, member avatars with online dots, stacked task progress bar (done/review/in-progress), task count breakdown, "Manage" button
- Clicking a card goes to the existing group detail page
- "+ Create Team" button (inline form like current groups page)
- Empty team shown with dashed border + "Add Members" CTA

**Tasks tab** (new)
- Toggle between **Board** (Kanban) and **List** views
- Toolbar: search, "Group by" dropdown, filters (All / My Tasks / Unassigned), view toggle, "+ New Task" button
- Badge on the tab showing open task count (e.g., "Tasks 7")

### 2. Tasks Tab — Board View (Kanban)

Four columns: **To Do → In Progress → In Review → Done**

Each column has:
- Colored dot + title + count
- "+" button to add a task directly into that column
- Scrollable task cards

Task card contents:
- Title
- Priority badge (High/Medium/Low with color)
- Creator attribution ("assigned by human" or "created by Aria")
- Subtask progress bar if subtasks exist (e.g., "3/5 done")
- Running indicator for active tasks ("● Running", "⏳ 45m elapsed")
- Review indicator for in-review tasks ("👁 Needs human review" or "🤖 Reviewing: Aria")
- Assignee avatar + name
- Due date (red if overdue)
- Done tasks: strikethrough title, faded, "✓ Approved" badge

Visual cues:
- In Progress cards: blue left border
- In Review cards: violet left border
- Done cards: reduced opacity (0.7)
- Overdue due dates: red text

### 3. Tasks Tab — List View

Table with columns: **Name | Assignee | Team | Due date | Priority | ⋯ menu**

Grouped by status (default) with collapsible status group headers:
- Status dot + label + count (e.g., "● In Progress — 2")
- "+ Add Task" row at the bottom of each group

Task rows:
- Subtask toggle button (▼) with subtask count chip (🔗 3) if task has subtasks
- Status icon (⚪ To Do, 🔵 In Progress, 🟣 In Review, ✅ Done)
- Subtasks indented below parent, with their own assignee, team, and due columns
- Subtasks can have different assignees and teams than parent
- Done items: strikethrough + faded
- Review tags inline on task name

"Group by" dropdown switches grouping: **Status** (default) | Team | Assignee | Priority — same data, different grouping. Each mode uses the same collapsible group header pattern.

### 4. Task Detail — Slide-Over Panel

Clicking a task opens a slide-over panel from the right (640px wide). Contents:

**Header:** Close button, task ID (TASK-042), attach/copy link/⋯ buttons

**Title area:**
- Status dropdown (clickable to change: To Do / In Progress / In Review / Done)
- Editable task title (inline)

**Properties grid (label: value):**
- 👤 Assignee — employee avatar + name + online indicator
- 👥 Team — colored team tag pill
- 🚩 Priority — High / Medium / Low badge
- 📅 Due date — date, red if overdue
- 👁 Reviewer — "Human review required" or specific employee, or "None"
- ✏️ Created by — avatar + name + relative time

**Description:** Rich text block with the task instructions.

**Subtasks section:**
- Overall progress bar (e.g., "3 of 4 done")
- Each subtask shows:
  - Checkbox (empty / blue border for in-progress / 👁 for in-review / ✓ green for done)
  - Subtask text
  - Assignee
  - Review status tag per subtask (one of):
    - "✓ Approved" (green) — reviewed and approved
    - "👁 Awaiting review" (violet) — completed, needs review, shows inline approve/changes/reject buttons
    - "👁 Review required" (violet, dimmed) — will need review when done, currently in progress
    - "No review" (gray italic) — review not required for this subtask
    - No tag — review not configured
  - Due/status text
- Inline review buttons on subtasks awaiting review: ✓ Approve | ↩ Changes | ✗ Reject
- "+ Add subtask" row
- Hint: "Toggle review per subtask via the ⋯ menu"

**Task-level review bar** (only when task status is "In Review"):
- Purple highlight bar: "Nova completed this task and is awaiting your review"
- Three buttons: ✓ Approve | ↩ Changes | ✗ Reject
- If task is not yet In Review: dashed placeholder "Task-level review will activate when all subtasks are done or approved"

**Activity timeline:**
- Chronological list with dot + line connector
- Events: task created, status changes, subtask completions, subtask reviews, comments, assignment changes
- Each entry: avatar dot, description with bold names, relative timestamp

**Comment box** (sticky at bottom):
- Input: "Add a comment or instruction..."
- Send button

### 5. Subtask Detail — Same Panel

Clicking a subtask opens the same slide-over panel layout:
- Title, status, properties (assignee, team, priority, due, reviewer, created by)
- Description
- Review actions (if review enabled)
- Activity timeline
- Comment box
- **No nested subtasks** — one level deep only

### 6. Task Creation

"+ New Task" button or "+ Add Task" row opens a creation form (could be inline or modal):
- Title (required)
- Description
- Assignee (employee dropdown)
- Team (group dropdown)
- Priority (High / Medium / Low)
- Due date
- Reviewer (None / Human / specific employee)
- Subtasks (add inline during creation)

### 7. Employee Detail Page — Tasks Tab

The existing employee detail page (`/dashboard/digital-employees/[id]`) gets a new **Tasks** nav item in the sidebar (between History and Workspace).

Shows only tasks assigned to this employee:
- Same list view (grouped by status)
- Same task card click → slide-over panel
- "+ New Task" pre-fills this employee as assignee

### 8. Data Model

**New: `EmployeeTask` table**
```
id              String    @id @default(cuid())
organizationId  String    (FK → Organization)
title           String
description     String?   @db.Text
status          String    (default: "TODO") — "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE"
priority        String    (default: "MEDIUM") — "LOW" | "MEDIUM" | "HIGH"
assigneeId      String?   (FK → DigitalEmployee)
groupId         String?   (FK → EmployeeGroup) — the team
reviewerId      String?   (FK → DigitalEmployee, nullable) — supervisor employee reviewer
humanReview     Boolean   (default: false) — requires human review
reviewStatus    String?   — "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"
reviewComment   String?   @db.Text
parentTaskId    String?   (FK → EmployeeTask, nullable) — for subtasks
createdById     String?   (FK → DigitalEmployee, nullable) — null = created by human
dueDate         DateTime?
completedAt     DateTime?
order           Int       (default: 0) — for drag-drop ordering
metadata        Json      (default: {})
createdAt       DateTime  @default(now())
updatedAt       DateTime  @updatedAt

@@index([organizationId, status])
@@index([assigneeId, status])
@@index([groupId])
@@index([parentTaskId])
```

**New: `EmployeeTaskComment` table**
```
id              String    @id @default(cuid())
taskId          String    (FK → EmployeeTask)
content         String    @db.Text
authorType      String    — "HUMAN" | "EMPLOYEE"
authorId        String?   (FK → DigitalEmployee, nullable)
createdAt       DateTime  @default(now())
```

**New: `EmployeeTaskEvent` table**
```
id              String    @id @default(cuid())
taskId          String    (FK → EmployeeTask)
type            String    — "CREATED" | "STATUS_CHANGED" | "ASSIGNED" | "REVIEW_SUBMITTED" | "REVIEW_RESPONDED" | "COMMENT" | "SUBTASK_COMPLETED"
actorType       String    — "HUMAN" | "EMPLOYEE"
actorId         String?   (FK → DigitalEmployee, nullable)
data            Json      (default: {}) — event-specific payload
createdAt       DateTime  @default(now())

@@index([taskId, createdAt])
```

### 9. API Routes

```
GET    /api/dashboard/digital-employees/tasks          — list all tasks (filterable)
POST   /api/dashboard/digital-employees/tasks          — create task
GET    /api/dashboard/digital-employees/tasks/[id]      — get task detail
PUT    /api/dashboard/digital-employees/tasks/[id]      — update task
DELETE /api/dashboard/digital-employees/tasks/[id]      — delete task
POST   /api/dashboard/digital-employees/tasks/[id]/review  — submit review (approve/changes/reject)

GET    /api/dashboard/digital-employees/tasks/[id]/comments — list comments
POST   /api/dashboard/digital-employees/tasks/[id]/comments — add comment

GET    /api/dashboard/digital-employees/tasks/[id]/events   — activity timeline

# Runtime (employee-facing)
GET    /api/runtime/tasks                              — get assigned tasks
POST   /api/runtime/tasks                              — create task (employee-initiated)
PUT    /api/runtime/tasks/[id]/status                  — update task status
POST   /api/runtime/tasks/[id]/submit-review           — submit for review
POST   /api/runtime/tasks/[id]/comments                — add comment
```

### 10. Runtime Tools (Agent-Runner)

Replace existing `send_message`/`check_inbox`/`reply_message` tools with task-oriented tools:

- **`list_tasks`** — get tasks assigned to this employee (filterable by status)
- **`create_task`** — create a new task (assign to self, another employee, or leave unassigned)
- **`update_task_status`** — move task to next status (TODO → IN_PROGRESS → IN_REVIEW → DONE)
- **`create_subtask`** — add subtask to an existing task
- **`complete_subtask`** — mark subtask done, optionally submit for review
- **`add_comment`** — add a comment to a task
- **`list_employees`** — (keep existing) discover coworkers for task assignment

### 11. Review Flow

**Task-level review:**
1. Employee completes all work → moves task to "IN_REVIEW"
2. If `humanReview = true` → human sees review bar in task detail panel
3. If `reviewerId` is set → supervisor employee picks it up via `list_tasks` tool
4. Reviewer clicks Approve → task moves to "DONE"
5. Reviewer clicks "Changes" → task moves back to "IN_PROGRESS" with review comment
6. Reviewer clicks "Reject" → task moves to "DONE" with rejected status

**Subtask-level review (optional):**
1. When creating a subtask, creator can toggle "Requires review"
2. Employee completes subtask → if review required, subtask enters "IN_REVIEW" state
3. Reviewer sees inline approve/changes/reject buttons on the subtask row
4. Approve → subtask marked done + approved
5. Changes → subtask goes back to in-progress with comment
6. Task-level review only activates when all subtasks are done/approved

### 12. Migration Path

The existing `EmployeeMessage` system (messaging, tasks, handoffs, broadcasts) will be **deprecated** in favor of this new task system. Migration:

1. Build the new task system alongside the old messaging
2. Remove the `/dashboard/messages` page
3. Remove `tab-inbox.tsx` (already not rendered)
4. Replace `send_message`/`check_inbox`/`reply_message` runtime tools with the new task tools
5. Keep `EmployeeMessage` table for a transition period, then drop

### 13. What's NOT Changing

- Employee lifecycle (deploy, start, stop, etc.)
- Autonomy/trust system
- Integrations
- Workspace IDE
- Chat tab
- Pipelines (may integrate with tasks later)
- Groups detail page (member management, deploy)

## Mockups

Visual mockups are in `.superpowers/brainstorm/1524008-1773288967/`:
- `tasks-kanban.html` — Kanban board view
- `tasks-subtasks-v2.html` — Grouped list view with nested subtasks
- `task-detail-v2.html` — Task detail slide-over with per-subtask review
- `teams-tab.html` — Teams tab with team cards
