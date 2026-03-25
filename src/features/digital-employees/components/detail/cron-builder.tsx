"use client"

import { useState, useMemo, useCallback } from "react"
import { Clock, Calendar } from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  buildCron,
  describeCron,
  getNextOccurrences,
  parseCronFrequency,
  type CronOptions,
} from "@/lib/digital-employee/cron-utils"

interface CronBuilderProps {
  value: string
  onChange: (cron: string) => void
  timezone?: string
}

const FREQUENCY_OPTIONS: { value: CronOptions["frequency"]; label: string }[] = [
  { value: "every_minute", label: "Every minute" },
  { value: "every_5_min", label: "Every 5 minutes" },
  { value: "every_15_min", label: "Every 15 minutes" },
  { value: "every_30_min", label: "Every 30 minutes" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
]

const DAY_OF_WEEK_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function CronBuilder({ value, onChange, timezone }: CronBuilderProps) {
  const parsed = useMemo(() => parseCronFrequency(value), [value])

  const [frequency, setFrequency] = useState<CronOptions["frequency"]>(parsed.frequency)
  const [minute, setMinute] = useState(parsed.minute ?? 0)
  const [hour, setHour] = useState(parsed.hour ?? 9)
  const [dayOfWeek, setDayOfWeek] = useState(parsed.dayOfWeek ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(parsed.dayOfMonth ?? 1)
  const [customCron, setCustomCron] = useState(
    parsed.frequency === "custom" ? value : ""
  )

  const emitChange = useCallback(
    (opts: CronOptions, rawCustom?: string) => {
      if (opts.frequency === "custom" && rawCustom) {
        onChange(rawCustom)
      } else {
        onChange(buildCron(opts))
      }
    },
    [onChange]
  )

  const handleFrequencyChange = useCallback(
    (f: CronOptions["frequency"]) => {
      setFrequency(f)
      const opts: CronOptions = { frequency: f, minute, hour, dayOfWeek, dayOfMonth }
      emitChange(opts, f === "custom" ? customCron || "* * * * *" : undefined)
    },
    [minute, hour, dayOfWeek, dayOfMonth, customCron, emitChange]
  )

  const handleMinuteChange = useCallback(
    (v: string) => {
      const n = clampInt(v, 0, 59)
      setMinute(n)
      emitChange({ frequency, minute: n, hour, dayOfWeek, dayOfMonth })
    },
    [frequency, hour, dayOfWeek, dayOfMonth, emitChange]
  )

  const handleHourChange = useCallback(
    (v: string) => {
      const n = clampInt(v, 0, 23)
      setHour(n)
      emitChange({ frequency, minute, hour: n, dayOfWeek, dayOfMonth })
    },
    [frequency, minute, dayOfWeek, dayOfMonth, emitChange]
  )

  const handleDayOfWeekChange = useCallback(
    (v: string) => {
      const n = parseInt(v, 10)
      setDayOfWeek(n)
      emitChange({ frequency, minute, hour, dayOfWeek: n, dayOfMonth })
    },
    [frequency, minute, hour, dayOfMonth, emitChange]
  )

  const handleDayOfMonthChange = useCallback(
    (v: string) => {
      const n = clampInt(v, 1, 31)
      setDayOfMonth(n)
      emitChange({ frequency, minute, hour, dayOfWeek, dayOfMonth: n })
    },
    [frequency, minute, hour, dayOfWeek, emitChange]
  )

  const handleCustomChange = useCallback(
    (v: string) => {
      setCustomCron(v)
      // Only emit if it looks like a valid 5-field cron
      if (v.trim().split(/\s+/).length === 5) {
        onChange(v.trim())
      }
    },
    [onChange]
  )

  const description = useMemo(() => describeCron(value), [value])
  const nextOccurrences = useMemo(() => getNextOccurrences(value, 5), [value])

  const showMinute = frequency === "hourly" || frequency === "daily" || frequency === "weekly" || frequency === "monthly"
  const showHour = frequency === "daily" || frequency === "weekly" || frequency === "monthly"
  const showDayOfWeek = frequency === "weekly"
  const showDayOfMonth = frequency === "monthly"
  const showCustom = frequency === "custom"

  return (
    <div className="space-y-4">
      {/* Frequency selector */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Frequency</Label>
        <Select value={frequency} onValueChange={handleFrequencyChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select frequency" />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Conditional inputs */}
      <div className="flex flex-wrap gap-3">
        {showDayOfWeek && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Day of week</Label>
            <Select value={String(dayOfWeek)} onValueChange={handleDayOfWeekChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OF_WEEK_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showDayOfMonth && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Day of month</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => handleDayOfMonthChange(e.target.value)}
              className="w-[80px]"
            />
          </div>
        )}

        {showHour && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Hour</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => handleHourChange(e.target.value)}
              className="w-[80px]"
            />
          </div>
        )}

        {showMinute && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Minute</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) => handleMinuteChange(e.target.value)}
              className="w-[80px]"
            />
          </div>
        )}
      </div>

      {/* Custom cron input */}
      {showCustom && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Cron expression</Label>
          <Input
            value={customCron}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder="* * * * *"
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Format: minute hour day-of-month month day-of-week
          </p>
        </div>
      )}

      {/* Description */}
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm text-foreground">{description}</span>
        {timezone && (
          <span className="text-xs text-muted-foreground ml-auto">({timezone})</span>
        )}
      </div>

      {/* Next occurrences preview */}
      {nextOccurrences.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Next 5 occurrences</Label>
          <ul className="space-y-1 rounded-md border border-border bg-muted/30 p-2">
            {nextOccurrences.map((date, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span>{dateFormatter.format(date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Raw cron value */}
      <p className="text-[11px] text-muted-foreground font-mono">
        {value}
      </p>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

function clampInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10)
  if (isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
