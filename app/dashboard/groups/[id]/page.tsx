"use client"

import { useState, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  Users,
  Plus,
  Trash2,
  Play,
  Pause,
  Loader2,
  Bot,
  Rocket,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { useEmployeeGroups } from "@/hooks/use-employee-groups"
import { useDigitalEmployees } from "@/hooks/use-digital-employees"
import TabTasks from "@/app/dashboard/digital-employees/_components/tab-tasks"

// ─── Status styles ──────────────────────────────────────────

const GROUP_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  IDLE: { label: "Idle", className: "bg-muted text-muted-foreground" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-500" },
  STOPPING: { label: "Stopping", className: "bg-amber-500/10 text-amber-500" },
  DEPLOYING: { label: "Deploying", className: "bg-blue-500/10 text-blue-500" },
}

const MEMBER_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-500" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-500" },
  SUSPENDED: { label: "Suspended", className: "bg-amber-500/10 text-amber-500" },
  ARCHIVED: { label: "Archived", className: "bg-muted text-muted-foreground" },
}

// ─── Page Component ─────────────────────────────────────────

export default function GroupDetailPage() {
  const params = useParams()
  const router = useRouter()
  const groupId = params.id as string

  const {
    groups,
    isLoading: groupsLoading,
    updateGroup,
    addMembers,
    removeMembers,
    deployGroup,
    startGroup,
    stopGroup,
  } = useEmployeeGroups()

  const { employees, isLoading: employeesLoading } = useDigitalEmployees()

  const group = useMemo(
    () => groups.find((g) => g.id === groupId) ?? null,
    [groups, groupId]
  )

  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState("")
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editDescription, setEditDescription] = useState("")

  // Add member state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)

  // Available employees (not in any group)
  const availableEmployees = useMemo(
    () => employees.filter((e) => !group?.members.some((m) => m.id === e.id)),
    [employees, group?.members]
  )

  // ─── Handlers ─────────────────────────────────────────────

  const handleSaveName = useCallback(async () => {
    if (!editName.trim() || !group) return
    try {
      await updateGroup(group.id, { name: editName.trim() })
      toast.success("Group name updated")
      setIsEditingName(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update name")
    }
  }, [editName, group, updateGroup])

  const handleSaveDescription = useCallback(async () => {
    if (!group) return
    try {
      await updateGroup(group.id, { description: editDescription.trim() || undefined })
      toast.success("Description updated")
      setIsEditingDescription(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update description")
    }
  }, [editDescription, group, updateGroup])

  const handleAddMember = useCallback(async () => {
    if (!selectedEmployeeId || !group) return
    setIsAddingMember(true)
    try {
      await addMembers(group.id, [selectedEmployeeId])
      if (group.isImplicit) {
        await updateGroup(group.id, { isImplicit: false })
      }
      toast.success("Member added")
      setSelectedEmployeeId("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setIsAddingMember(false)
    }
  }, [selectedEmployeeId, group, addMembers, updateGroup])

  const handleRemoveMember = useCallback(
    async (employeeId: string) => {
      if (!group) return
      try {
        await removeMembers(group.id, [employeeId])
        toast.success("Member removed")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove member")
      }
    },
    [group, removeMembers]
  )

  const handleDeploy = useCallback(async () => {
    if (!group) return
    setIsActionLoading(true)
    try {
      await deployGroup(group.id)
      toast.success("Group deployed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deploy")
    } finally {
      setIsActionLoading(false)
    }
  }, [group, deployGroup])

  const handleStart = useCallback(async () => {
    if (!group) return
    setIsActionLoading(true)
    try {
      await startGroup(group.id)
      toast.success("Group started")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start")
    } finally {
      setIsActionLoading(false)
    }
  }, [group, startGroup])

  const handleStop = useCallback(async () => {
    if (!group) return
    setIsActionLoading(true)
    try {
      await stopGroup(group.id)
      toast.success("Group stopped")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop")
    } finally {
      setIsActionLoading(false)
    }
  }, [group, stopGroup])

  // ─── Loading ──────────────────────────────────────────────

  const isLoading = groupsLoading || employeesLoading

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h3 className="text-sm font-medium mb-1">Team not found</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/dashboard/groups")}
            >
              Back to Teams
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Derived state ───────────────────────────────────────

  const statusStyle =
    GROUP_STATUS_STYLES[group.status] || GROUP_STATUS_STYLES.IDLE

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/dashboard/groups")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 text-sm font-semibold w-48"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName()
                      if (e.key === "Escape") setIsEditingName(false)
                    }}
                  />
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleSaveName}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setIsEditingName(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <h1
                  className="text-sm font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                  onClick={() => {
                    setEditName(group.name)
                    setIsEditingName(true)
                  }}
                >
                  {group.name}
                </h1>
              )}
              <Badge
                variant="secondary"
                className={cn("text-[10px] px-1.5 py-0", statusStyle.className)}
              >
                {statusStyle.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {group.members.length} member{group.members.length !== 1 ? "s" : ""}
              <span className="mx-1.5 text-border">|</span>
              Created {formatDistanceToNow(new Date(group.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {group.status === "IDLE" && (
            <Button size="sm" onClick={handleDeploy} disabled={isActionLoading}>
              {isActionLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Rocket className="h-3.5 w-3.5 mr-1.5" />
              )}
              Deploy
            </Button>
          )}
          {group.status === "IDLE" && (
            <Button size="sm" onClick={handleStart} disabled={isActionLoading}>
              {isActionLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              Start
            </Button>
          )}
          {group.status === "ACTIVE" && (
            <Button size="sm" variant="outline" onClick={handleStop} disabled={isActionLoading}>
              {isActionLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Pause className="h-3.5 w-3.5 mr-1.5" />
              )}
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* ─── Body ─── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-8">
          {/* ─── Description ─── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Description
            </h2>
            {isEditingDescription ? (
              <div className="flex items-start gap-2">
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add a description..."
                  className="text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveDescription()
                    if (e.key === "Escape") setIsEditingDescription(false)
                  }}
                />
                <Button size="sm" variant="ghost" className="text-xs" onClick={handleSaveDescription}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setIsEditingDescription(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <p
                className={cn(
                  "text-sm cursor-pointer hover:text-primary transition-colors",
                  group.description ? "text-foreground" : "text-muted-foreground italic"
                )}
                onClick={() => {
                  setEditDescription(group.description || "")
                  setIsEditingDescription(true)
                }}
              >
                {group.description || "Click to add a description..."}
              </p>
            )}
          </motion.section>

          {/* ─── Members ─── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Members ({group.members.length})
              </h2>
            </div>

            {/* Member list */}
            {group.members.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg">
                <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No members yet. Add digital employees to this team.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {group.members.map((member) => {
                  const memberStatus =
                    MEMBER_STATUS_STYLES[member.status] || MEMBER_STATUS_STYLES.DRAFT
                  return (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted shrink-0">
                          {member.avatar ? (
                            <span className="text-base">{member.avatar}</span>
                          ) : (
                            <Bot className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{member.name}</p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] px-1.5 py-0 shrink-0", memberStatus.className)}
                        >
                          {memberStatus.label}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/* Add member */}
            <div className="mt-4 flex items-center gap-2">
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className={cn(
                  "flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
                disabled={availableEmployees.length === 0}
              >
                <option value="">
                  {availableEmployees.length === 0
                    ? "No available employees"
                    : "Select an employee to add..."}
                </option>
                {availableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleAddMember}
                disabled={!selectedEmployeeId || isAddingMember}
              >
                {isAddingMember ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                )}
                Add
              </Button>
            </div>
          </motion.section>

          {/* ─── Tasks ─── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <h2 className="text-lg font-semibold mb-4">Tasks</h2>
            <TabTasks groupId={groupId} />
          </motion.section>
        </div>
      </div>
    </div>
  )
}
