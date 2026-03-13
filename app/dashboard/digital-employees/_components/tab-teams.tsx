"use client"

import { useState, useMemo } from "react"
import { Search, Plus, Loader2, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useEmployeeGroups } from "@/hooks/use-employee-groups"
import { useTasks } from "@/hooks/use-tasks"
import { TeamCard } from "@/app/dashboard/digital-employees/_components/team-card"
import { toast } from "sonner"

export default function TabTeams() {
  const router = useRouter()
  const { groups, isLoading: groupsLoading, error: groupsError, refresh } = useEmployeeGroups()
  const { tasks } = useTasks()

  const [search, setSearch] = useState("")

  // Compute task counts per group from tasks array
  const taskCountsByGroup = useMemo(() => {
    const map = new Map<
      string,
      { todo: number; inProgress: number; inReview: number; done: number; total: number }
    >()

    for (const task of tasks) {
      if (!task.group_id || task.parent_task_id) continue
      if (!map.has(task.group_id)) {
        map.set(task.group_id, { todo: 0, inProgress: 0, inReview: 0, done: 0, total: 0 })
      }
      const counts = map.get(task.group_id)!
      counts.total++
      switch (task.status) {
        case "TODO":
          counts.todo++
          break
        case "IN_PROGRESS":
          counts.inProgress++
          break
        case "IN_REVIEW":
          counts.inReview++
          break
        case "DONE":
          counts.done++
          break
      }
    }

    return map
  }, [tasks])

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q))
    )
  }, [groups, search])

  function handleManage(groupId: string) {
    // Navigate to groups page if it exists, otherwise show toast
    try {
      router.push(`/dashboard/groups/${groupId}`)
    } catch {
      toast.info("Group management page coming soon")
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2.5 p-4 border-b shrink-0">
        <div className="relative max-w-[280px] w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Button
          size="sm"
          className="h-8 text-xs ml-auto shrink-0"
          onClick={() => toast.info("Create team feature coming soon")}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Team
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {groupsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groupsError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-destructive mb-3">{groupsError}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4 mx-auto w-fit">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            {search.trim() ? (
              <>
                <h3 className="text-sm font-medium mb-1">No teams found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Try adjusting your search query
                </p>
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-medium mb-1">No teams yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a team to organize your digital employees
                </p>
                <Button
                  size="sm"
                  onClick={() => toast.info("Create team feature coming soon")}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create Team
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredGroups.map((group) => (
              <TeamCard
                key={group.id}
                group={group}
                taskCounts={taskCountsByGroup.get(group.id)}
                onManage={() => handleManage(group.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
