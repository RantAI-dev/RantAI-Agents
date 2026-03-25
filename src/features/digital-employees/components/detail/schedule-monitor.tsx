"use client"

import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  Heart,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  Zap,
} from "@/lib/icons"
import {
  describeCron,
  dateKey,
  getCronOccurrencesForMonth,
  getCronOccurrencesForWeek,
  parseCronField,
} from "@/lib/digital-employee/cron-utils"
import type {
  EmployeeSchedule,
  HeartbeatConfig,
} from "@/lib/digital-employee/types"
import {
  format,
  formatDistanceToNow,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameDay,
  isToday,
} from "date-fns"

// ─── Types ───────────────────────────────────────────────────────

interface RunItem {
  id: string
  trigger: string
  status: string
  executionTimeMs: number | null
  startedAt: string
}

interface ScheduleMonitorProps {
  schedules: EmployeeSchedule[]
  runs: RunItem[]
  heartbeat?: HeartbeatConfig
  onUpdateHeartbeat: (heartbeat: HeartbeatConfig) => Promise<void>
}

interface CalendarEvent {
  scheduleId: string
  scheduleName: string
  cron: string
  enabled: boolean
  time: Date
  highFrequency: boolean
  color: string
}

const RUN_STATUS_STYLES: Record<string, { label: string; className: string }> =
  {
    RUNNING: { label: "Running", className: "bg-blue-500/10 text-blue-500" },
    COMPLETED: {
      label: "Completed",
      className: "bg-emerald-500/10 text-emerald-500",
    },
    FAILED: { label: "Failed", className: "bg-red-500/10 text-red-500" },
    PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-500" },
  }

const EVENT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
]

const EVENT_CHIP_COLORS = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
]

// ─── Sub-Components ──────────────────────────────────────────────

function CalendarToolbar({
  view,
  onViewChange,
  currentDate,
  onNavigate,
}: {
  view: "month" | "week"
  onViewChange: (v: "month" | "week") => void
  currentDate: Date
  onNavigate: (d: Date) => void
}) {
  const label =
    view === "month"
      ? format(currentDate, "MMMM yyyy")
      : `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), "MMM d")} – ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), "MMM d, yyyy")}`

  const goBack = () =>
    onNavigate(view === "month" ? subMonths(currentDate, 1) : subWeeks(currentDate, 1))
  const goForward = () =>
    onNavigate(view === "month" ? addMonths(currentDate, 1) : addWeeks(currentDate, 1))

  return (
    <div className="flex items-center justify-between border-b px-4 py-2.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onViewChange("month")}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
            view === "month"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          Month
        </button>
        <button
          onClick={() => onViewChange("week")}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
            view === "week"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          Week
        </button>
      </div>

      <span className="text-sm font-medium">{label}</span>

      <div className="flex items-center gap-1">
        <button
          onClick={goBack}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={goForward}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => onNavigate(new Date())}
          className="ml-1 px-2 py-1 text-xs rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          Today
        </button>
      </div>
    </div>
  )
}

function EventChip({
  event,
  colorIndex,
}: {
  event: CalendarEvent
  colorIndex: number
}) {
  const chipColor = EVENT_CHIP_COLORS[colorIndex % EVENT_CHIP_COLORS.length]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate font-medium",
            chipColor
          )}
        >
          {event.highFrequency
            ? "Runs frequently"
            : `${format(event.time, "HH:mm")} ${event.scheduleName}`}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" side="right" align="start">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full shrink-0",
                EVENT_COLORS[colorIndex % EVENT_COLORS.length]
              )}
            />
            <span className="text-sm font-medium truncate">
              {event.scheduleName}
            </span>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <code className="font-mono text-[11px]">{event.cron}</code>
            </div>
            <p>{describeCron(event.cron)}</p>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] px-1.5 py-0",
              event.enabled
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-muted text-muted-foreground"
            )}
          >
            {event.enabled ? "Active" : "Disabled"}
          </Badge>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MonthView({
  currentDate,
  eventsMap,
  heartbeatEnabled,
  scheduleColorMap,
}: {
  currentDate: Date
  eventsMap: Map<string, CalendarEvent[]>
  heartbeatEnabled: boolean
  scheduleColorMap: Map<string, number>
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <div className="p-2">
      {/* Day name headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((name) => (
          <div
            key={name}
            className="text-center text-[10px] font-medium text-muted-foreground py-1"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 border-t border-l">
        {days.map((day) => {
          const key = dateKey(day)
          const events = eventsMap.get(key) || []
          const isCurrentMonth = day.getMonth() === currentDate.getMonth()
          const today = isToday(day)
          const maxVisible = 3
          const overflow = events.length - maxVisible

          return (
            <div
              key={key}
              className={cn(
                "border-r border-b min-h-[72px] p-1 relative",
                !isCurrentMonth && "bg-muted/30"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-[11px] leading-none",
                    today &&
                      "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-medium",
                    !today && !isCurrentMonth && "text-muted-foreground/50",
                    !today && isCurrentMonth && "text-muted-foreground"
                  )}
                >
                  {day.getDate()}
                </span>
                {heartbeatEnabled && isCurrentMonth && (
                  <Heart className="h-2.5 w-2.5 text-rose-400 animate-pulse" />
                )}
              </div>

              <div className="mt-1 space-y-0.5">
                {events.slice(0, maxVisible).map((evt, i) => (
                  <EventChip
                    key={`${evt.scheduleId}-${i}`}
                    event={evt}
                    colorIndex={scheduleColorMap.get(evt.scheduleId) ?? 0}
                  />
                ))}
                {overflow > 0 && (
                  <span className="text-[9px] text-muted-foreground pl-1">
                    +{overflow} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({
  currentDate,
  eventsMap,
  heartbeatEnabled,
  activeStart,
  activeEnd,
  scheduleColorMap,
}: {
  currentDate: Date
  eventsMap: Map<string, CalendarEvent[]>
  heartbeatEnabled: boolean
  activeStart: string
  activeEnd: string
  scheduleColorMap: Map<string, number>
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Parse active hours for heartbeat band
  const startHour = activeStart ? parseInt(activeStart.split(":")[0], 10) : 8
  const endHour = activeEnd ? parseInt(activeEnd.split(":")[0], 10) : 22

  // Group events by day and hour
  const eventsByDayHour = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of days) {
      const dayEvents = eventsMap.get(dateKey(day)) || []
      for (const evt of dayEvents) {
        const h = evt.time.getHours()
        const k = `${dateKey(day)}-${h}`
        const arr = map.get(k) || []
        arr.push(evt)
        map.set(k, arr)
      }
    }
    return map
  }, [days, eventsMap])

  return (
    <ScrollArea className="h-[480px]">
      <div className="min-w-full">
        {/* Day headers */}
        <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b sticky top-0 bg-card z-10">
          <div className="border-r" />
          {days.map((day) => (
            <div
              key={dateKey(day)}
              className="text-center py-2 border-r text-xs"
            >
              <div className="text-muted-foreground">
                {format(day, "EEE")}
              </div>
              <div
                className={cn(
                  "font-medium",
                  isToday(day) &&
                    "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center mx-auto"
                )}
              >
                {day.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Hour rows */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[48px_repeat(7,1fr)] border-b"
          >
            {/* Hour label */}
            <div className="border-r px-1 py-1 text-[10px] text-muted-foreground text-right pr-2 h-12 flex items-start justify-end">
              {String(hour).padStart(2, "0")}:00
            </div>

            {/* Day columns */}
            {days.map((day) => {
              const k = `${dateKey(day)}-${hour}`
              const cellEvents = eventsByDayHour.get(k) || []
              const inActiveRange =
                heartbeatEnabled && hour >= startHour && hour < endHour

              return (
                <div
                  key={k}
                  className={cn(
                    "border-r h-12 relative p-0.5",
                    inActiveRange && "bg-rose-500/5"
                  )}
                >
                  {cellEvents.map((evt, i) => (
                    <EventChip
                      key={`${evt.scheduleId}-${i}`}
                      event={evt}
                      colorIndex={
                        scheduleColorMap.get(evt.scheduleId) ?? 0
                      }
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

function HeartbeatConfigSection({
  enabled,
  setEnabled,
  interval,
  setInterval_,
  activeStart,
  setActiveStart,
  activeEnd,
  setActiveEnd,
  checklist,
  setChecklist,
  isSaving,
  onSave,
}: {
  enabled: boolean
  setEnabled: (v: boolean) => void
  interval: string
  setInterval_: (v: string) => void
  activeStart: string
  setActiveStart: (v: string) => void
  activeEnd: string
  setActiveEnd: (v: string) => void
  checklist: string
  setChecklist: (v: string) => void
  isSaving: boolean
  onSave: () => void
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Heart className="h-4 w-4 text-rose-500" />
        <h2 className="text-sm font-medium">Heartbeat</h2>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Enable Heartbeat</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Periodic checklist the agent runs each tick
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Interval (minutes)</Label>
            <Input
              type="number"
              min={5}
              value={interval}
              onChange={(e) => setInterval_(e.target.value)}
              className="h-8 text-sm"
              disabled={!enabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Active from</Label>
            <Input
              type="time"
              value={activeStart}
              onChange={(e) => setActiveStart(e.target.value)}
              className="h-8 text-sm"
              disabled={!enabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Active until</Label>
            <Input
              type="time"
              value={activeEnd}
              onChange={(e) => setActiveEnd(e.target.value)}
              className="h-8 text-sm"
              disabled={!enabled}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Checklist (one task per line)</Label>
          <Textarea
            value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
            placeholder={
              "Check inbox for new messages\nReview pending approvals\nSummarize daily activity"
            }
            rows={4}
            className="text-sm resize-none"
            disabled={!enabled}
          />
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function RecentRunsSection({ runs }: { runs: RunItem[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Zap className="h-4 w-4" />
        <h2 className="text-sm font-medium">Recent Schedule Runs</h2>
      </div>
      <div className="p-4">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Clock className="h-7 w-7 mb-2.5 opacity-30" />
            <p className="text-sm">No schedule-triggered runs yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const style =
                RUN_STATUS_STYLES[run.status] || RUN_STATUS_STYLES.COMPLETED
              const duration = run.executionTimeMs
                ? `${(run.executionTimeMs / 1000).toFixed(1)}s`
                : "-"
              return (
                <div
                  key={run.id}
                  className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3 text-sm"
                >
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 shrink-0",
                      style.className
                    )}
                  >
                    {style.label}
                  </Badge>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {duration}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {formatDistanceToNow(new Date(run.startedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────

export function ScheduleMonitor({
  schedules,
  runs,
  heartbeat,
  onUpdateHeartbeat,
}: ScheduleMonitorProps) {
  // Calendar state
  const [view, setView] = useState<"month" | "week">("month")
  const [currentDate, setCurrentDate] = useState(new Date())

  // Heartbeat form state
  const [enabled, setEnabled] = useState(heartbeat?.enabled ?? false)
  const [interval, setInterval_] = useState(
    String(heartbeat?.intervalMinutes ?? 30)
  )
  const [activeStart, setActiveStart] = useState(
    heartbeat?.activeHours?.start ?? "08:00"
  )
  const [activeEnd, setActiveEnd] = useState(
    heartbeat?.activeHours?.end ?? "22:00"
  )
  const [checklist, setChecklist] = useState(
    heartbeat?.checklist?.join("\n") ?? ""
  )
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveHeartbeat = useCallback(async () => {
    setIsSaving(true)
    try {
      const mins = Math.max(5, parseInt(interval, 10) || 30)
      const items = checklist
        .split("\n")
        .map((l) => l.replace(/^[\s\-*]+/, "").trim())
        .filter(Boolean)

      await onUpdateHeartbeat({
        enabled,
        intervalMinutes: mins,
        activeHours:
          activeStart && activeEnd
            ? { start: activeStart, end: activeEnd }
            : undefined,
        checklist: items,
      })
    } finally {
      setIsSaving(false)
    }
  }, [enabled, interval, activeStart, activeEnd, checklist, onUpdateHeartbeat])

  // Assign a stable color index to each schedule
  const scheduleColorMap = useMemo(() => {
    const map = new Map<string, number>()
    schedules.forEach((s, i) => map.set(s.id, i % EVENT_COLORS.length))
    return map
  }, [schedules])

  // Compute events only for the active view
  const monthEvents = useMemo(() => {
    if (view !== "month") return new Map<string, CalendarEvent[]>()
    const map = new Map<string, CalendarEvent[]>()

    for (const sched of schedules) {
      if (!sched.enabled) continue
      const parts = sched.cron.trim().split(/\s+/)
      const highFrequency =
        parts.length === 5 &&
        parseCronField(parts[0], 0, 59).length *
          parseCronField(parts[1], 0, 23).length >
          48

      const occurrences = getCronOccurrencesForMonth(sched.cron, currentDate)
      const colorIdx = scheduleColorMap.get(sched.id) ?? 0

      for (const time of occurrences) {
        const key = dateKey(time)
        const arr = map.get(key) || []
        arr.push({
          scheduleId: sched.id,
          scheduleName: sched.name,
          cron: sched.cron,
          enabled: sched.enabled,
          time,
          highFrequency,
          color: EVENT_COLORS[colorIdx],
        })
        map.set(key, arr)
      }
    }

    return map
  }, [view, schedules, currentDate, scheduleColorMap])

  const weekEvents = useMemo(() => {
    if (view !== "week") return new Map<string, CalendarEvent[]>()
    const map = new Map<string, CalendarEvent[]>()
    const ws = startOfWeek(currentDate, { weekStartsOn: 0 })

    for (const sched of schedules) {
      if (!sched.enabled) continue
      const parts = sched.cron.trim().split(/\s+/)
      const highFrequency =
        parts.length === 5 &&
        parseCronField(parts[0], 0, 59).length *
          parseCronField(parts[1], 0, 23).length >
          48

      const occurrences = getCronOccurrencesForWeek(sched.cron, ws)
      const colorIdx = scheduleColorMap.get(sched.id) ?? 0

      for (const time of occurrences) {
        const key = dateKey(time)
        const arr = map.get(key) || []
        arr.push({
          scheduleId: sched.id,
          scheduleName: sched.name,
          cron: sched.cron,
          enabled: sched.enabled,
          time,
          highFrequency,
          color: EVENT_COLORS[colorIdx],
        })
        map.set(key, arr)
      }
    }

    return map
  }, [view, schedules, currentDate, scheduleColorMap])

  const scheduleRuns = useMemo(
    () => runs.filter((r) => r.trigger === "schedule").slice(0, 20),
    [runs]
  )

  return (
    <div className="flex-1 overflow-auto p-5 space-y-5">
      {/* ─── Calendar Card ─── */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Calendar className="h-4 w-4" />
          <h2 className="text-sm font-medium">Schedule Calendar</h2>
        </div>
        <CalendarToolbar
          view={view}
          onViewChange={setView}
          currentDate={currentDate}
          onNavigate={setCurrentDate}
        />

        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Calendar className="h-7 w-7 mb-2.5 opacity-30" />
            <p className="text-sm">No schedules configured</p>
            <p className="text-xs mt-1 max-w-[300px] text-center">
              Deploy and instruct the agent to set up recurring tasks.
            </p>
          </div>
        ) : view === "month" ? (
          <MonthView
            currentDate={currentDate}
            eventsMap={monthEvents}
            heartbeatEnabled={enabled}
            scheduleColorMap={scheduleColorMap}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            eventsMap={weekEvents}
            heartbeatEnabled={enabled}
            activeStart={activeStart}
            activeEnd={activeEnd}
            scheduleColorMap={scheduleColorMap}
          />
        )}
      </div>

      {/* ─── Heartbeat Configuration ─── */}
      <HeartbeatConfigSection
        enabled={enabled}
        setEnabled={setEnabled}
        interval={interval}
        setInterval_={setInterval_}
        activeStart={activeStart}
        setActiveStart={setActiveStart}
        activeEnd={activeEnd}
        setActiveEnd={setActiveEnd}
        checklist={checklist}
        setChecklist={setChecklist}
        isSaving={isSaving}
        onSave={handleSaveHeartbeat}
      />

      {/* ─── Recent Schedule Runs ─── */}
      <RecentRunsSection runs={scheduleRuns} />
    </div>
  )
}
