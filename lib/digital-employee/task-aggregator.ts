// ─── Task Aggregator ──────────────────────────────────────────────────────────
// Fan-out reads from RantaiClaw containers + Prisma cache fallback.
// Source of truth for task data lives inside the containers themselves.

import { prisma } from "@/lib/prisma"
import type {
  Task,
  TaskComment,
  TaskEvent,
  TaskDetail,
  EnrichedTask,
  CreateTaskInput,
  UpdateTaskInput,
  ReviewInput,
  AddCommentInput,
  TaskFilter,
  TaskStatus,
  TaskPriority,
  ReviewStatus,
  ActorType,
  TaskEventType,
} from "./task-types"

// ─── Container Target ─────────────────────────────────────────────────────────

interface ContainerTarget {
  url: string
  token: string
  sourceId: string
  sourceType: "employee" | "group"
}

// ─── Active Container Resolution ──────────────────────────────────────────────

export async function getActiveContainers(orgId: string): Promise<ContainerTarget[]> {
  const targets: ContainerTarget[] = []

  // Individual employees (not in a group)
  const employees = await prisma.digitalEmployee.findMany({
    where: {
      organizationId: orgId,
      containerPort: { not: null },
      gatewayToken: { not: null },
      groupId: null,
    },
    select: { id: true, containerPort: true, gatewayToken: true },
  })

  for (const emp of employees) {
    if (emp.containerPort !== null && emp.gatewayToken !== null) {
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

  for (const grp of groups) {
    if (grp.containerPort !== null && grp.gatewayToken !== null) {
      targets.push({
        url: `http://localhost:${grp.containerPort}`,
        token: grp.gatewayToken,
        sourceId: grp.id,
        sourceType: "group",
      })
    }
  }

  return targets
}

export async function resolveWriteTarget(
  assigneeId: string | null | undefined,
  orgId: string,
): Promise<ContainerTarget | null> {
  if (assigneeId) {
    // Check if assignee belongs to a group that has a container
    const emp = await prisma.digitalEmployee.findFirst({
      where: { id: assigneeId, organizationId: orgId },
      select: { id: true, groupId: true, containerPort: true, gatewayToken: true },
    })

    if (emp) {
      if (emp.groupId) {
        // Use group container
        const grp = await prisma.employeeGroup.findFirst({
          where: { id: emp.groupId, containerPort: { not: null }, gatewayToken: { not: null } },
          select: { id: true, containerPort: true, gatewayToken: true },
        })
        if (grp && grp.containerPort !== null && grp.gatewayToken !== null) {
          return {
            url: `http://localhost:${grp.containerPort}`,
            token: grp.gatewayToken,
            sourceId: grp.id,
            sourceType: "group",
          }
        }
      } else if (emp.containerPort !== null && emp.gatewayToken !== null) {
        // Use employee's own container
        return {
          url: `http://localhost:${emp.containerPort}`,
          token: emp.gatewayToken,
          sourceId: emp.id,
          sourceType: "employee",
        }
      }
    }
  }

  // Fallback: first active container in org
  const all = await getActiveContainers(orgId)
  return all[0] ?? null
}

// ─── Helper: resolve container for a cached task ──────────────────────────────

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
  sourceGroupId: string | null,
): Promise<ContainerTarget | null> {
  // Try group container first
  if (sourceGroupId) {
    const grp = await prisma.employeeGroup.findFirst({
      where: { id: sourceGroupId, containerPort: { not: null }, gatewayToken: { not: null } },
      select: { id: true, containerPort: true, gatewayToken: true },
    })
    if (grp && grp.containerPort !== null && grp.gatewayToken !== null) {
      return {
        url: `http://localhost:${grp.containerPort}`,
        token: grp.gatewayToken,
        sourceId: grp.id,
        sourceType: "group",
      }
    }
  }

  // Fall back to employee container
  const emp = await prisma.digitalEmployee.findFirst({
    where: { id: sourceEmployeeId, containerPort: { not: null }, gatewayToken: { not: null } },
    select: { id: true, containerPort: true, gatewayToken: true },
  })
  if (emp && emp.containerPort !== null && emp.gatewayToken !== null) {
    return {
      url: `http://localhost:${emp.containerPort}`,
      token: emp.gatewayToken,
      sourceId: emp.id,
      sourceType: "employee",
    }
  }

  return null
}

// ─── Prisma -> API Conversion ─────────────────────────────────────────────────

export function prismaTaskToApi(prismaTask: {
  id: string
  organizationId: string
  title: string
  description?: string | null
  status: string
  priority: string
  assigneeId?: string | null
  groupId?: string | null
  reviewerId?: string | null
  humanReview: boolean
  reviewStatus?: string | null
  reviewComment?: string | null
  parentTaskId?: string | null
  createdByEmployeeId?: string | null
  createdByUserId?: string | null
  dueDate?: Date | null
  completedAt?: Date | null
  orderInStatus: number
  orderInParent: number
  metadata: unknown
  sourceEmployeeId: string
  isStale: boolean
  createdAt: Date
  updatedAt: Date
}): Task {
  return {
    id: prismaTask.id,
    organization_id: prismaTask.organizationId,
    title: prismaTask.title,
    description: prismaTask.description,
    status: prismaTask.status as TaskStatus,
    priority: prismaTask.priority as TaskPriority,
    assignee_id: prismaTask.assigneeId,
    group_id: prismaTask.groupId,
    reviewer_id: prismaTask.reviewerId,
    human_review: prismaTask.humanReview,
    review_status: prismaTask.reviewStatus as ReviewStatus | null,
    review_comment: prismaTask.reviewComment,
    parent_task_id: prismaTask.parentTaskId,
    created_by_employee_id: prismaTask.createdByEmployeeId,
    created_by_user_id: prismaTask.createdByUserId,
    due_date: prismaTask.dueDate?.toISOString() ?? null,
    completed_at: prismaTask.completedAt?.toISOString() ?? null,
    order_in_status: prismaTask.orderInStatus,
    order_in_parent: prismaTask.orderInParent,
    metadata: (prismaTask.metadata as Record<string, unknown>) ?? {},
    created_at: prismaTask.createdAt.toISOString(),
    updated_at: prismaTask.updatedAt.toISOString(),
  }
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

async function upsertTaskCache(
  task: Task,
  sourceEmployeeId: string,
  sourceGroupId: string | null,
  orgId: string,
): Promise<void> {
  await prisma.employeeTask.upsert({
    where: { id: task.id },
    create: {
      id: task.id,
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
      metadata: task.metadata as object,
      sourceEmployeeId,
      sourceGroupId,
      isStale: false,
      createdAt: new Date(task.created_at),
      updatedAt: new Date(task.updated_at),
    },
    update: {
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
      metadata: task.metadata as object,
      sourceEmployeeId,
      sourceGroupId,
      isStale: false,
      updatedAt: new Date(task.updated_at),
    },
  })
}

async function cacheTasks(
  items: Array<{ task: Task; sourceEmployeeId: string; sourceGroupId: string | null }>,
  orgId: string,
): Promise<void> {
  await Promise.all(
    items.map(({ task, sourceEmployeeId, sourceGroupId }) =>
      upsertTaskCache(task, sourceEmployeeId, sourceGroupId, orgId),
    ),
  )
}

async function markStaleContainers(orgId: string, activeSourceIds: string[]): Promise<void> {
  // Mark tasks from inactive containers as stale
  await prisma.employeeTask.updateMany({
    where: {
      organizationId: orgId,
      sourceEmployeeId: { notIn: activeSourceIds },
      isStale: false,
    },
    data: { isStale: true },
  })

  // Un-mark tasks from now-active containers
  if (activeSourceIds.length > 0) {
    await prisma.employeeTask.updateMany({
      where: {
        organizationId: orgId,
        sourceEmployeeId: { in: activeSourceIds },
        isStale: true,
      },
      data: { isStale: false },
    })
  }
}

// ─── Enrichment Helpers ────────────────────────────────────────────────────────

async function enrichTasks(tasks: Task[], orgId: string): Promise<EnrichedTask[]> {
  // Gather unique assignee IDs to look up names/avatars
  const assigneeIds = [...new Set(tasks.map((t) => t.assignee_id).filter(Boolean) as string[])]
  const groupIds = [...new Set(tasks.map((t) => t.group_id).filter(Boolean) as string[])]

  const [employees, groups] = await Promise.all([
    assigneeIds.length > 0
      ? prisma.digitalEmployee.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, avatar: true, status: true },
        })
      : [],
    groupIds.length > 0
      ? prisma.employeeGroup.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, name: true },
        })
      : [],
  ])

  const empMap = new Map(employees.map((e) => [e.id, e]))
  const grpMap = new Map(groups.map((g) => [g.id, g]))

  // Count subtasks per parent task
  const parentIds = tasks.map((t) => t.id)
  const subtaskCounts =
    parentIds.length > 0
      ? await prisma.employeeTask.groupBy({
          by: ["parentTaskId"],
          where: { parentTaskId: { in: parentIds } },
          _count: { id: true },
        })
      : []
  const subtaskDoneCounts =
    parentIds.length > 0
      ? await prisma.employeeTask.groupBy({
          by: ["parentTaskId"],
          where: { parentTaskId: { in: parentIds }, status: "DONE" },
          _count: { id: true },
        })
      : []

  const subtaskCountMap = new Map(
    subtaskCounts.map((r) => [r.parentTaskId!, r._count.id]),
  )
  const subtaskDoneMap = new Map(
    subtaskDoneCounts.map((r) => [r.parentTaskId!, r._count.id]),
  )

  // Get stale/source info from cache
  const cachedMeta = await prisma.employeeTask.findMany({
    where: { id: { in: tasks.map((t) => t.id) } },
    select: { id: true, isStale: true, sourceEmployeeId: true },
  })
  const cacheMap = new Map(cachedMeta.map((c) => [c.id, c]))

  return tasks.map((task): EnrichedTask => {
    const emp = task.assignee_id ? empMap.get(task.assignee_id) : undefined
    const grp = task.group_id ? grpMap.get(task.group_id) : undefined
    const cached = cacheMap.get(task.id)

    return {
      ...task,
      assignee_name: emp?.name,
      assignee_avatar: emp?.avatar ?? undefined,
      assignee_online: emp ? (emp.status as string) === "ACTIVE" : undefined,
      group_name: grp?.name,
      is_stale: cached?.isStale ?? false,
      source_employee_id: cached?.sourceEmployeeId,
      subtask_count: subtaskCountMap.get(task.id) ?? 0,
      subtask_done_count: subtaskDoneMap.get(task.id) ?? 0,
    }
  })
}

// ─── Fan-Out Task Query ────────────────────────────────────────────────────────

export async function fanOutTaskQuery(
  orgId: string,
  filter?: TaskFilter,
): Promise<EnrichedTask[]> {
  const containers = await getActiveContainers(orgId)

  // Build query params for the gateway
  const buildParams = (target: ContainerTarget): URLSearchParams => {
    const params = new URLSearchParams()
    params.set("organization_id", orgId)
    if (filter?.status) params.set("status", filter.status)
    if (filter?.assigneeId) params.set("assignee_id", filter.assigneeId)
    if (filter?.groupId) params.set("group_id", filter.groupId)
    if (filter?.priority) params.set("priority", filter.priority)
    if (filter?.topLevelOnly) params.set("top_level_only", "true")
    return params
  }

  const results = await Promise.allSettled(
    containers.map(async (target) => {
      const params = buildParams(target)
      const res = await fetch(`${target.url}/tasks?${params.toString()}`, {
        headers: { Authorization: `Bearer ${target.token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`Container ${target.sourceId} returned ${res.status}`)
      const data = (await res.json()) as Task[]
      return { target, tasks: data }
    }),
  )

  // Merge by task ID — latest updated_at wins
  const merged = new Map<string, { task: Task; sourceEmployeeId: string; sourceGroupId: string | null }>()
  const activeSourceIds: string[] = []

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { target, tasks } = result.value
      activeSourceIds.push(target.sourceId)

      for (const task of tasks) {
        const existing = merged.get(task.id)
        if (!existing || new Date(task.updated_at) > new Date(existing.task.updated_at)) {
          merged.set(task.id, {
            task,
            sourceEmployeeId: target.sourceType === "employee" ? target.sourceId : task.assignee_id ?? target.sourceId,
            sourceGroupId: target.sourceType === "group" ? target.sourceId : null,
          })
        }
      }
    }
  }

  const liveItems = Array.from(merged.values())

  // Cache live tasks (fire-and-forget)
  cacheTasks(liveItems, orgId).catch(() => {})

  // Mark stale containers
  await markStaleContainers(orgId, activeSourceIds).catch(() => {})

  // If no containers responded, fall back entirely to Prisma cache
  if (liveItems.length === 0 && containers.length === 0) {
    const where: Record<string, unknown> = { organizationId: orgId }
    if (filter?.status) where.status = filter.status
    if (filter?.assigneeId) where.assigneeId = filter.assigneeId
    if (filter?.groupId) where.groupId = filter.groupId
    if (filter?.priority) where.priority = filter.priority
    if (filter?.topLevelOnly) where.parentTaskId = null

    const cached = await prisma.employeeTask.findMany({ where })
    const apiTasks = cached.map(prismaTaskToApi)
    return enrichTasks(apiTasks, orgId)
  }

  // Get stale (offline container) tasks from Prisma cache
  const staleCached = await prisma.employeeTask.findMany({
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

  const staleTasks = staleCached
    .filter((c) => !merged.has(c.id))
    .map(prismaTaskToApi)

  const allTasks = [...liveItems.map((i) => i.task), ...staleTasks]
  return enrichTasks(allTasks, orgId)
}

// ─── Proxy: Create Task ────────────────────────────────────────────────────────

export async function proxyCreateTask(
  orgId: string,
  input: CreateTaskInput,
): Promise<Task | null> {
  const target = await resolveWriteTarget(input.assignee_id, orgId)
  if (!target) return null

  const res = await fetch(`${target.url}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${target.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...input, organization_id: orgId }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) return null
  const task = (await res.json()) as Task

  const sourceEmployeeId = target.sourceType === "employee" ? target.sourceId : (input.assignee_id ?? target.sourceId)
  const sourceGroupId = target.sourceType === "group" ? target.sourceId : null

  upsertTaskCache(task, sourceEmployeeId, sourceGroupId, orgId).catch(() => {})
  return task
}

// ─── Proxy: Get Task Detail ────────────────────────────────────────────────────

export async function proxyGetTaskDetail(
  taskId: string,
  orgId: string,
): Promise<TaskDetail | null> {
  const target = await resolveContainerForTask(taskId)

  if (target) {
    try {
      const res = await fetch(`${target.url}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${target.token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const detail = (await res.json()) as TaskDetail
        // Cache the task
        const sourceEmployeeId = target.sourceType === "employee" ? target.sourceId : (detail.task.assignee_id ?? target.sourceId)
        const sourceGroupId = target.sourceType === "group" ? target.sourceId : null
        upsertTaskCache(detail.task, sourceEmployeeId, sourceGroupId, orgId).catch(() => {})
        return detail
      }
    } catch {
      // Fall through to cache
    }
  }

  // Fall back to Prisma cache
  const cached = await prisma.employeeTask.findUnique({
    where: { id: taskId },
    include: { subtasks: true, comments: true, events: true },
  })
  if (!cached) return null

  const task = prismaTaskToApi(cached)
  const subtasks = cached.subtasks.map(prismaTaskToApi)
  const comments: TaskComment[] = cached.comments.map((c) => ({
    id: c.id,
    task_id: c.taskId,
    content: c.content,
    author_type: c.authorType as ActorType,
    author_employee_id: c.authorEmployeeId,
    author_user_id: c.authorUserId,
    created_at: c.createdAt.toISOString(),
  }))
  const events: TaskEvent[] = cached.events.map((e) => ({
    id: e.id,
    task_id: e.taskId,
    event_type: e.eventType as TaskEventType,
    actor_type: e.actorType as ActorType,
    actor_employee_id: e.actorEmployeeId,
    actor_user_id: e.actorUserId,
    data: (e.data as Record<string, unknown>) ?? {},
    created_at: e.createdAt.toISOString(),
  }))

  return { task, subtasks, comments, events }
}

// ─── Proxy: Update Task ────────────────────────────────────────────────────────

export async function proxyUpdateTask(
  taskId: string,
  input: UpdateTaskInput,
  orgId: string,
): Promise<Task | null> {
  const target = await resolveContainerForTask(taskId)
  if (!target) return null

  const res = await fetch(`${target.url}/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${target.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) return null
  const task = (await res.json()) as Task

  const sourceEmployeeId = target.sourceType === "employee" ? target.sourceId : (task.assignee_id ?? target.sourceId)
  const sourceGroupId = target.sourceType === "group" ? target.sourceId : null
  upsertTaskCache(task, sourceEmployeeId, sourceGroupId, orgId).catch(() => {})
  return task
}

// ─── Proxy: Delete Task ────────────────────────────────────────────────────────

export async function proxyDeleteTask(taskId: string): Promise<boolean> {
  const target = await resolveContainerForTask(taskId)

  if (target) {
    try {
      const res = await fetch(`${target.url}/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${target.token}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return false
    } catch {
      return false
    }
  }

  // Remove from cache regardless
  await prisma.employeeTask.delete({ where: { id: taskId } }).catch(() => {})
  return true
}

// ─── Proxy: Submit Review ──────────────────────────────────────────────────────

export async function proxySubmitReview(
  taskId: string,
  input: ReviewInput,
  orgId: string,
): Promise<Task | null> {
  const target = await resolveContainerForTask(taskId)
  if (!target) return null

  const res = await fetch(`${target.url}/tasks/${taskId}/review`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${target.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) return null
  const task = (await res.json()) as Task

  const sourceEmployeeId = target.sourceType === "employee" ? target.sourceId : (task.assignee_id ?? target.sourceId)
  const sourceGroupId = target.sourceType === "group" ? target.sourceId : null
  upsertTaskCache(task, sourceEmployeeId, sourceGroupId, orgId).catch(() => {})
  return task
}

// ─── Proxy: Comments ──────────────────────────────────────────────────────────

export async function proxyGetComments(taskId: string): Promise<TaskComment[]> {
  const target = await resolveContainerForTask(taskId)

  if (target) {
    try {
      const res = await fetch(`${target.url}/tasks/${taskId}/comments`, {
        headers: { Authorization: `Bearer ${target.token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        return (await res.json()) as TaskComment[]
      }
    } catch {
      // Fall through to cache
    }
  }

  // Fall back to Prisma cache
  const comments = await prisma.employeeTaskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  })

  return comments.map((c) => ({
    id: c.id,
    task_id: c.taskId,
    content: c.content,
    author_type: c.authorType as ActorType,
    author_employee_id: c.authorEmployeeId,
    author_user_id: c.authorUserId,
    created_at: c.createdAt.toISOString(),
  }))
}

export async function proxyAddComment(
  taskId: string,
  input: AddCommentInput,
  orgId: string,
): Promise<TaskComment | null> {
  const target = await resolveContainerForTask(taskId)
  if (!target) return null

  const res = await fetch(`${target.url}/tasks/${taskId}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${target.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) return null
  const comment = (await res.json()) as TaskComment

  // Cache the comment
  prisma.employeeTaskComment
    .upsert({
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
    .catch(() => {})

  return comment
}

// ─── Proxy: Events ────────────────────────────────────────────────────────────

export async function proxyGetEvents(taskId: string): Promise<TaskEvent[]> {
  const target = await resolveContainerForTask(taskId)

  if (target) {
    try {
      const res = await fetch(`${target.url}/tasks/${taskId}/events`, {
        headers: { Authorization: `Bearer ${target.token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        return (await res.json()) as TaskEvent[]
      }
    } catch {
      // Fall through to cache
    }
  }

  // Fall back to Prisma cache
  const events = await prisma.employeeTaskEvent.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  })

  return events.map((e) => ({
    id: e.id,
    task_id: e.taskId,
    event_type: e.eventType as TaskEventType,
    actor_type: e.actorType as ActorType,
    actor_employee_id: e.actorEmployeeId,
    actor_user_id: e.actorUserId,
    data: (e.data as Record<string, unknown>) ?? {},
    created_at: e.createdAt.toISOString(),
  }))
}
