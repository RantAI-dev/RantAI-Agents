# Task Engine Frontend — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend UI for the task engine — Kanban board, list view, task detail slide-over, teams tab, and per-employee task filtering — aggregating tasks from RantaiClaw containers via fan-out + Prisma cache.

**Architecture:** Dashboard API routes fan-out to all active RantaiClaw containers' `/tasks` endpoints in parallel, merge/deduplicate results, cache in Prisma for offline visibility. Writes proxy to the target container first, then update cache. Two container types: individual employee containers and group containers.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, shadcn/ui, Framer Motion, Prisma ORM, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-13-task-engine-frontend-design.md`

---

## Code Quality Guidelines

**Every subagent MUST follow these rules. Read them before writing any code.**

### Project Conventions
- **Package manager:** `bun` (NEVER npm)
- **Imports:** Use `@/` path alias (e.g., `@/lib/prisma`, `@/hooks/use-tasks`)
- **API route params:** `{ params }: { params: Promise<{ id: string }> }` — always `await params`
- **Auth pattern:** `getServerSession(authOptions)` → `getOrganizationContext(request, session.user.id)` → proceed or 401/403
- **Prisma client:** Import from `@/lib/prisma` (singleton)
- **Error responses:** `NextResponse.json({ error: "message" }, { status: code })`
- **Success responses:** `NextResponse.json(data)` or `NextResponse.json(data, { status: 201 })`

### UI Conventions
- **Animation:** Framer Motion with stagger pattern: `stagger = { visible: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }` and `fadeUp = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 24 } } }`
- **Layout:** `flex-1 overflow-auto p-5 space-y-4` for tab content containers
- **Cards:** `rounded-lg border bg-card p-4` base pattern
- **Status colors:** emerald=active/done, blue=in-progress, violet=in-review, amber=medium-priority, red=high-priority/overdue, muted=todo/idle
- **Badge pattern:** `bg-{color}-500/10 text-{color}-500` (e.g., `bg-emerald-500/10 text-emerald-500`)
- **Grid:** `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- **Shadcn components:** Button, Badge, Input, Textarea, Select, Dialog, DropdownMenu, Tooltip, ScrollArea, Sheet
- **Icons:** `lucide-react` only
- **No emoji in code** — use Lucide icons for status indicators
- **Scrollbar:** Add `scrollbar-thin` class to scrollable containers
- **Dark mode:** All styles must work in dark mode (use CSS variables, not hardcoded colors)

### Hook Conventions
```typescript
// Standard hook shape
export function useExample() {
  const [data, setData] = useState<Type[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/dashboard/example", {
        headers: { "x-organization-id": "..." } // from cookie/context
      })
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return { data, isLoading, error, refresh: fetchData }
}
```

### File Naming
- Components: `kebab-case.tsx` (e.g., `task-board.tsx`)
- Hooks: `use-kebab-case.ts` (e.g., `use-tasks.ts`)
- Types: `kebab-case.ts` (e.g., `task-types.ts`)
- API routes: `route.ts` in appropriate directory

---

## File Structure

```
# NEW FILES (Create)
lib/digital-employee/task-aggregator.ts      — Fan-out query + Prisma cache logic
lib/digital-employee/task-types.ts           — TypeScript types for tasks
hooks/use-tasks.ts                           — Task list hook with polling
hooks/use-task-detail.ts                     — Task detail hook with polling
app/api/dashboard/tasks/route.ts             — GET (fan-out list) + POST (create)
app/api/dashboard/tasks/[id]/route.ts        — GET (detail) + PUT (update) + DELETE
app/api/dashboard/tasks/[id]/review/route.ts — POST (submit review)
app/api/dashboard/tasks/[id]/comments/route.ts — GET + POST comments
app/api/dashboard/tasks/[id]/events/route.ts — GET events
app/dashboard/digital-employees/_components/tab-tasks.tsx       — Tasks tab (board + list toggle)
app/dashboard/digital-employees/_components/tab-teams.tsx       — Teams tab
app/dashboard/digital-employees/_components/task-board.tsx      — Kanban board
app/dashboard/digital-employees/_components/task-list.tsx       — List/table view
app/dashboard/digital-employees/_components/task-card.tsx       — Kanban card
app/dashboard/digital-employees/_components/task-detail-panel.tsx — Slide-over panel
app/dashboard/digital-employees/_components/task-create-dialog.tsx — Create dialog
app/dashboard/digital-employees/_components/task-review-bar.tsx — Review action bar
app/dashboard/digital-employees/_components/subtask-list.tsx    — Subtask list with review
app/dashboard/digital-employees/_components/team-card.tsx       — Team card
app/dashboard/digital-employees/[id]/_components/tab-tasks.tsx  — Per-employee tasks

# MODIFIED FILES (Edit)
prisma/schema.prisma          — Add EmployeeTask, EmployeeTaskComment, EmployeeTaskEvent models
app/dashboard/digital-employees/page.tsx     — Add tab routing (?tab=employees|teams|tasks)
app/dashboard/digital-employees/[id]/page.tsx — Add Tasks nav item
```

---

## Chunk 1: Data Layer

### Task 1: Prisma Cache Schema

**Files:**
- Modify: `prisma/schema.prisma`

Add the three cache models at the end of the schema, plus relations on existing models.

- [ ] **Step 1: Add EmployeeTask, EmployeeTaskComment, EmployeeTaskEvent models to schema**

Add to the END of `prisma/schema.prisma`:

```prisma
// ─── Task Engine Cache (source of truth = RantaiClaw containers) ───

model EmployeeTask {
  id                  String    @id  // UUID from RantaiClaw, NOT auto-generated
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
  sourceGroupId       String?   // if from a group container
  isStale             Boolean   @default(false)
  cachedAt            DateTime  @default(now())
  createdAt           DateTime
  updatedAt           DateTime

  subtasks   EmployeeTask[]  @relation("TaskSubtasks")
  parentTask EmployeeTask?   @relation("TaskSubtasks", fields: [parentTaskId], references: [id], onDelete: Cascade)
  comments   EmployeeTaskComment[]
  events     EmployeeTaskEvent[]

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, status])
  @@index([assigneeId, status])
  @@index([groupId])
  @@index([parentTaskId])
  @@index([sourceEmployeeId])
}

model EmployeeTaskComment {
  id                String   @id  // UUID from RantaiClaw
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
  id                String   @id  // UUID from RantaiClaw
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

Also add `employeeTasks EmployeeTask[]` relation to the `Organization` model (add it alongside other relations).

- [ ] **Step 2: Run `bunx prisma db push` to sync schema**

```bash
bunx prisma db push
```

Expected: Schema synced successfully.

- [ ] **Step 3: Generate Prisma client**

```bash
bunx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(tasks): add Prisma cache schema for task engine"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `lib/digital-employee/task-types.ts`

- [ ] **Step 1: Create task-types.ts with all types matching RantaiClaw**

```typescript
// Task types matching RantaiClaw gateway API contract
// These are used by both API routes and UI components

export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED"
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH"
export type ReviewStatus = "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"
export type ReviewAction = "approve" | "changes" | "reject"
export type ActorType = "HUMAN" | "EMPLOYEE"
export type TaskEventType = "CREATED" | "STATUS_CHANGED" | "ASSIGNED" | "REVIEW_SUBMITTED" | "REVIEW_RESPONDED" | "COMMENT" | "SUBTASK_COMPLETED"

export interface Task {
  id: string
  organization_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  group_id: string | null
  reviewer_id: string | null
  human_review: boolean
  review_status: ReviewStatus | null
  review_comment: string | null
  parent_task_id: string | null
  created_by_employee_id: string | null
  created_by_user_id: string | null
  due_date: string | null
  completed_at: string | null
  order_in_status: number
  order_in_parent: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface TaskComment {
  id: string
  task_id: string
  content: string
  author_type: ActorType
  author_employee_id: string | null
  author_user_id: string | null
  created_at: string
}

export interface TaskEvent {
  id: string
  task_id: string
  event_type: TaskEventType
  actor_type: ActorType
  actor_employee_id: string | null
  actor_user_id: string | null
  data: Record<string, unknown>
  created_at: string
}

export interface TaskDetail {
  task: Task
  subtasks: Task[]
  comments: TaskComment[]
  events: TaskEvent[]
}

export interface CreateTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  assignee_id?: string
  group_id?: string
  reviewer_id?: string
  human_review?: boolean
  parent_task_id?: string
  due_date?: string
  organization_id?: string
  created_by_employee_id?: string
  created_by_user_id?: string
  metadata?: Record<string, unknown>
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  assignee_id?: string | null
  group_id?: string | null
  reviewer_id?: string | null
  human_review?: boolean
  due_date?: string | null
  order_in_status?: number
  order_in_parent?: number
  metadata?: Record<string, unknown>
}

export interface ReviewInput {
  action: ReviewAction
  comment?: string
  actor_type?: ActorType
  actor_employee_id?: string
  actor_user_id?: string
}

export interface AddCommentInput {
  content: string
  author_type?: ActorType
  author_employee_id?: string
  author_user_id?: string
}

export interface TaskFilter {
  status?: TaskStatus
  assigneeId?: string
  groupId?: string
  priority?: TaskPriority
  topLevelOnly?: boolean
}

// Dashboard-side enriched task (with employee name, avatar, stale info)
export interface EnrichedTask extends Task {
  assignee_name?: string
  assignee_avatar?: string
  assignee_online?: boolean
  group_name?: string
  is_stale?: boolean
  source_employee_id?: string
  subtask_count?: number
  subtask_done_count?: number
}

export const TASK_STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; dotClass: string }> = {
  TODO: { label: "To Do", color: "muted", dotClass: "bg-muted-foreground" },
  IN_PROGRESS: { label: "In Progress", color: "blue", dotClass: "bg-blue-500" },
  IN_REVIEW: { label: "In Review", color: "violet", dotClass: "bg-violet-500" },
  DONE: { label: "Done", color: "emerald", dotClass: "bg-emerald-500" },
  CANCELLED: { label: "Cancelled", color: "red", dotClass: "bg-red-500" },
}

export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  HIGH: { label: "High", color: "red" },
  MEDIUM: { label: "Medium", color: "amber" },
  LOW: { label: "Low", color: "blue" },
}
```

- [ ] **Step 2: Build check**

```bash
bunx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/digital-employee/task-types.ts
git commit -m "feat(tasks): add TypeScript types for task engine"
```

---

### Task 3: Task Aggregator

**Files:**
- Create: `lib/digital-employee/task-aggregator.ts`
- Reference: `lib/digital-employee/docker-orchestrator.ts` (for container URL/token pattern)

This is the core data layer — fan-out to containers + Prisma cache.

- [ ] **Step 1: Create task-aggregator.ts**

```typescript
import { prisma } from "@/lib/prisma"
import type {
  Task,
  TaskDetail,
  TaskComment,
  TaskEvent,
  TaskFilter,
  CreateTaskInput,
  UpdateTaskInput,
  ReviewInput,
  AddCommentInput,
  EnrichedTask,
} from "./task-types"

// ─── Container Target Resolution ───────────────────────────────────

interface ContainerTarget {
  url: string
  token: string
  sourceId: string      // employeeId or groupId
  sourceType: "employee" | "group"
}

/**
 * Get all active container targets for an organization.
 * Includes both individual employee containers and group containers.
 */
async function getActiveContainers(orgId: string): Promise<ContainerTarget[]> {
  const targets: ContainerTarget[] = []

  // Individual employees (not in a group, with running container)
  const employees = await prisma.digitalEmployee.findMany({
    where: {
      organizationId: orgId,
      containerPort: { not: null },
      gatewayToken: { not: null },
      groupId: null, // standalone only
    },
    select: { id: true, containerPort: true, gatewayToken: true },
  })

  for (const emp of employees) {
    if (emp.containerPort && emp.gatewayToken) {
      targets.push({
        url: `http://localhost:${emp.containerPort}`,
        token: emp.gatewayToken,
        sourceId: emp.id,
        sourceType: "employee",
      })
    }
  }

  // Group containers
  const groups = await prisma.employeeGroup.findMany({
    where: {
      organizationId: orgId,
      containerPort: { not: null },
      gatewayToken: { not: null },
    },
    select: { id: true, containerPort: true, gatewayToken: true },
  })

  for (const group of groups) {
    if (group.containerPort && group.gatewayToken) {
      targets.push({
        url: `http://localhost:${group.containerPort}`,
        token: group.gatewayToken,
        sourceId: group.id,
        sourceType: "group",
      })
    }
  }

  return targets
}

/**
 * Resolve which container to send a write to for a given assignee.
 */
async function resolveWriteTarget(assigneeId: string | null, orgId: string): Promise<ContainerTarget | null> {
  if (assigneeId) {
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: assigneeId },
      select: { id: true, containerPort: true, gatewayToken: true, groupId: true },
    })

    if (!employee) return null

    // If employee is in a group, use group container
    if (employee.groupId) {
      const group = await prisma.employeeGroup.findUnique({
        where: { id: employee.groupId },
        select: { id: true, containerPort: true, gatewayToken: true },
      })
      if (group?.containerPort && group.gatewayToken) {
        return {
          url: `http://localhost:${group.containerPort}`,
          token: group.gatewayToken,
          sourceId: group.id,
          sourceType: "group",
        }
      }
    }

    // Individual container
    if (employee.containerPort && employee.gatewayToken) {
      return {
        url: `http://localhost:${employee.containerPort}`,
        token: employee.gatewayToken,
        sourceId: employee.id,
        sourceType: "employee",
      }
    }
  }

  // Fallback: first active container in org
  const targets = await getActiveContainers(orgId)
  return targets[0] || null
}

// ─── Fan-Out Query ─────────────────────────────────────────────────

/**
 * Fan out to all active containers, merge results, cache in Prisma.
 */
export async function fanOutTaskQuery(
  orgId: string,
  filter?: TaskFilter
): Promise<EnrichedTask[]> {
  const targets = await getActiveContainers(orgId)

  // Build query params
  const params = new URLSearchParams()
  if (filter?.status) params.set("status", filter.status)
  if (filter?.assigneeId) params.set("assignee_id", filter.assigneeId)
  if (filter?.groupId) params.set("group_id", filter.groupId)
  if (filter?.priority) params.set("priority", filter.priority)
  if (filter?.topLevelOnly) params.set("top_level_only", "true")
  params.set("organization_id", orgId)
  const qs = params.toString()

  // Query all containers in parallel
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const res = await fetch(`${target.url}/tasks${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${target.token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`${target.url} returned ${res.status}`)
      const tasks: Task[] = await res.json()
      return { target, tasks }
    })
  )

  // Merge results — deduplicate by task ID (latest updatedAt wins)
  const taskMap = new Map<string, { task: Task; target: ContainerTarget }>()
  const activeSourceIds = new Set<string>()

  for (const result of results) {
    if (result.status === "fulfilled") {
      activeSourceIds.add(result.value.target.sourceId)
      for (const task of result.value.tasks) {
        const existing = taskMap.get(task.id)
        if (!existing || task.updated_at > existing.task.updated_at) {
          taskMap.set(task.id, { task, target: result.value.target })
        }
      }
    }
  }

  // Cache live tasks in Prisma (fire-and-forget, don't block response)
  const liveTasks = Array.from(taskMap.values())
  cacheTasks(liveTasks, orgId).catch(() => {})

  // Mark previously-cached tasks from now-offline containers as stale
  markStaleContainers(orgId, activeSourceIds).catch(() => {})

  // Get cached stale tasks (from offline containers)
  const staleTasks = await prisma.employeeTask.findMany({
    where: {
      organizationId: orgId,
      isStale: true,
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.assigneeId ? { assigneeId: filter.assigneeId } : {}),
      ...(filter?.groupId ? { groupId: filter.groupId } : {}),
      ...(filter?.priority ? { priority: filter.priority } : {}),
      ...(filter?.topLevelOnly ? { parentTaskId: null } : {}),
    },
  })

  // Enrich with employee names
  const employeeIds = new Set<string>()
  const groupIds = new Set<string>()
  for (const { task } of liveTasks) {
    if (task.assignee_id) employeeIds.add(task.assignee_id)
    if (task.group_id) groupIds.add(task.group_id)
  }
  for (const t of staleTasks) {
    if (t.assigneeId) employeeIds.add(t.assigneeId)
    if (t.groupId) groupIds.add(t.groupId)
  }

  const [employees, groups] = await Promise.all([
    employeeIds.size > 0
      ? prisma.digitalEmployee.findMany({
          where: { id: { in: Array.from(employeeIds) } },
          select: { id: true, name: true, avatar: true, containerPort: true },
        })
      : [],
    groupIds.size > 0
      ? prisma.employeeGroup.findMany({
          where: { id: { in: Array.from(groupIds) } },
          select: { id: true, name: true },
        })
      : [],
  ])

  const empMap = new Map(employees.map((e) => [e.id, e]))
  const grpMap = new Map(groups.map((g) => [g.id, g]))

  // Build enriched task list
  const enriched: EnrichedTask[] = []

  for (const { task, target } of liveTasks) {
    const emp = task.assignee_id ? empMap.get(task.assignee_id) : null
    const grp = task.group_id ? grpMap.get(task.group_id) : null
    enriched.push({
      ...task,
      assignee_name: emp?.name,
      assignee_avatar: emp?.avatar ?? undefined,
      assignee_online: emp?.containerPort != null,
      group_name: grp?.name,
      is_stale: false,
      source_employee_id: target.sourceId,
    })
  }

  for (const t of staleTasks) {
    // Skip if we got a fresh version from a live container
    if (taskMap.has(t.id)) continue
    const emp = t.assigneeId ? empMap.get(t.assigneeId) : null
    const grp = t.groupId ? grpMap.get(t.groupId) : null
    enriched.push({
      id: t.id,
      organization_id: t.organizationId,
      title: t.title,
      description: t.description,
      status: t.status as Task["status"],
      priority: t.priority as Task["priority"],
      assignee_id: t.assigneeId,
      group_id: t.groupId,
      reviewer_id: t.reviewerId,
      human_review: t.humanReview,
      review_status: t.reviewStatus as Task["review_status"],
      review_comment: t.reviewComment,
      parent_task_id: t.parentTaskId,
      created_by_employee_id: t.createdByEmployeeId,
      created_by_user_id: t.createdByUserId,
      due_date: t.dueDate?.toISOString() ?? null,
      completed_at: t.completedAt?.toISOString() ?? null,
      order_in_status: t.orderInStatus,
      order_in_parent: t.orderInParent,
      metadata: t.metadata as Record<string, unknown>,
      created_at: t.createdAt.toISOString(),
      updated_at: t.updatedAt.toISOString(),
      assignee_name: emp?.name,
      assignee_avatar: emp?.avatar ?? undefined,
      assignee_online: false,
      group_name: grp?.name,
      is_stale: true,
      source_employee_id: t.sourceEmployeeId,
    })
  }

  return enriched
}

// ─── Proxy Writes ──────────────────────────────────────────────────

export async function proxyCreateTask(
  orgId: string,
  input: CreateTaskInput
): Promise<Task> {
  const target = await resolveWriteTarget(input.assignee_id ?? null, orgId)
  if (!target) throw new Error("No active container available")

  const res = await fetch(`${target.url}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.token}`,
    },
    body: JSON.stringify({ ...input, organization_id: orgId }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Container error: ${err}`)
  }

  const task: Task = await res.json()

  // Cache
  await upsertTaskCache(task, target.sourceId, target.sourceType === "group" ? target.sourceId : null, orgId)
  return task
}

export async function proxyGetTaskDetail(
  taskId: string,
  orgId: string
): Promise<TaskDetail | null> {
  // Try to find which container has this task
  const cached = await prisma.employeeTask.findUnique({
    where: { id: taskId },
    select: { sourceEmployeeId: true, sourceGroupId: true },
  })

  if (cached) {
    const target = await resolveContainerForSource(cached.sourceEmployeeId, cached.sourceGroupId)
    if (target) {
      try {
        const res = await fetch(`${target.url}/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${target.token}` },
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          return await res.json()
        }
      } catch {
        // Container offline, fall through to cache
      }
    }
  }

  // Fallback: serve from cache
  const task = await prisma.employeeTask.findUnique({
    where: { id: taskId, organizationId: orgId },
    include: {
      subtasks: { orderBy: { orderInParent: "asc" } },
      comments: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  })

  if (!task) return null

  return {
    task: prismaTaskToApi(task),
    subtasks: task.subtasks.map(prismaTaskToApi),
    comments: task.comments.map((c) => ({
      id: c.id,
      task_id: c.taskId,
      content: c.content,
      author_type: c.authorType as TaskComment["author_type"],
      author_employee_id: c.authorEmployeeId,
      author_user_id: c.authorUserId,
      created_at: c.createdAt.toISOString(),
    })),
    events: task.events.map((e) => ({
      id: e.id,
      task_id: e.taskId,
      event_type: e.eventType as TaskEvent["event_type"],
      actor_type: e.actorType as TaskEvent["actor_type"],
      actor_employee_id: e.actorEmployeeId,
      actor_user_id: e.actorUserId,
      data: e.data as Record<string, unknown>,
      created_at: e.createdAt.toISOString(),
    })),
  }
}

export async function proxyUpdateTask(
  taskId: string,
  input: UpdateTaskInput,
  orgId: string
): Promise<Task> {
  const target = await resolveContainerForTask(taskId)
  if (!target) throw new Error("No active container for this task")

  const res = await fetch(`${target.url}/tasks/${taskId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.token}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Container error: ${err}`)
  }

  const task: Task = await res.json()
  await upsertTaskCache(task, target.sourceId, target.sourceType === "group" ? target.sourceId : null, orgId)
  return task
}

export async function proxyDeleteTask(taskId: string): Promise<void> {
  const target = await resolveContainerForTask(taskId)
  if (target) {
    const res = await fetch(`${target.url}/tasks/${taskId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${target.token}` },
    })
    if (!res.ok && res.status !== 404) {
      throw new Error(`Container error: ${res.status}`)
    }
  }

  // Remove from cache regardless
  await prisma.employeeTask.deleteMany({ where: { id: taskId } })
}

export async function proxySubmitReview(
  taskId: string,
  input: ReviewInput,
  orgId: string
): Promise<Task> {
  const target = await resolveContainerForTask(taskId)
  if (!target) throw new Error("No active container for this task")

  const res = await fetch(`${target.url}/tasks/${taskId}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.token}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Container error: ${err}`)
  }

  const task: Task = await res.json()
  await upsertTaskCache(task, target.sourceId, target.sourceType === "group" ? target.sourceId : null, orgId)
  return task
}

export async function proxyGetComments(taskId: string): Promise<TaskComment[]> {
  const target = await resolveContainerForTask(taskId)
  if (target) {
    try {
      const res = await fetch(`${target.url}/tasks/${taskId}/comments`, {
        headers: { Authorization: `Bearer ${target.token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return await res.json()
    } catch { /* fall through */ }
  }

  // Cache fallback
  const comments = await prisma.employeeTaskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  })
  return comments.map((c) => ({
    id: c.id,
    task_id: c.taskId,
    content: c.content,
    author_type: c.authorType as TaskComment["author_type"],
    author_employee_id: c.authorEmployeeId,
    author_user_id: c.authorUserId,
    created_at: c.createdAt.toISOString(),
  }))
}

export async function proxyAddComment(
  taskId: string,
  input: AddCommentInput,
  orgId: string
): Promise<TaskComment> {
  const target = await resolveContainerForTask(taskId)
  if (!target) throw new Error("No active container for this task")

  const res = await fetch(`${target.url}/tasks/${taskId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.token}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Container error: ${err}`)
  }

  const comment: TaskComment = await res.json()

  // Cache the comment
  await prisma.employeeTaskComment.upsert({
    where: { id: comment.id },
    create: {
      id: comment.id,
      taskId: comment.task_id,
      content: comment.content,
      authorType: comment.author_type,
      authorEmployeeId: comment.author_employee_id,
      authorUserId: comment.author_user_id,
      createdAt: new Date(comment.created_at),
    },
    update: {
      content: comment.content,
    },
  })

  return comment
}

export async function proxyGetEvents(taskId: string): Promise<TaskEvent[]> {
  const target = await resolveContainerForTask(taskId)
  if (target) {
    try {
      const res = await fetch(`${target.url}/tasks/${taskId}/events`, {
        headers: { Authorization: `Bearer ${target.token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return await res.json()
    } catch { /* fall through */ }
  }

  const events = await prisma.employeeTaskEvent.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  })
  return events.map((e) => ({
    id: e.id,
    task_id: e.taskId,
    event_type: e.eventType as TaskEvent["event_type"],
    actor_type: e.actorType as TaskEvent["actor_type"],
    actor_employee_id: e.actorEmployeeId,
    actor_user_id: e.actorUserId,
    data: e.data as Record<string, unknown>,
    created_at: e.createdAt.toISOString(),
  }))
}

// ─── Helpers ───────────────────────────────────────────────────────

async function resolveContainerForTask(taskId: string): Promise<ContainerTarget | null> {
  const cached = await prisma.employeeTask.findUnique({
    where: { id: taskId },
    select: { sourceEmployeeId: true, sourceGroupId: true },
  })
  if (!cached) return null
  return resolveContainerForSource(cached.sourceEmployeeId, cached.sourceGroupId)
}

async function resolveContainerForSource(
  sourceEmployeeId: string,
  sourceGroupId: string | null
): Promise<ContainerTarget | null> {
  // Try group container first
  if (sourceGroupId) {
    const group = await prisma.employeeGroup.findUnique({
      where: { id: sourceGroupId },
      select: { id: true, containerPort: true, gatewayToken: true },
    })
    if (group?.containerPort && group.gatewayToken) {
      return {
        url: `http://localhost:${group.containerPort}`,
        token: group.gatewayToken,
        sourceId: group.id,
        sourceType: "group",
      }
    }
  }

  // Try individual employee container
  const emp = await prisma.digitalEmployee.findUnique({
    where: { id: sourceEmployeeId },
    select: { id: true, containerPort: true, gatewayToken: true },
  })
  if (emp?.containerPort && emp.gatewayToken) {
    return {
      url: `http://localhost:${emp.containerPort}`,
      token: emp.gatewayToken,
      sourceId: emp.id,
      sourceType: "employee",
    }
  }

  return null
}

async function cacheTasks(
  items: Array<{ task: Task; target: ContainerTarget }>,
  orgId: string
): Promise<void> {
  for (const { task, target } of items) {
    await upsertTaskCache(
      task,
      target.sourceId,
      target.sourceType === "group" ? target.sourceId : null,
      orgId
    )
  }
}

async function upsertTaskCache(
  task: Task,
  sourceEmployeeId: string,
  sourceGroupId: string | null,
  orgId: string
): Promise<void> {
  const data = {
    organizationId: orgId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assignee_id,
    groupId: task.group_id,
    reviewerId: task.reviewer_id,
    humanReview: task.human_review,
    reviewStatus: task.review_status,
    reviewComment: task.review_comment,
    parentTaskId: task.parent_task_id,
    createdByEmployeeId: task.created_by_employee_id,
    createdByUserId: task.created_by_user_id,
    dueDate: task.due_date ? new Date(task.due_date) : null,
    completedAt: task.completed_at ? new Date(task.completed_at) : null,
    orderInStatus: task.order_in_status,
    orderInParent: task.order_in_parent,
    metadata: task.metadata,
    sourceEmployeeId,
    sourceGroupId,
    isStale: false,
    cachedAt: new Date(),
    createdAt: new Date(task.created_at),
    updatedAt: new Date(task.updated_at),
  }

  await prisma.employeeTask.upsert({
    where: { id: task.id },
    create: { id: task.id, ...data },
    update: data,
  })
}

async function markStaleContainers(orgId: string, activeSourceIds: Set<string>): Promise<void> {
  if (activeSourceIds.size === 0) {
    // All containers offline — mark everything stale
    await prisma.employeeTask.updateMany({
      where: { organizationId: orgId, isStale: false },
      data: { isStale: true },
    })
    return
  }

  // Mark tasks from inactive sources as stale
  await prisma.employeeTask.updateMany({
    where: {
      organizationId: orgId,
      isStale: false,
      sourceEmployeeId: { notIn: Array.from(activeSourceIds) },
    },
    data: { isStale: true },
  })

  // Un-stale tasks from active sources
  await prisma.employeeTask.updateMany({
    where: {
      organizationId: orgId,
      isStale: true,
      sourceEmployeeId: { in: Array.from(activeSourceIds) },
    },
    data: { isStale: false },
  })
}

function prismaTaskToApi(t: {
  id: string; organizationId: string; title: string; description: string | null;
  status: string; priority: string; assigneeId: string | null; groupId: string | null;
  reviewerId: string | null; humanReview: boolean; reviewStatus: string | null;
  reviewComment: string | null; parentTaskId: string | null;
  createdByEmployeeId: string | null; createdByUserId: string | null;
  dueDate: Date | null; completedAt: Date | null; orderInStatus: number;
  orderInParent: number; metadata: unknown;
  createdAt: Date; updatedAt: Date;
}): Task {
  return {
    id: t.id,
    organization_id: t.organizationId,
    title: t.title,
    description: t.description,
    status: t.status as Task["status"],
    priority: t.priority as Task["priority"],
    assignee_id: t.assigneeId,
    group_id: t.groupId,
    reviewer_id: t.reviewerId,
    human_review: t.humanReview,
    review_status: t.reviewStatus as Task["review_status"],
    review_comment: t.reviewComment,
    parent_task_id: t.parentTaskId,
    created_by_employee_id: t.createdByEmployeeId,
    created_by_user_id: t.createdByUserId,
    due_date: t.dueDate?.toISOString() ?? null,
    completed_at: t.completedAt?.toISOString() ?? null,
    order_in_status: t.orderInStatus,
    order_in_parent: t.orderInParent,
    metadata: t.metadata as Record<string, unknown>,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  }
}
```

- [ ] **Step 2: Build check**

```bash
bunx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/digital-employee/task-aggregator.ts
git commit -m "feat(tasks): add fan-out task aggregator with Prisma cache"
```

---

## Chunk 2: API Routes + Hooks

### Task 4: API Routes — List + Create

**Files:**
- Create: `app/api/dashboard/tasks/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { fanOutTaskQuery, proxyCreateTask } from "@/lib/digital-employee/task-aggregator"
import type { TaskFilter } from "@/lib/digital-employee/task-types"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const url = new URL(request.url)
  const filter: TaskFilter = {}
  const status = url.searchParams.get("status")
  if (status) filter.status = status as TaskFilter["status"]
  const assigneeId = url.searchParams.get("assigneeId")
  if (assigneeId) filter.assigneeId = assigneeId
  const groupId = url.searchParams.get("groupId")
  if (groupId) filter.groupId = groupId
  const priority = url.searchParams.get("priority")
  if (priority) filter.priority = priority as TaskFilter["priority"]
  if (url.searchParams.get("topLevelOnly") === "true") filter.topLevelOnly = true

  try {
    const tasks = await fanOutTaskQuery(orgCtx.organizationId, filter)
    return NextResponse.json(tasks)
  } catch (err) {
    console.error("[tasks] fan-out error:", err)
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  try {
    const body = await request.json()
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    const task = await proxyCreateTask(orgCtx.organizationId, {
      ...body,
      created_by_user_id: session.user.id,
    })
    return NextResponse.json(task, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create task"
    console.error("[tasks] create error:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p app/api/dashboard/tasks
git add app/api/dashboard/tasks/route.ts
git commit -m "feat(tasks): add list + create API routes"
```

---

### Task 5: API Routes — Detail + Update + Delete

**Files:**
- Create: `app/api/dashboard/tasks/[id]/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  proxyGetTaskDetail,
  proxyUpdateTask,
  proxyDeleteTask,
} from "@/lib/digital-employee/task-aggregator"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const { id } = await params

  try {
    const detail = await proxyGetTaskDetail(id, orgCtx.organizationId)
    if (!detail) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (err) {
    console.error("[tasks] get detail error:", err)
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const task = await proxyUpdateTask(id, body, orgCtx.organizationId)
    return NextResponse.json(task)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update task"
    console.error("[tasks] update error:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const { id } = await params

  try {
    await proxyDeleteTask(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[tasks] delete error:", err)
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p app/api/dashboard/tasks/\[id\]
git add app/api/dashboard/tasks/\[id\]/route.ts
git commit -m "feat(tasks): add detail/update/delete API routes"
```

---

### Task 6: API Routes — Review + Comments + Events

**Files:**
- Create: `app/api/dashboard/tasks/[id]/review/route.ts`
- Create: `app/api/dashboard/tasks/[id]/comments/route.ts`
- Create: `app/api/dashboard/tasks/[id]/events/route.ts`

- [ ] **Step 1: Create review route**

```typescript
// app/api/dashboard/tasks/[id]/review/route.ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { proxySubmitReview } from "@/lib/digital-employee/task-aggregator"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    if (!body.action || !["approve", "changes", "reject"].includes(body.action)) {
      return NextResponse.json({ error: "Invalid review action" }, { status: 400 })
    }

    const task = await proxySubmitReview(id, {
      ...body,
      actor_type: "HUMAN",
      actor_user_id: session.user.id,
    }, orgCtx.organizationId)
    return NextResponse.json(task)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit review"
    console.error("[tasks] review error:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create comments route**

```typescript
// app/api/dashboard/tasks/[id]/comments/route.ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { proxyGetComments, proxyAddComment } from "@/lib/digital-employee/task-aggregator"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const { id } = await params

  try {
    const comments = await proxyGetComments(id)
    return NextResponse.json(comments)
  } catch (err) {
    console.error("[tasks] get comments error:", err)
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 })
    }

    const comment = await proxyAddComment(id, {
      content: body.content,
      author_type: "HUMAN",
      author_user_id: session.user.id,
    }, orgCtx.organizationId)
    return NextResponse.json(comment, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add comment"
    console.error("[tasks] add comment error:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create events route**

```typescript
// app/api/dashboard/tasks/[id]/events/route.ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { proxyGetEvents } from "@/lib/digital-employee/task-aggregator"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const { id } = await params

  try {
    const events = await proxyGetEvents(id)
    return NextResponse.json(events)
  } catch (err) {
    console.error("[tasks] get events error:", err)
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
mkdir -p app/api/dashboard/tasks/\[id\]/review app/api/dashboard/tasks/\[id\]/comments app/api/dashboard/tasks/\[id\]/events
git add app/api/dashboard/tasks/
git commit -m "feat(tasks): add review, comments, events API routes"
```

---

### Task 7: Hooks — useTasks + useTaskDetail

**Files:**
- Create: `hooks/use-tasks.ts`
- Create: `hooks/use-task-detail.ts`

- [ ] **Step 1: Create use-tasks.ts**

```typescript
"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import type {
  EnrichedTask,
  TaskFilter,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  TaskPriority,
} from "@/lib/digital-employee/task-types"

interface UseTasksOptions {
  filter?: TaskFilter
  pollInterval?: number // ms, default 30000
}

export function useTasks(options: UseTasksOptions = {}) {
  const { filter, pollInterval = 30000 } = options
  const [tasks, setTasks] = useState<EnrichedTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filter?.status) params.set("status", filter.status)
      if (filter?.assigneeId) params.set("assigneeId", filter.assigneeId)
      if (filter?.groupId) params.set("groupId", filter.groupId)
      if (filter?.priority) params.set("priority", filter.priority)
      if (filter?.topLevelOnly) params.set("topLevelOnly", "true")

      const qs = params.toString()
      const res = await fetch(`/api/dashboard/tasks${qs ? `?${qs}` : ""}`)
      if (!res.ok) throw new Error("Failed to fetch tasks")
      const data: EnrichedTask[] = await res.json()
      setTasks(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [filter?.status, filter?.assigneeId, filter?.groupId, filter?.priority, filter?.topLevelOnly])

  const createTask = useCallback(async (input: CreateTaskInput) => {
    const res = await fetch("/api/dashboard/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to create task")
    }
    await fetchTasks()
    return await res.json()
  }, [fetchTasks])

  const updateTask = useCallback(async (taskId: string, input: UpdateTaskInput) => {
    const res = await fetch(`/api/dashboard/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to update task")
    }
    await fetchTasks()
    return await res.json()
  }, [fetchTasks])

  const deleteTask = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/dashboard/tasks/${taskId}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error("Failed to delete task")
    await fetchTasks()
  }, [fetchTasks])

  // Initial fetch
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Polling
  useEffect(() => {
    if (pollInterval > 0) {
      pollRef.current = setInterval(fetchTasks, pollInterval)
      return () => clearInterval(pollRef.current)
    }
  }, [fetchTasks, pollInterval])

  // Computed helpers
  const tasksByStatus = useCallback((status: TaskStatus) => {
    return tasks.filter((t) => t.status === status && !t.parent_task_id)
  }, [tasks])

  const topLevelTasks = tasks.filter((t) => !t.parent_task_id)

  const taskCounts: Record<TaskStatus, number> = {
    TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0, CANCELLED: 0,
  }
  for (const t of topLevelTasks) {
    taskCounts[t.status]++
  }

  const openCount = taskCounts.TODO + taskCounts.IN_PROGRESS + taskCounts.IN_REVIEW

  return {
    tasks,
    topLevelTasks,
    isLoading,
    error,
    refresh: fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    tasksByStatus,
    taskCounts,
    openCount,
  }
}
```

- [ ] **Step 2: Create use-task-detail.ts**

```typescript
"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import type {
  Task,
  TaskDetail,
  TaskComment,
  TaskEvent,
  UpdateTaskInput,
  ReviewInput,
  AddCommentInput,
  CreateTaskInput,
  EnrichedTask,
} from "@/lib/digital-employee/task-types"

interface UseTaskDetailOptions {
  pollInterval?: number // ms, default 15000
}

export function useTaskDetail(taskId: string | null, options: UseTaskDetailOptions = {}) {
  const { pollInterval = 15000 } = options
  const [task, setTask] = useState<Task | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const fetchDetail = useCallback(async () => {
    if (!taskId) return
    try {
      setIsLoading(true)
      const res = await fetch(`/api/dashboard/tasks/${taskId}`)
      if (!res.ok) throw new Error("Failed to fetch task")
      const data: TaskDetail = await res.json()
      setTask(data.task)
      setSubtasks(data.subtasks)
      setComments(data.comments)
      setEvents(data.events)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [taskId])

  const updateTask = useCallback(async (input: UpdateTaskInput) => {
    if (!taskId) return
    const res = await fetch(`/api/dashboard/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to update task")
    }
    await fetchDetail()
  }, [taskId, fetchDetail])

  const submitReview = useCallback(async (input: ReviewInput) => {
    if (!taskId) return
    const res = await fetch(`/api/dashboard/tasks/${taskId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to submit review")
    }
    await fetchDetail()
  }, [taskId, fetchDetail])

  const addComment = useCallback(async (input: AddCommentInput) => {
    if (!taskId) return
    const res = await fetch(`/api/dashboard/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to add comment")
    }
    await fetchDetail()
  }, [taskId, fetchDetail])

  const addSubtask = useCallback(async (input: CreateTaskInput) => {
    const res = await fetch("/api/dashboard/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, parent_task_id: taskId }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to add subtask")
    }
    await fetchDetail()
  }, [taskId, fetchDetail])

  const submitSubtaskReview = useCallback(async (subtaskId: string, input: ReviewInput) => {
    const res = await fetch(`/api/dashboard/tasks/${subtaskId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to submit review")
    }
    await fetchDetail()
  }, [fetchDetail])

  // Fetch on mount / taskId change
  useEffect(() => {
    if (taskId) {
      fetchDetail()
    } else {
      setTask(null)
      setSubtasks([])
      setComments([])
      setEvents([])
    }
  }, [taskId, fetchDetail])

  // Polling while panel is open
  useEffect(() => {
    if (taskId && pollInterval > 0) {
      pollRef.current = setInterval(fetchDetail, pollInterval)
      return () => clearInterval(pollRef.current)
    }
  }, [taskId, fetchDetail, pollInterval])

  return {
    task,
    subtasks,
    comments,
    events,
    isLoading,
    error,
    refresh: fetchDetail,
    updateTask,
    submitReview,
    addComment,
    addSubtask,
    submitSubtaskReview,
  }
}
```

- [ ] **Step 3: Build check**

```bash
bunx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add hooks/use-tasks.ts hooks/use-task-detail.ts
git commit -m "feat(tasks): add useTasks and useTaskDetail hooks with polling"
```

---

## Chunk 3: UI Components

### Task 8: Tab Routing on Digital Employees Page

**Files:**
- Modify: `app/dashboard/digital-employees/page.tsx`

Add `?tab=employees|teams|tasks` routing. The existing page content becomes the "employees" tab. Import new `TabTasks` and `TabTeams` components.

- [ ] **Step 1: Add tab state and routing**

At the top of the component, add:
```typescript
import { useSearchParams, useRouter } from "next/navigation"
```

Add state:
```typescript
const searchParams = useSearchParams()
const router = useRouter()
const activeTab = searchParams.get("tab") || "employees"
```

Add tab switching function:
```typescript
const setTab = (tab: string) => {
  const params = new URLSearchParams(searchParams.toString())
  if (tab === "employees") params.delete("tab")
  else params.set("tab", tab)
  router.push(`/dashboard/digital-employees${params.toString() ? `?${params}` : ""}`)
}
```

- [ ] **Step 2: Add tab bar UI after the header stats**

Add tabs (using the existing page header area, after the stats row):
```tsx
<div className="flex gap-0 border-b border-border mt-4">
  {[
    { key: "employees", label: "Employees" },
    { key: "teams", label: "Teams" },
    { key: "tasks", label: "Tasks", badge: openCount },
  ].map((tab) => (
    <button
      key={tab.key}
      onClick={() => setTab(tab.key)}
      className={cn(
        "px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
        activeTab === tab.key
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {tab.label}
      {tab.badge != null && tab.badge > 0 && (
        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
          {tab.badge}
        </span>
      )}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Conditionally render tab content**

Wrap existing employees content in `{activeTab === "employees" && (...)}`. Add:
```tsx
{activeTab === "teams" && <TabTeams />}
{activeTab === "tasks" && <TabTasks />}
```

Import at the top:
```typescript
import TabTasks from "./_components/tab-tasks"
import TabTeams from "./_components/tab-teams"
import { useTasks } from "@/hooks/use-tasks"
```

Use `useTasks()` to get `openCount` for the badge.

- [ ] **Step 4: Build check and commit**

```bash
bunx tsc --noEmit --pretty 2>&1 | head -20
git add app/dashboard/digital-employees/page.tsx
git commit -m "feat(tasks): add tab routing to digital employees page"
```

---

### Task 9: Task Card Component

**Files:**
- Create: `app/dashboard/digital-employees/_components/task-card.tsx`

The Kanban card shown in each column. Follows the mockup in `tasks-kanban.html`.

- [ ] **Step 1: Create task-card.tsx**

The component receives an `EnrichedTask` and renders:
- Title (strikethrough if DONE)
- Priority badge (High=red, Medium=amber, Low=blue)
- Creator attribution
- Subtask progress bar if `subtask_count > 0`
- Review indicator
- Assignee avatar + name
- Due date (red if overdue)
- Click handler to open detail panel

Use `cn()` from `@/lib/utils`, Badge from `@/components/ui/badge`, and Lucide icons (`Clock`, `User`, `CheckCircle2`, `Eye`, `AlertCircle`).

Card border: blue-left for IN_PROGRESS, violet-left for IN_REVIEW. Opacity 0.7 for DONE.

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/_components/task-card.tsx
git commit -m "feat(tasks): add Kanban task card component"
```

---

### Task 10: Task Board (Kanban)

**Files:**
- Create: `app/dashboard/digital-employees/_components/task-board.tsx`

Four columns (TODO, IN_PROGRESS, IN_REVIEW, DONE) + optional CANCELLED. Each column has a colored dot, title, count, "+" button, and scrollable TaskCard list.

- [ ] **Step 1: Create task-board.tsx**

Uses `TASK_STATUS_CONFIG` from `task-types.ts` for column styling. Maps `tasksByStatus(status)` into columns. "+" button triggers `onCreateTask(status)`. Click card triggers `onSelectTask(taskId)`.

Column layout: `flex gap-4` with each column `flex-1 min-w-[280px]`. Column header: dot + label + count + add button. Card list: `space-y-2 overflow-auto scrollbar-thin`.

Optional "Show cancelled" toggle at top-right.

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/_components/task-board.tsx
git commit -m "feat(tasks): add Kanban board component"
```

---

### Task 11: Task List (Table View)

**Files:**
- Create: `app/dashboard/digital-employees/_components/task-list.tsx`

Grouped-by-status table view. Each status group is collapsible with a header row showing dot + label + count. Task rows show: status icon, title, assignee, team, due date, priority, menu. Subtasks indented below parent. DONE items strikethrough + faded.

- [ ] **Step 1: Create task-list.tsx**

Columns: Name | Assignee | Team | Due date | Priority | menu (three dots). "Group by" dropdown (Status | Team | Assignee | Priority). Click row → `onSelectTask(taskId)`. Subtask toggle with indented rows.

Use `ChevronDown`/`ChevronRight` for collapse toggle. `MoreHorizontal` for row menu. Badge for priority.

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/_components/task-list.tsx
git commit -m "feat(tasks): add grouped list view component"
```

---

### Task 12: Tasks Tab (Board + List Toggle)

**Files:**
- Create: `app/dashboard/digital-employees/_components/tab-tasks.tsx`

Toolbar + view toggle (board/list) + TaskBoard or TaskList. Also has search, filter dropdowns, and "+ New Task" button.

- [ ] **Step 1: Create tab-tasks.tsx**

```tsx
"use client"

// Toolbar: search, priority filter, assignee filter, view toggle (LayoutGrid/List icons), "+ New Task" button
// Renders TaskBoard or TaskList based on view mode
// Opens TaskDetailPanel (Sheet) when a task is selected
// Opens TaskCreateDialog when "+ New Task" clicked
// Uses useTasks() hook
```

Imports: `TaskBoard`, `TaskList`, `TaskDetailPanel`, `TaskCreateDialog`, `useTasks`.

State: `viewMode` ("board" | "list"), `selectedTaskId`, `showCreateDialog`, `search`, `priorityFilter`, `assigneeFilter`.

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/_components/tab-tasks.tsx
git commit -m "feat(tasks): add tasks tab with board/list toggle"
```

---

### Task 13: Task Create Dialog

**Files:**
- Create: `app/dashboard/digital-employees/_components/task-create-dialog.tsx`

Dialog with fields: Title, Description, Assignee dropdown, Team dropdown, Priority select, Due date, Reviewer, Subtasks inline add.

- [ ] **Step 1: Create task-create-dialog.tsx**

Uses shadcn Dialog, Input, Textarea, Select, Button. Fetches employees and groups for dropdowns. Subtask inline rows with title + assignee. Submit creates parent task, then creates subtasks via separate API calls.

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/_components/task-create-dialog.tsx
git commit -m "feat(tasks): add task creation dialog"
```

---

### Task 14: Task Detail Panel (Slide-Over)

**Files:**
- Create: `app/dashboard/digital-employees/_components/task-detail-panel.tsx`

640px Sheet from the right. Uses `useTaskDetail(taskId)` hook. Sections: header, title/status, properties grid, description, subtasks, review bar, activity timeline, comment box.

- [ ] **Step 1: Create task-detail-panel.tsx**

Uses shadcn `Sheet`, `SheetContent`. Layout:
- Header: close button, task ID mono, copy link button
- Status dropdown (clickable to change status)
- Editable title (inline)
- Properties grid: Assignee, Team, Priority, Due date, Reviewer, Created by
- Description block
- SubtaskList component
- TaskReviewBar component (when status = IN_REVIEW)
- Activity timeline (events + comments merged chronologically)
- Sticky comment input at bottom

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/_components/task-detail-panel.tsx
git commit -m "feat(tasks): add task detail slide-over panel"
```

---

### Task 15: Subtask List + Review Bar

**Files:**
- Create: `app/dashboard/digital-employees/_components/subtask-list.tsx`
- Create: `app/dashboard/digital-employees/_components/task-review-bar.tsx`

- [ ] **Step 1: Create subtask-list.tsx**

Progress bar ("3 of 4 done"). Each subtask row: checkbox, title, assignee, review status tag. Review tags: "Approved" (green), "Awaiting review" (violet + inline buttons), "Review required" (violet dim), "No review" (gray italic). "+ Add subtask" row.

- [ ] **Step 2: Create task-review-bar.tsx**

Purple highlight bar when task is IN_REVIEW: "{Employee} completed this task and is awaiting your review". Three buttons: Approve, Changes, Reject. When not in review: dashed placeholder.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/digital-employees/_components/subtask-list.tsx app/dashboard/digital-employees/_components/task-review-bar.tsx
git commit -m "feat(tasks): add subtask list and review bar components"
```

---

### Task 16: Teams Tab + Team Card

**Files:**
- Create: `app/dashboard/digital-employees/_components/tab-teams.tsx`
- Create: `app/dashboard/digital-employees/_components/team-card.tsx`

- [ ] **Step 1: Create team-card.tsx**

Following the `teams-tab.html` mockup. Each card: team icon + name + description + status badge, member avatar stack with online dots, stacked progress bar (done=emerald, review=violet, progress=blue), task count breakdown, "Manage" button → `/dashboard/groups/{id}`, empty teams: dashed border + "Add Members" CTA.

- [ ] **Step 2: Create tab-teams.tsx**

Grid of team cards. Toolbar: search, "+ Create Team" button. Uses `useEmployeeGroups()` hook. Fetches task counts per group from `useTasks({ groupId })` or aggregates from full task list.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/digital-employees/_components/tab-teams.tsx app/dashboard/digital-employees/_components/team-card.tsx
git commit -m "feat(tasks): add teams tab with team cards"
```

---

### Task 17: Per-Employee Tasks Tab

**Files:**
- Create: `app/dashboard/digital-employees/[id]/_components/tab-tasks.tsx`
- Modify: `app/dashboard/digital-employees/[id]/page.tsx`

- [ ] **Step 1: Create per-employee tab-tasks.tsx**

Same list view as the main task list but filtered to `assigneeId = employeeId`. Uses `useTasks({ filter: { assigneeId } })`. "+ New Task" pre-fills this employee as assignee. Click → TaskDetailPanel.

- [ ] **Step 2: Add Tasks nav item to employee detail page**

In the `NAV_ITEMS` array in `page.tsx`, add a "Tasks" item between "History" and "Workspace":
```typescript
{ id: "tasks", label: "Tasks", icon: CheckSquare, group: "interact" }
```

Add conditional rendering:
```tsx
{activeSection === "tasks" && <TabEmployeeTasks employeeId={id} />}
```

Import `CheckSquare` from lucide-react and the new component.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/digital-employees/\[id\]/_components/tab-tasks.tsx app/dashboard/digital-employees/\[id\]/page.tsx
git commit -m "feat(tasks): add per-employee tasks tab"
```

---

### Task 18: Build Verification + Final Polish

- [ ] **Step 1: Run full TypeScript build**

```bash
bunx tsc --noEmit --pretty
```

Fix any type errors.

- [ ] **Step 2: Run Next.js build**

```bash
bun run build
```

Fix any build errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix(tasks): resolve build errors and polish"
```
