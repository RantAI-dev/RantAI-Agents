"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
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
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { useEmployeeGroups, type EmployeeGroupItem } from "@/hooks/use-employee-groups"
import TabTasks from "@/src/features/digital-employees/components/list/tab-tasks"

// ─── Status styles ──────────────────────────────────────────

const GROUP_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  IDLE: { label: "Idle", className: "bg-muted text-muted-foreground" },
  RUNNING: { label: "Running", className: "bg-emerald-500/10 text-emerald-500" },
}

const MEMBER_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-500" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-500" },
  SUSPENDED: { label: "Suspended", className: "bg-amber-500/10 text-amber-500" },
  ARCHIVED: { label: "Archived", className: "bg-muted text-muted-foreground" },
}

// ─── Page Component ─────────────────────────────────────────

export default function GroupDetailPage({
  groupId,
  initialGroups,
}: {
  groupId: string
  initialGroups: EmployeeGroupItem[]
}) {
  const router = useRouter()

  const {
    groups,
    isLoading: groupsLoading,
    updateGroup,
    removeMembers,
    startGroup,
    stopGroup,
    deleteGroup,
  } = useEmployeeGroups({ initialGroups })

  const group = useMemo(
    () => groups.find((g) => g.id === groupId) ?? null,
    [groups, groupId]
  )

  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState("")
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editDescription, setEditDescription] = useState("")

  const [isActionLoading, setIsActionLoading] = useState(false)

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

  const handleDelete = useCallback(async () => {
    if (!group) return
    setIsActionLoading(true)
    try {
      await deleteGroup(group.id)
      toast.success("Team deleted permanently")
      router.push("/dashboard/digital-employees")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete team")
    } finally {
      setIsActionLoading(false)
    }
  }, [group, deleteGroup, router])

  // ─── Loading ──────────────────────────────────────────────

  const isLoading = groupsLoading

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
              onClick={() => router.push("/dashboard/digital-employees")}
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
            onClick={() => router.push("/dashboard/digital-employees")}
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
            <Button size="sm" onClick={handleStart} disabled={isActionLoading}>
              {isActionLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              Start
            </Button>
          )}
          {group.status === "RUNNING" && (
            <Button size="sm" variant="outline" onClick={handleStop} disabled={isActionLoading}>
              {isActionLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Pause className="h-3.5 w-3.5 mr-1.5" />
              )}
              Stop
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={isActionLoading}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete team permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the team &quot;{group.name}&quot;.
                  {group.status === "RUNNING" && (
                    <span className="block mt-2 text-amber-500 font-medium">
                      The running container will be stopped automatically.
                    </span>
                  )}
                  {group.members.length > 0 && (
                    <span className="block mt-2 text-destructive font-medium">
                      This team has {group.members.length} member{group.members.length !== 1 ? "s" : ""}. Remove all members before deleting.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={group.members.length > 0}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ─── Body ─── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-8">
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
            <div className="mt-4">
              <Button
                size="sm"
                onClick={() => router.push(`/dashboard/digital-employees/new?groupId=${groupId}`)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create Employee for this Team
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
