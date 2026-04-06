"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import {
  Plus,
  Bot,
  Loader2,
  Search,
  Play,
  Rocket,
  Users,
  Pause,
  Shield,
  Eye,
  Zap,
  LayoutGrid,
  List,
  AlertTriangle,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useDigitalEmployees, type DigitalEmployeeItem } from "@/hooks/use-digital-employees"
import { useTasks } from "@/hooks/use-tasks"
import type { EnrichedTask } from "@/lib/digital-employee/task-types"
import TabTasks from "@/features/digital-employees/components/list/tab-tasks"
import TabTeams from "@/features/digital-employees/components/list/tab-teams"
import { BlurText } from "@/components/reactbits/blur-text"
import { CountUp } from "@/components/reactbits/count-up"
import { SpotlightCard } from "@/components/reactbits/spotlight-card"
import { Squares } from "@/components/reactbits/squares"
import { formatDistanceToNow } from "date-fns"
import { STATUS_STYLES, AUTONOMY_STYLES } from "@/lib/digital-employee/shared-constants"
import { toast } from "sonner"

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
]

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

function getActivityText(emp: { status: string; lastActiveAt: string | null; latestRunStatus: string | null; pendingApprovalCount: number }): string {
  if (emp.pendingApprovalCount > 0) return "Awaiting approval"
  if (emp.latestRunStatus === "RUNNING") return "Running..."
  if (emp.status === "PAUSED" || emp.status === "SUSPENDED") return "Inactive"
  if (emp.status === "DRAFT" || emp.status === "ONBOARDING") return "Not deployed"
  if (emp.status === "ARCHIVED") return "Archived"
  if (emp.lastActiveAt) {
    return `Idle ${formatDistanceToNow(new Date(emp.lastActiveAt))}`
  }
  return "Idle"
}

export default function DigitalEmployeesPage({
  initialEmployees,
  initialTasks,
}: {
  initialEmployees: DigitalEmployeeItem[]
  initialTasks: EnrichedTask[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { employees, isLoading } = useDigitalEmployees({ initialEmployees })
  const { openCount } = useTasks({ initialTasks })

  const activeTab = searchParams.get("tab") || "employees"
  const setTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", tab)
      router.push(`/dashboard/digital-employees?${params.toString()}`)
    },
    [router, searchParams]
  )

  const tabs = [
    { key: "employees", label: "Employees" },
    { key: "teams", label: "Teams" },
    { key: "tasks", label: "Tasks" },
  ]

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  const isInactive = (s: string) => s === "PAUSED" || s === "SUSPENDED"

  const stats = useMemo(() => {
    const total = employees.length
    const active = employees.filter((e) => e.status === "ACTIVE").length
    const inactive = employees.filter((e) => isInactive(e.status)).length
    return { total, active, inactive }
  }, [employees])

  const filtered = useMemo(() => {
    let result = [...employees]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.description && e.description.toLowerCase().includes(q)) ||
          e.assistant.name.toLowerCase().includes(q)
      )
    }
    if (statusFilter === "INACTIVE") {
      result = result.filter((e) => isInactive(e.status))
    } else if (statusFilter === "DRAFT") {
      result = result.filter((e) => e.status === "DRAFT" || e.status === "ONBOARDING")
    } else if (statusFilter !== "ALL") {
      result = result.filter((e) => e.status === statusFilter)
    }
    return result
  }, [employees, search, statusFilter])

  const handleQuickRun = useCallback(async (empId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${empId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Run failed")
      }
      toast.success("Run triggered")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to trigger run")
    }
  }, [])

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
      {/* Animated Header */}
      <motion.div
        className="px-6 pt-6 pb-4 space-y-3"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <motion.div variants={fadeUp}>
          <BlurText
            text="Digital Employees"
            className="text-3xl font-bold tracking-tight"
            delay={40}
          />
        </motion.div>
        <motion.p
          className="text-sm text-muted-foreground"
          variants={fadeUp}
        >
          Autonomous AI workers powered by RantAI Claw
        </motion.p>
        {employees.length > 0 && (
          <motion.div
            className="flex items-center gap-4 text-sm text-muted-foreground"
            variants={fadeUp}
          >
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              <CountUp to={stats.total} duration={1.2} />
              <span>employees</span>
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1.5">
              <Rocket className="h-3.5 w-3.5" />
              <CountUp to={stats.active} duration={1.2} />
              <span>active</span>
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1.5">
              <Pause className="h-3.5 w-3.5" />
              <CountUp to={stats.inactive} duration={1.2} />
              <span>inactive</span>
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Tab Bar */}
      <div className="flex gap-0 border-b border-border px-6 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={cn(
              "px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.key === "tasks" && openCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold h-4 min-w-[16px] px-1">
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {activeTab === "tasks" && <TabTasks />}
        {activeTab === "teams" && <TabTeams />}
        {activeTab === "employees" && <>
        {/* Search & Filter Bar */}
        <motion.div
          className="flex items-center gap-3 mb-6 flex-wrap"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 24 }}
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((sf) => (
              <Button
                key={sf.value}
                variant={statusFilter === sf.value ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs px-2.5"
                onClick={() => setStatusFilter(sf.value)}
              >
                {sf.label}
                {sf.value !== "ALL" && (
                  <span className="ml-1 text-muted-foreground">
                    {sf.value === "INACTIVE"
                      ? employees.filter((e) => isInactive(e.status)).length
                      : sf.value === "DRAFT"
                        ? employees.filter((e) => e.status === "DRAFT" || e.status === "ONBOARDING").length
                        : employees.filter((e) => e.status === sf.value).length}
                  </span>
                )}
              </Button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 border rounded-md p-0.5">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMode("table")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            onClick={() => router.push("/dashboard/digital-employees/new")}
            size="sm"
            className="h-8 text-xs shrink-0 ml-auto"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Employee
          </Button>
        </motion.div>

        {employees.length === 0 ? (
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
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium mb-1">No digital employees yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Create your first digital employee to start automating tasks with autonomous AI workers.
              </p>
              <Button
                onClick={() => router.push("/dashboard/digital-employees/new")}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Employee
              </Button>
            </div>
          </motion.div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">No matching employees</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search or filter criteria
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("")
                setStatusFilter("ALL")
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          /* ─── Grid View ─── */
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.06, delayChildren: 0.35 } },
            }}
          >
            {filtered.map((emp) => {
              const status = STATUS_STYLES[emp.status] || STATUS_STYLES.DRAFT
              const autonomy = AUTONOMY_STYLES[emp.autonomyLevel] || AUTONOMY_STYLES.supervised
              const successRate =
                emp.totalRuns > 0
                  ? Math.round((emp.successfulRuns / emp.totalRuns) * 100)
                  : 0
              const activityText = getActivityText(emp)

              return (
                <motion.div key={emp.id} variants={fadeUp}>
                  <SpotlightCard
                    className="group h-[190px] rounded-lg border bg-card cursor-pointer transition-all hover:border-foreground/30 hover:shadow-sm"
                    spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
                    onClick={() => router.push(`/dashboard/digital-employees/${emp.id}`)}
                  >
                    <div className="flex flex-col h-full p-4">
                      {/* Top: name + avatar */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg shrink-0">{emp.avatar || "🤖"}</span>
                          <h3 className="text-sm font-medium truncate">{emp.name}</h3>
                        </div>
                        {emp.pendingApprovalCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0 shrink-0"
                          >
                            <AlertTriangle className="h-3 w-3 mr-0.5" />
                            {emp.pendingApprovalCount}
                          </Badge>
                        )}
                      </div>

                      {/* Activity text */}
                      <p className="text-xs text-muted-foreground/80 mb-0.5">{activityText}</p>

                      {/* Last output preview */}
                      {emp.latestOutputPreview && (
                        <p className="text-[11px] text-muted-foreground/50 truncate mb-0.5 italic">
                          {emp.latestOutputPreview}
                        </p>
                      )}

                      {/* Description */}
                      <p className="text-xs text-muted-foreground/60 leading-relaxed line-clamp-2 flex-1">
                        {emp.description || (
                          <span className="flex items-center gap-1">
                            <span>{emp.assistant.emoji}</span>
                            <span>{emp.assistant.name}</span>
                          </span>
                        )}
                      </p>

                      {/* Bottom: badges + stats */}
                      <div className="mt-auto pt-2.5 border-t border-border/40 space-y-2">
                        <div className="flex items-center gap-2 h-5">
                          <Badge
                            variant="secondary"
                            className={cn("text-[10px] px-1.5 py-0.5 shrink-0", status.className)}
                          >
                            {status.label}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={cn("text-[10px] px-1.5 py-0.5 shrink-0", autonomy.className)}
                          >
                            {autonomy.label}
                          </Badge>
                          {emp.group && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0.5 shrink-0 bg-muted"
                            >
                              {emp.group.name}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                          <span className="flex items-center gap-1">
                            <Play className="h-3 w-3" />
                            {emp.totalRuns} runs
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {successRate}% success
                          </span>
                          {emp.status === "ACTIVE" && (
                            <button
                              className="flex items-center gap-1 ml-auto text-primary hover:text-primary/80 transition-colors"
                              onClick={(e) => handleQuickRun(emp.id, e)}
                            >
                              <Zap className="h-3 w-3" />
                              Run
                            </button>
                          )}
                          {emp.status !== "ACTIVE" && (
                            <span className="flex items-center gap-1 ml-auto">
                              <Shield className="h-3 w-3" />
                              {emp.assistant.emoji} {emp.assistant.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </SpotlightCard>
                </motion.div>
              )
            })}
          </motion.div>
        ) : (
          /* ─── Table View ─── */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Team</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Activity</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Runs</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Pending</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp) => {
                    const status = STATUS_STYLES[emp.status] || STATUS_STYLES.DRAFT
                    const activityText = getActivityText(emp)
                    return (
                      <tr
                        key={emp.id}
                        className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => router.push(`/dashboard/digital-employees/${emp.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{emp.avatar || "🤖"}</span>
                            <div className="min-w-0">
                              <span className="font-medium truncate block">{emp.name}</span>
                              <span className="text-xs text-muted-foreground truncate block">
                                {emp.assistant.emoji} {emp.assistant.name}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="secondary"
                            className={cn("text-[10px] px-1.5 py-0.5", status.className)}
                          >
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {emp.group ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0.5 bg-muted"
                            >
                              {emp.group.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{activityText}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{emp.totalRuns}</td>
                        <td className="px-4 py-3 text-right">
                          {emp.pendingApprovalCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className="bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0"
                            >
                              {emp.pendingApprovalCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {emp.status === "ACTIVE" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={(e) => handleQuickRun(emp.id, e)}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              Run
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        </>}
      </div>
    </div>
  )
}
