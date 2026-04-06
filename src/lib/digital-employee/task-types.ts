// ─── Task Engine Types — mirrors RantaiClaw gateway API contract ──────────────
// All JSON fields use snake_case to match the gateway wire format.

export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED"

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH"

export type ReviewStatus = "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"

export type ReviewAction = "approve" | "changes" | "reject"

export type ActorType = "HUMAN" | "EMPLOYEE"

export type TaskEventType =
  | "CREATED"
  | "STATUS_CHANGED"
  | "ASSIGNED"
  | "REVIEW_SUBMITTED"
  | "REVIEW_RESPONDED"
  | "COMMENT"
  | "SUBTASK_COMPLETED"

// ─── Core Task Interface ───────────────────────────────────────────────────────

export interface Task {
  id: string
  organization_id: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id?: string | null
  group_id?: string | null
  reviewer_id?: string | null
  human_review: boolean
  review_status?: ReviewStatus | null
  review_comment?: string | null
  parent_task_id?: string | null
  created_by_employee_id?: string | null
  created_by_user_id?: string | null
  due_date?: string | null
  completed_at?: string | null
  order_in_status: number
  order_in_parent: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Comment & Event Types ─────────────────────────────────────────────────────

export interface TaskComment {
  id: string
  task_id: string
  content: string
  author_type: ActorType
  author_employee_id?: string | null
  author_user_id?: string | null
  created_at: string
}

export interface TaskEvent {
  id: string
  task_id: string
  event_type: TaskEventType
  actor_type: ActorType
  actor_employee_id?: string | null
  actor_user_id?: string | null
  data: Record<string, unknown>
  created_at: string
}

// ─── Task Detail (full hydrated response) ─────────────────────────────────────

export interface TaskDetail {
  task: Task
  subtasks: Task[]
  comments: TaskComment[]
  events: TaskEvent[]
}

// ─── Input / DTO Types ────────────────────────────────────────────────────────

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
  metadata?: Record<string, unknown>
}

export interface UpdateTaskInput {
  title?: string
  description?: string
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
}

export interface AddCommentInput {
  content: string
  author_type?: ActorType
  author_employee_id?: string
  author_user_id?: string
}

// ─── Filter / Query Types ──────────────────────────────────────────────────────

export interface TaskFilter {
  status?: TaskStatus
  assigneeId?: string
  groupId?: string
  priority?: TaskPriority
  topLevelOnly?: boolean
}

// ─── Enriched Task (for UI consumption) ───────────────────────────────────────

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

// ─── Status & Priority Config ─────────────────────────────────────────────────

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
]

export const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string; dotClass: string }
> = {
  TODO: {
    label: "To Do",
    color: "text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "text-blue-500",
    dotClass: "bg-blue-500",
  },
  IN_REVIEW: {
    label: "In Review",
    color: "text-violet-500",
    dotClass: "bg-violet-500",
  },
  DONE: {
    label: "Done",
    color: "text-green-500",
    dotClass: "bg-green-500",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "text-destructive",
    dotClass: "bg-destructive",
  },
}

export const TASK_PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; color: string }
> = {
  LOW: {
    label: "Low",
    color: "text-muted-foreground",
  },
  MEDIUM: {
    label: "Medium",
    color: "text-yellow-500",
  },
  HIGH: {
    label: "High",
    color: "text-red-500",
  },
}
