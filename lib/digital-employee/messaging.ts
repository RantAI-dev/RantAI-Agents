export const MESSAGE_TYPES = ["message", "task", "handoff", "broadcast"] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

export const MESSAGE_STATUSES = ["pending", "delivered", "in_progress", "completed", "failed", "cancelled", "pending_approval"] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const MESSAGE_PRIORITIES = ["low", "normal", "high", "urgent"] as const
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number]

export const MESSAGE_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  delivered: { label: "Delivered", className: "bg-blue-500/10 text-blue-500" },
  in_progress: { label: "In Progress", className: "bg-amber-500/10 text-amber-500" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-500" },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-500" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  pending_approval: { label: "Awaiting Approval", className: "bg-amber-500/10 text-amber-500" },
}

export const MESSAGE_TYPE_STYLES: Record<string, { label: string; icon: string }> = {
  message: { label: "Message", icon: "\u{1F4AC}" },
  task: { label: "Task", icon: "\u{1F4CB}" },
  handoff: { label: "Handoff", icon: "\u{1F91D}" },
  broadcast: { label: "Broadcast", icon: "\u{1F4E2}" },
}
