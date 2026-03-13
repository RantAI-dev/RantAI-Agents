"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Plus,
  Loader2,
  Search,
  Trash2,
  Users,
  Play,
  Pause,
  Rocket,
  Network,
  Clock,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useEmployeeGroups } from "@/hooks/use-employee-groups"
import type { EmployeeGroup } from "@/hooks/use-employee-groups"
import { BlurText } from "@/components/reactbits/blur-text"
import { CountUp } from "@/components/reactbits/count-up"
import { SpotlightCard } from "@/components/reactbits/spotlight-card"
import { Squares } from "@/components/reactbits/squares"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

const GROUP_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  IDLE: { label: "Idle", className: "bg-muted text-muted-foreground" },
  ACTIVE: { label: "Active", className: "bg-blue-500/10 text-blue-500" },
  RUNNING: { label: "Running", className: "bg-emerald-500/10 text-emerald-500" },
  DEPLOYING: { label: "Deploying", className: "bg-amber-500/10 text-amber-500" },
  ERROR: { label: "Error", className: "bg-red-500/10 text-red-500" },
}

const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 24 },
  },
}

export default function GroupsPage() {
  const router = useRouter()
  const {
    groups,
    isLoading,
    createGroup,
    deleteGroup,
    deployGroup,
    startGroup,
    stopGroup,
  } = useEmployeeGroups()

  const [search, setSearch] = useState("")
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const stats = useMemo(() => {
    const total = groups.length
    const active = groups.filter((g) => g.status === "ACTIVE" || g.status === "RUNNING").length
    const idle = groups.filter((g) => g.status === "IDLE").length
    return { total, active, idle }
  }, [groups])

  const filtered = useMemo(() => {
    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q))
    )
  }, [groups, search])

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const group = await createGroup(newName.trim(), newDescription.trim() || undefined)
      if (group) {
        toast.success("Team created")
        setNewName("")
        setNewDescription("")
        setShowCreateForm(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create team")
    } finally {
      setCreating(false)
    }
  }, [newName, newDescription, createGroup])

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!confirm("Delete this team? Members will be unassigned.")) return
      try {
        await deleteGroup(id)
        toast.success("Team deleted")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete team")
      }
    },
    [deleteGroup]
  )

  const handleDeploy = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setActionLoading(id)
      try {
        await deployGroup(id)
        toast.success("Deployment started")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Deploy failed")
      } finally {
        setActionLoading(null)
      }
    },
    [deployGroup]
  )

  const handleStart = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setActionLoading(id)
      try {
        await startGroup(id)
        toast.success("Team started")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Start failed")
      } finally {
        setActionLoading(null)
      }
    },
    [startGroup]
  )

  const handleStop = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setActionLoading(id)
      try {
        await stopGroup(id)
        toast.success("Team stopped")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Stop failed")
      } finally {
        setActionLoading(null)
      }
    },
    [stopGroup]
  )

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <motion.div
        className="px-6 pt-6 pb-4 space-y-3"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <motion.div variants={fadeUp}>
          <BlurText
            text="Teams"
            className="text-3xl font-bold tracking-tight"
            delay={40}
          />
        </motion.div>
        <motion.p
          className="text-sm text-muted-foreground"
          variants={fadeUp}
        >
          Organize digital employees into collaborative teams
        </motion.p>
        {groups.length > 0 && (
          <motion.div
            className="flex items-center gap-4 text-sm text-muted-foreground"
            variants={fadeUp}
          >
            <span className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" />
              <CountUp to={stats.total} duration={1.2} />
              <span>teams</span>
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1.5">
              <Rocket className="h-3.5 w-3.5" />
              <CountUp to={stats.active} duration={1.2} />
              <span>active</span>
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <CountUp to={stats.idle} duration={1.2} />
              <span>idle</span>
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {/* Search & Create Bar */}
        <motion.div
          className="flex items-center gap-3 mb-6 flex-wrap"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 24 }}
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            onClick={() => setShowCreateForm((v) => !v)}
            size="sm"
            className="h-8 text-xs shrink-0 ml-auto"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create Team
          </Button>
        </motion.div>

        {/* Inline Create Form */}
        {showCreateForm && (
          <motion.div
            className="mb-6 rounded-lg border bg-card p-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <h3 className="text-sm font-medium mb-3">New Team</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Team name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                  if (e.key === "Escape") setShowCreateForm(false)
                }}
              />
              <Input
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                  if (e.key === "Escape") setShowCreateForm(false)
                }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-9"
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewName("")
                    setNewDescription("")
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {groups.length === 0 ? (
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
                onClick={() => setShowCreateForm(true)}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Team
              </Button>
            </div>
          </motion.div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">No matching teams</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search criteria
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearch("")}
            >
              Clear Search
            </Button>
          </div>
        ) : (
          /* Team Cards Grid */
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.06, delayChildren: 0.35 } },
            }}
          >
            {filtered.map((group) => {
              const statusStyle = GROUP_STATUS_STYLES[group.status] || GROUP_STATUS_STYLES.IDLE
              const isActionLoading = actionLoading === group.id

              return (
                <motion.div key={group.id} variants={fadeUp}>
                  <SpotlightCard
                    className="group h-[200px] rounded-lg border bg-card cursor-pointer transition-all hover:border-foreground/30 hover:shadow-sm"
                    spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
                    onClick={() => router.push(`/dashboard/groups/${group.id}`)}
                  >
                    <div className="flex flex-col h-full p-4">
                      {/* Top: name + status */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="rounded-md bg-muted p-1.5 shrink-0">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <h3 className="text-sm font-medium truncate">{group.name}</h3>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] px-1.5 py-0.5 shrink-0", statusStyle.className)}
                        >
                          {statusStyle.label}
                        </Badge>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-muted-foreground/60 leading-relaxed line-clamp-2 flex-1 mt-1">
                        {group.description || "No description"}
                      </p>

                      {/* Members */}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex -space-x-1.5">
                          {group.members.slice(0, 5).map((member) => (
                            <div
                              key={member.id}
                              className="h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center"
                              title={member.name}
                            >
                              <span className="text-[9px] font-medium text-muted-foreground">
                                {member.name
                                  .split(" ")
                                  .map((w) => w[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                            </div>
                          ))}
                          {group.memberCount > 5 && (
                            <div className="h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                              <span className="text-[9px] font-medium text-muted-foreground">
                                +{group.memberCount - 5}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground/70">
                          {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Bottom: actions + timestamp */}
                      <div className="mt-auto pt-2.5 border-t border-border/40 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground/50">
                          {formatDistanceToNow(new Date(group.updatedAt), { addSuffix: true })}
                        </span>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {group.status === "IDLE" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2"
                              disabled={isActionLoading}
                              onClick={(e) => handleDeploy(group.id, e)}
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Rocket className="h-3 w-3 mr-1" />
                                  Deploy
                                </>
                              )}
                            </Button>
                          )}
                          {group.status === "ACTIVE" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2"
                              disabled={isActionLoading}
                              onClick={(e) => handleStart(group.id, e)}
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Play className="h-3 w-3 mr-1" />
                                  Start
                                </>
                              )}
                            </Button>
                          )}
                          {group.status === "RUNNING" && group.containerId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2"
                              disabled={isActionLoading}
                              onClick={(e) => handleStop(group.id, e)}
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Pause className="h-3 w-3 mr-1" />
                                  Stop
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDelete(group.id, e)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </SpotlightCard>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </div>
  )
}
