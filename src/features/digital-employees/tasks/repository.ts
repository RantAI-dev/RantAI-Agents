import {
  fanOutTaskQuery,
  proxyAddComment,
  proxyCreateTask,
  proxyDeleteTask,
  proxyGetComments,
  proxyGetEvents,
  proxyGetTaskDetail,
  proxySubmitReview,
  proxyUpdateTask,
} from "@/lib/digital-employee/task-aggregator"
import type { TaskFilter } from "@/lib/digital-employee/task-types"
import type {
  AddCommentInput,
  CreateTaskInput,
  ReviewInput,
  UpdateTaskInput,
} from "@/lib/digital-employee/task-types"
export type CreateTaskProxyInput = CreateTaskInput & { created_by_user_id?: string }

export async function listTasksByOrganization(
  organizationId: string,
  filter: TaskFilter
) {
  return fanOutTaskQuery(organizationId, filter)
}

export async function createTaskForOrganization(
  organizationId: string,
  payload: CreateTaskProxyInput
) {
  return proxyCreateTask(organizationId, payload as CreateTaskInput)
}

export async function findTaskDetail(taskId: string, organizationId: string) {
  return proxyGetTaskDetail(taskId, organizationId)
}

export async function updateTaskById(
  taskId: string,
  payload: UpdateTaskInput,
  organizationId: string
) {
  return proxyUpdateTask(taskId, payload, organizationId)
}

export async function deleteTaskById(taskId: string, organizationId: string) {
  await proxyDeleteTask(taskId, organizationId)
}

export async function listTaskComments(taskId: string, organizationId: string) {
  return proxyGetComments(taskId, organizationId)
}

export async function addTaskComment(
  taskId: string,
  payload: AddCommentInput,
  organizationId: string
) {
  return proxyAddComment(taskId, payload, organizationId)
}

export async function listTaskEvents(taskId: string, organizationId: string) {
  return proxyGetEvents(taskId, organizationId)
}

export async function submitTaskReview(
  taskId: string,
  payload: ReviewInput,
  organizationId: string
) {
  return proxySubmitReview(taskId, payload, organizationId)
}
