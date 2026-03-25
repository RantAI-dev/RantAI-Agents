import { z } from "zod"
import type {
  AddCommentInput,
  CreateTaskInput,
  ReviewInput,
  TaskFilter,
  UpdateTaskInput,
} from "@/lib/digital-employee/task-types"

const TaskStatusSchema = z.enum([
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
])
const TaskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"])

export const TaskIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const TaskFilterQuerySchema: z.ZodType<TaskFilter> = z.object({
  status: TaskStatusSchema.optional(),
  assigneeId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  priority: TaskPrioritySchema.optional(),
  topLevelOnly: z.boolean().optional(),
})

export const CreateTaskBodySchema: z.ZodType<CreateTaskInput> = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  priority: TaskPrioritySchema.optional(),
  assignee_id: z.string().optional(),
  group_id: z.string().optional(),
  reviewer_id: z.string().optional(),
  human_review: z.boolean().optional(),
  parent_task_id: z.string().optional(),
  due_date: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const UpdateTaskBodySchema: z.ZodType<UpdateTaskInput> = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assignee_id: z.string().nullable().optional(),
  group_id: z.string().nullable().optional(),
  reviewer_id: z.string().nullable().optional(),
  human_review: z.boolean().optional(),
  due_date: z.string().nullable().optional(),
  order_in_status: z.number().optional(),
  order_in_parent: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const CreateTaskCommentBodySchema: z.ZodType<AddCommentInput> = z.object({
  content: z.string().trim().min(1),
  author_type: z.enum(["HUMAN", "EMPLOYEE"]).optional(),
  author_employee_id: z.string().optional(),
  author_user_id: z.string().optional(),
})

export const ReviewActionSchema = z.enum(["approve", "changes", "reject"])

export const SubmitTaskReviewBodySchema: z.ZodType<ReviewInput> = z.object({
  action: ReviewActionSchema,
  comment: z.string().optional(),
})

export type TaskFilterQueryInput = z.infer<typeof TaskFilterQuerySchema>
export type CreateTaskBodyInput = z.infer<typeof CreateTaskBodySchema>
export type UpdateTaskBodyInput = z.infer<typeof UpdateTaskBodySchema>
export type CreateTaskCommentBodyInput = z.infer<typeof CreateTaskCommentBodySchema>
export type SubmitTaskReviewBodyInput = z.infer<typeof SubmitTaskReviewBodySchema>

export function parseTaskFilterSearchParams(searchParams: URLSearchParams): TaskFilterQueryInput {
  return TaskFilterQuerySchema.parse({
    status: searchParams.get("status") ?? undefined,
    assigneeId: searchParams.get("assigneeId") ?? undefined,
    groupId: searchParams.get("groupId") ?? undefined,
    priority: searchParams.get("priority") ?? undefined,
    topLevelOnly: searchParams.get("topLevelOnly") === "true" ? true : undefined,
  })
}
