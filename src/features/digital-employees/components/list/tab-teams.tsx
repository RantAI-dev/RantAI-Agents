"use client"

import { useState, useMemo } from "react"
import { Search, Plus, Loader2, Users } from "lucide-react"
import { motion } from "framer-motion"
import { Squares } from "@/components/reactbits/squares"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useEmployeeGroups } from "@/hooks/use-employee-groups"
import { useTasks } from "@/hooks/use-tasks"
import { TeamCard } from "@/src/features/digital-employees/components/list/team-card"
import { toast } from "sonner"

export default function TabTeams() {
  const router = useRouter()
  const { groups, isLoading: groupsLoading, error: groupsError, refresh, createGroup, startGroup, stopGroup } = useEmployeeGroups()
  const { tasks } = useTasks()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | "RUNNING" | "IDLE">("ALL")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newTeamName, setNewTeamName] = useState("")
  const [newTeamDesc, setNewTeamDesc] = useState("")
  const [creating, setCreating] = useState(false)

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

  const filtered = useMemo(() => {
    let result = [...groups]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(g => g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q))
    }
    if (statusFilter !== "ALL") {
      result = result.filter(g => g.status === statusFilter)
    }
    return result
  }, [groups, search, statusFilter])

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return
    setCreating(true)
    try {
      await createGroup({ name: newTeamName.trim(), description: newTeamDesc.trim() || undefined })
      toast.success("Team created")
      setShowCreateDialog(false)
      setNewTeamName("")
      setNewTeamDesc("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create team")
    } finally {
      setCreating(false)
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

        <div className="flex items-center gap-1">
          {(["ALL", "RUNNING", "IDLE"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => setStatusFilter(s)}
            >
              {s === "ALL" ? "All" : s === "RUNNING" ? "Running" : "Idle"}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          className="h-8 text-xs ml-auto shrink-0"
          onClick={() => setShowCreateDialog(true)}
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
        ) : filtered.length === 0 ? (
          search.trim() || statusFilter !== "ALL" ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-3 mb-4">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium mb-1">No teams found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Try adjusting your search query or filter
              </p>
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("ALL") }}>
                Clear filters
              </Button>
            </div>
          ) : (
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
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium mb-1">No teams yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  Create a team to organize your digital employees into collaborative groups.
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create Team
                </Button>
              </div>
            </motion.div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((group) => (
              <TeamCard
                key={group.id}
                group={group}
                taskCounts={taskCountsByGroup.get(group.id)}
                onManage={() => router.push(`/dashboard/groups/${group.id}`)}
                onStart={() => startGroup(group.id).catch(e => toast.error(e.message))}
                onStop={() => stopGroup(group.id).catch(e => toast.error(e.message))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Team Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Create a new team to organize your digital employees.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                placeholder="e.g. Customer Support"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTeam()
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-desc">Description (optional)</Label>
              <Input
                id="team-desc"
                placeholder="What does this team do?"
                value={newTeamDesc}
                onChange={(e) => setNewTeamDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTeam()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={creating || !newTeamName.trim()}>
              {creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
