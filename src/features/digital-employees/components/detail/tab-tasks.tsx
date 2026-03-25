"use client"

import { useCallback, useMemo, useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTasks } from "@/hooks/use-tasks"
import { useOrgFetch } from "@/hooks/use-organization"
import type { CreateTaskInput } from "@/lib/digital-employee/task-types"
import { TaskList } from "@/src/features/digital-employees/components/list/task-list"
import { TaskDetailPanel } from "@/src/features/digital-employees/components/list/task-detail-panel"
import { TaskCreateDialog } from "@/src/features/digital-employees/components/list/task-create-dialog"

interface TabEmployeeTasksProps {
  employeeId: string
  employeeName?: string
}

export default function TabEmployeeTasks({
  employeeId,
  employeeName,
}: TabEmployeeTasksProps) {
  const orgFetch = useOrgFetch()
  const { tasks, isLoading, error, createTask, refresh } = useTasks({
    filter: { assigneeId: employeeId },
  })

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; avatar: string | null }>>([])
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([])

  const loadReferences = useCallback(async () => {
    try {
      const [employeesRes, groupsRes] = await Promise.all([
        orgFetch("/api/dashboard/digital-employees"),
        orgFetch("/api/dashboard/groups"),
      ])

      if (employeesRes.ok) {
        const employeeData = await employeesRes.json()
        const emps: Array<{ id: string; name: string; avatar: string | null }> = (
          Array.isArray(employeeData) ? employeeData : employeeData.employees ?? []
        ).map((e: { id: string; name: string; avatar?: string | null }) => ({
          id: e.id,
          name: e.name,
          avatar: e.avatar ?? null,
        }))
        setEmployees(emps)
      }

      if (groupsRes.ok) {
        const groupData = await groupsRes.json()
        const gs: Array<{ id: string; name: string }> = (
          Array.isArray(groupData) ? groupData : groupData.groups ?? []
        ).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))
        setGroups(gs)
      }
    } catch {
      // Keep modal functional even if lookups fail.
    }
  }, [orgFetch])

  async function handleOpenCreateDialog() {
    await loadReferences()
    setShowCreateDialog(true)
  }

  const defaultGroupId = useMemo(() => {
    const assignedTaskWithGroup = tasks.find((task) => task.group_id)
    return assignedTaskWithGroup?.group_id
  }, [tasks])

  async function handleSubmitCreate(input: CreateTaskInput) {
    const result = await createTask({
      ...input,
      assignee_id: employeeId,
    })
    await refresh()
    return result
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div>
          <h3 className="text-sm font-semibold">
            {employeeName ? `${employeeName}'s Tasks` : "Tasks"}
          </h3>
          {!isLoading && (
            <p className="text-xs text-muted-foreground">
              {tasks.filter((t) => !t.parent_task_id).length} task
              {tasks.filter((t) => !t.parent_task_id).length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="h-8 text-xs shrink-0"
          onClick={() => void handleOpenCreateDialog()}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Task
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-destructive mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h3 className="text-sm font-medium mb-1">No tasks assigned</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {employeeName
                ? `${employeeName} has no tasks assigned yet`
                : "No tasks assigned yet"}
            </p>
            <Button size="sm" onClick={() => void handleOpenCreateDialog()}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Task
            </Button>
          </div>
        ) : (
          <TaskList
            tasks={tasks}
            onSelectTask={(id) => setSelectedTaskId(id)}
            onCreateTask={() => void handleOpenCreateDialog()}
          />
        )}
      </div>

      {/* Task Detail Panel */}
      <TaskDetailPanel
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdated={refresh}
      />

      {/* Create Dialog */}
      <TaskCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleSubmitCreate}
        defaultAssigneeId={employeeId}
        defaultGroupId={defaultGroupId}
        employees={employees}
        groups={groups}
      />
    </div>
  )
}
