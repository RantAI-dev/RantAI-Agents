import type {
  AddCommentInput,
  ReviewInput,
  TaskFilter,
  Task,
  TaskComment,
  TaskDetail,
} from "@/lib/digital-employee/task-types"
import {
  addTaskComment,
  createTaskForOrganization,
  deleteTaskById,
  findTaskDetail,
  listTaskComments,
  listTaskEvents,
  listTasksByOrganization,
  submitTaskReview,
  updateTaskById,
} from "./repository"
import type { CreateTaskProxyInput } from "./repository"
import type {
  CreateTaskBodyInput,
  CreateTaskCommentBodyInput,
  SubmitTaskReviewBodyInput,
  TaskFilterQueryInput,
  UpdateTaskBodyInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

/**
 * Lists tasks for an organization with optional filters.
 */
export async function listDashboardTasks(params: {
  organizationId: string
  filter: TaskFilterQueryInput
}) {
  const taskFilter: TaskFilter = {
    ...params.filter,
  }

  return listTasksByOrganization(params.organizationId, taskFilter)
}

/**
 * Creates a task through an available active container.
 */
export async function createDashboardTask(params: {
  organizationId: string
  userId: string
  input: CreateTaskBodyInput
}): Promise<Task | ServiceError> {
  const payload: CreateTaskProxyInput = {
    ...params.input,
    created_by_user_id: params.userId,
  }
  const task = await createTaskForOrganization(params.organizationId, payload)

  if (!task) {
    return { status: 503, error: "No active container available to create task" }
  }

  return task
}

/**
 * Gets one task detail by id.
 */
export async function getDashboardTaskDetail(params: {
  organizationId: string
  taskId: string
}): Promise<TaskDetail | ServiceError> {
  const detail = await findTaskDetail(params.taskId, params.organizationId)
  if (!detail) {
    return { status: 404, error: "Task not found" }
  }

  return detail
}

/**
 * Updates one task by id.
 */
export async function updateDashboardTask(params: {
  organizationId: string
  taskId: string
  input: UpdateTaskBodyInput
}): Promise<Task | ServiceError> {
  const task = await updateTaskById(params.taskId, params.input, params.organizationId)

  if (!task) {
    return { status: 404, error: "Task not found or update failed" }
  }

  return task
}

/**
 * Deletes one task by id.
 */
export async function deleteDashboardTask(params: {
  organizationId: string
  taskId: string
}) {
  await deleteTaskById(params.taskId, params.organizationId)
  return { success: true as const }
}

/**
 * Lists task comments.
 */
export async function listDashboardTaskComments(params: {
  organizationId: string
  taskId: string
}) {
  return listTaskComments(params.taskId, params.organizationId)
}

/**
 * Adds one human-authored comment.
 */
export async function createDashboardTaskComment(params: {
  organizationId: string
  taskId: string
  userId: string
  input: CreateTaskCommentBodyInput
}): Promise<TaskComment | ServiceError> {
  const payload: AddCommentInput = {
    ...params.input,
    author_type: "HUMAN",
    author_user_id: params.userId,
  }

  const comment = await addTaskComment(
    params.taskId,
    payload,
    params.organizationId
  )

  if (!comment) {
    return { status: 502, error: "Failed to add comment" }
  }

  return comment
}

/**
 * Lists task events.
 */
export async function listDashboardTaskEvents(params: {
  organizationId: string
  taskId: string
}) {
  return listTaskEvents(params.taskId, params.organizationId)
}

/**
 * Submits a task review decision.
 */
export async function reviewDashboardTask(params: {
  organizationId: string
  taskId: string
  input: SubmitTaskReviewBodyInput
}): Promise<Task | ServiceError> {
  const payload: ReviewInput = {
    ...params.input,
  }

  const task = await submitTaskReview(
    params.taskId,
    payload,
    params.organizationId
  )

  if (!task) {
    return { status: 502, error: "Review submission failed" }
  }

  return task
}

export function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}
