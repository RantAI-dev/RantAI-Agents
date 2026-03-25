"use client"

import { useEffect, useState, KeyboardEvent } from "react"
import { X, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { CreateTaskInput, TaskStatus, TaskPriority } from "@/lib/digital-employee/task-types"

interface TaskCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateTaskInput) => Promise<{ id: string } | void>
  defaultStatus?: TaskStatus
  defaultAssigneeId?: string
  defaultGroupId?: string
  employees?: Array<{ id: string; name: string; avatar: string | null }>
  groups?: Array<{ id: string; name: string }>
}

function getAvatarLetter(name: string) {
  return name.charAt(0).toUpperCase()
}

function AvatarCircle({ name }: { name: string }) {
  const colors = [
    "bg-blue-500/20 text-blue-600",
    "bg-violet-500/20 text-violet-600",
    "bg-emerald-500/20 text-emerald-600",
    "bg-amber-500/20 text-amber-600",
    "bg-rose-500/20 text-rose-600",
    "bg-cyan-500/20 text-cyan-600",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const color = colors[Math.abs(hash) % colors.length]
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold shrink-0",
        color
      )}
    >
      {getAvatarLetter(name)}
    </span>
  )
}

export function TaskCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultStatus,
  defaultAssigneeId,
  defaultGroupId,
  employees = [],
  groups = [],
}: TaskCreateDialogProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId ?? "__none__")
  const [groupId, setGroupId] = useState(defaultGroupId ?? "__none__")
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM")
  const [dueDate, setDueDate] = useState("")
  const [reviewerId, setReviewerId] = useState("__none__")
  const [subtaskInput, setSubtaskInput] = useState("")
  const [subtasks, setSubtasks] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleReset() {
    setTitle("")
    setDescription("")
    setAssigneeId(defaultAssigneeId ?? "__none__")
    setGroupId(defaultGroupId ?? "__none__")
    setPriority("MEDIUM")
    setDueDate("")
    setReviewerId("__none__")
    setSubtaskInput("")
    setSubtasks([])
  }

  function handleClose() {
    handleReset()
    onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return
    setAssigneeId(defaultAssigneeId ?? "__none__")
    setGroupId(defaultGroupId ?? "__none__")
  }, [open, defaultAssigneeId, defaultGroupId])

  function handleAddSubtask() {
    const t = subtaskInput.trim()
    if (!t) return
    setSubtasks((prev) => [...prev, t])
    setSubtaskInput("")
  }

  function handleSubtaskKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddSubtask()
    }
  }

  function removeSubtask(idx: number) {
    setSubtasks((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!title.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      const resolvedAssignee = assigneeId !== "__none__" ? assigneeId : undefined
      const resolvedGroup = groupId !== "__none__" ? groupId : undefined
      const resolvedReviewer =
        reviewerId !== "__none__" && reviewerId !== "__human__"
          ? reviewerId
          : undefined

      const input: CreateTaskInput = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assignee_id: resolvedAssignee,
        group_id: resolvedGroup,
        due_date: dueDate || undefined,
        human_review: reviewerId === "__human__" ? true : undefined,
        reviewer_id: resolvedReviewer,
        metadata: defaultStatus ? { initial_status: defaultStatus } : undefined,
      }

      // Submit parent task
      const result = await onSubmit(input)

      // Create subtasks with parent_task_id
      if (result?.id && subtasks.length > 0) {
        for (const subtaskTitle of subtasks) {
          await onSubmit({
            title: subtaskTitle,
            parent_task_id: result.id,
            assignee_id: resolvedAssignee,
            group_id: resolvedGroup,
            priority,
          })
        }
      }

      handleReset()
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="task-title"
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Assignee */}
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      <div className="flex items-center gap-2">
                        <AvatarCircle name={emp.name} />
                        <span>{emp.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Team */}
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="No team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No team</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                      High
                    </span>
                  </SelectItem>
                  <SelectItem value="MEDIUM">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                      Medium
                    </span>
                  </SelectItem>
                  <SelectItem value="LOW">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      Low
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <Label htmlFor="task-due-date">Due Date</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Reviewer */}
          <div className="space-y-1.5">
            <Label>Reviewer</Label>
            <Select value={reviewerId} onValueChange={setReviewerId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                <SelectItem value="__human__">Human review</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    <div className="flex items-center gap-2">
                      <AvatarCircle name={emp.name} />
                      <span>{emp.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subtasks */}
          <div className="space-y-2">
            <Label>Subtasks</Label>
            {subtasks.length > 0 && (
              <ul className="space-y-1">
                {subtasks.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 py-1 px-2 rounded bg-muted/40 text-sm"
                  >
                    <span className="flex-1 truncate">{s}</span>
                    <button
                      type="button"
                      onClick={() => removeSubtask(i)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add subtask, press Enter..."
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                onKeyDown={handleSubtaskKeyDown}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 shrink-0"
                onClick={handleAddSubtask}
                disabled={!subtaskInput.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TaskCreateDialog
