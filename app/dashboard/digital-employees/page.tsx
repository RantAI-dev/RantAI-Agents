"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Plus,
  Bot,
  Loader2,
  Search,
  Play,
  Clock,
  Rocket,
  Users,
  Pause,
  Shield,
  Eye,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useDigitalEmployees } from "@/hooks/use-digital-employees"
import { BlurText } from "@/components/reactbits/blur-text"
import { CountUp } from "@/components/reactbits/count-up"
import { SpotlightCard } from "@/components/reactbits/spotlight-card"
import { Squares } from "@/components/reactbits/squares"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ONBOARDING: { label: "Onboarding", className: "bg-sky-500/10 text-sky-500" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-500" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-500" },
  SUSPENDED: { label: "Suspended", className: "bg-red-500/10 text-red-500" },
  ARCHIVED: { label: "Archived", className: "bg-muted text-muted-foreground" },
}

const AUTONOMY_STYLES: Record<string, { label: string; className: string }> = {
  supervised: { label: "Supervised", className: "bg-blue-500/10 text-blue-500" },
  autonomous: { label: "Autonomous", className: "bg-purple-500/10 text-purple-500" },
}

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "SUSPENDED", label: "Suspended" },
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

export default function DigitalEmployeesPage() {
  const router = useRouter()
  const { employees, isLoading } = useDigitalEmployees()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")

  const stats = useMemo(() => {
    const total = employees.length
    const active = employees.filter((e) => e.status === "ACTIVE").length
    const paused = employees.filter((e) => e.status === "PAUSED").length
    return { total, active, paused }
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
    if (statusFilter !== "ALL") {
      result = result.filter((e) => e.status === statusFilter)
    }
    return result
  }, [employees, search, statusFilter])

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
          Manage your autonomous AI workers
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
              <CountUp to={stats.paused} duration={1.2} />
              <span>paused</span>
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
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
                    {employees.filter((e) => e.status === sf.value).length}
                  </span>
                )}
              </Button>
            ))}
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
        ) : (
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

              return (
                <motion.div key={emp.id} variants={fadeUp}>
                  <SpotlightCard
                    className="group h-[172px] rounded-lg border bg-card cursor-pointer transition-all hover:border-foreground/30 hover:shadow-sm"
                    spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
                    onClick={() => router.push(`/dashboard/digital-employees/${emp.id}`)}
                  >
                    <div className="flex flex-col h-full p-4">
                      {/* Top: name + avatar */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg shrink-0">{emp.avatar || "🤖"}</span>
                          <h3 className="text-sm font-medium truncate">{emp.name}</h3>
                        </div>
                      </div>

                      {/* Middle: assistant info */}
                      <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2 flex-1">
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
                          <span className="flex items-center gap-1 ml-auto">
                            <Shield className="h-3 w-3" />
                            {emp.assistant.emoji} {emp.assistant.name}
                          </span>
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
