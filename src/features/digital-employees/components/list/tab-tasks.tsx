"use client"

import { useState, useMemo, useCallback } from "react"
import { Search, LayoutGrid, List, Plus, Loader2, ClipboardList } from "lucide-react"
import { motion } from "framer-motion"
import { Squares } from "@/components/reactbits/squares"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useTasks } from "@/hooks/use-tasks"
import { useOrgFetch } from "@/hooks/use-organization"
import type { TaskStatus, TaskPriority, CreateTaskInput } from "@/lib/digital-employee/task-types"
import { TaskBoard } from "@/src/features/digital-employees/components/list/task-board"
import { TaskList } from "@/src/features/digital-employees/components/list/task-list"
import { TaskDetailPanel } from "@/src/features/digital-employees/components/list/task-detail-panel"
import { TaskCreateDialog } from "@/src/features/digital-employees/components/list/task-create-dialog"

type ViewMode = "board" | "list"

const PRIORITY_FILTERS: { value: TaskPriority | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
]

interface Employee {
  id: string
  name: string
  avatar: string | null
}

interface Group {
  id: string
  name: string
}

interface TabTasksProps {
  groupId?: string
}

export default function TabTasks({ groupId }: TabTasksProps) {
  const orgFetch = useOrgFetch()
  const { tasks, isLoading, error, createTask, refresh } = useTasks({
    filter: groupId ? { groupId } : undefined,
  })

  const [viewMode, setViewMode] = useState<ViewMode>("board")
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createDefaultStatus, setCreateDefaultStatus] = useState<TaskStatus | undefined>()
  const [search, setSearch] = useState("")
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "ALL">("ALL")

  const [employees, setEmployees] = useState<Employee[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loadingReferences, setLoadingReferences] = useState(false)

  const loadReferences = useCallback(async () => {
    if (employees.length > 0 && groups.length > 0) return
    setLoadingReferences(true)
    try {
      const [employeesRes, groupsRes] = await Promise.all([
        orgFetch("/api/dashboard/digital-employees"),
        orgFetch("/api/dashboard/groups"),
      ])

      if (employeesRes.ok) {
        const employeeData = await employeesRes.json()
        const emps: Employee[] = (Array.isArray(employeeData) ? employeeData : employeeData.employees ?? []).map(
          (e: { id: string; name: string; avatar?: string | null }) => ({
            id: e.id,
            name: e.name,
            avatar: e.avatar ?? null,
          })
        )
        setEmployees(emps)
      }

      if (groupsRes.ok) {
        const groupData = await groupsRes.json()
        const gs: Group[] = (Array.isArray(groupData) ? groupData : groupData.groups ?? []).map(
          (g: { id: string; name: string }) => ({ id: g.id, name: g.name })
        )
        setGroups(gs)
      }
    } catch {
      // keep current defaults
    } finally {
      setLoadingReferences(false)
    }
  }, [employees.length, groups.length, orgFetch])

  const filteredTasks = useMemo(() => {
    let result = tasks
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) => t.title.toLowerCase().includes(q))
    }
    if (priorityFilter !== "ALL") {
      result = result.filter((t) => t.priority === priorityFilter)
    }
    return result
  }, [tasks, search, priorityFilter])

  async function handleCreateTask(status?: TaskStatus) {
    await loadReferences()
    setCreateDefaultStatus(status)
    setShowCreateDialog(true)
  }

  async function handleSubmitCreate(input: CreateTaskInput) {
    const result = await createTask(input)
    await refresh()
    return result
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2.5 p-4 flex-wrap border-b shrink-0">
        {/* Search */}
        <div className="relative max-w-[280px] w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Priority filter pills */}
        <div className="flex items-center gap-1">
          {PRIORITY_FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={priorityFilter === f.value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setPriorityFilter(f.value)}
            >
              {f.value !== "ALL" && (
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full mr-1.5 shrink-0",
                    f.value === "HIGH" && "bg-red-500",
                    f.value === "MEDIUM" && "bg-amber-500",
                    f.value === "LOW" && "bg-blue-500"
                  )}
                />
              )}
              {f.label}
            </Button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 border rounded-md p-0.5">
          <Button
            variant={viewMode === "board" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode("board")}
            title="Board view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* New Task */}
        <Button
          size="sm"
          className="h-8 text-xs ml-auto shrink-0"
          onClick={() => void handleCreateTask()}
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
          <motion.div
            className="relative flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 24 }}
          >
            <Squares
              speed={0.3}
              squareSize={48}
              borderColor="rgba(127,127,127,0.08)"
              hoverFillColor="rgba(127,127,127,0.04)"
              direction="diagonal"
            />
            <div className="relative z-10">
              <div className="rounded-full bg-muted p-4 mb-4 mx-auto w-fit">
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium mb-1">No tasks yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Create your first task to start tracking work for your digital employees.
              </p>
              <Button
                size="sm"
                onClick={() => void handleCreateTask()}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New Task
              </Button>
            </div>
          </motion.div>
        ) : viewMode === "board" ? (
          <TaskBoard
            tasks={filteredTasks}
            onSelectTask={(id) => setSelectedTaskId(id)}
            onCreateTask={(status) => void handleCreateTask(status)}
          />
        ) : (
          <TaskList
            tasks={filteredTasks}
            onSelectTask={(id) => setSelectedTaskId(id)}
            onCreateTask={(status) => void handleCreateTask(status)}
          />
        )}
      </div>

      {/* Task Detail Panel */}
      <TaskDetailPanel
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdated={refresh}
        employees={employees}
        groups={groups}
      />

      {/* Create Dialog */}
      <TaskCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleSubmitCreate}
        defaultStatus={createDefaultStatus}
        defaultGroupId={groupId}
        employees={employees}
        groups={groups}
      />
      {loadingReferences && (
        <div className="sr-only" aria-live="polite">
          Loading task references...
        </div>
      )}
    </div>
  )
}
