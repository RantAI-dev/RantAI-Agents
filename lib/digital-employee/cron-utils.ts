import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  addDays,
} from "date-fns"

/**
 * Format a Date as "YYYY-MM-DD" for use as map keys.
 */
export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Parse a single cron field into an array of matching numbers.
 */
export function parseCronField(field: string, min: number, max: number): number[] {
  const results = new Set<number>()

  for (const part of field.split(",")) {
    const trimmed = part.trim()

    const stepAll = trimmed.match(/^\*\/(\d+)$/)
    if (stepAll) {
      const step = parseInt(stepAll[1], 10)
      for (let i = min; i <= max; i += step) results.add(i)
      continue
    }

    if (trimmed === "*") {
      for (let i = min; i <= max; i++) results.add(i)
      continue
    }

    const range = trimmed.match(/^(\d+)-(\d+)(?:\/(\d+))?$/)
    if (range) {
      const start = parseInt(range[1], 10)
      const end = parseInt(range[2], 10)
      const step = range[3] ? parseInt(range[3], 10) : 1
      for (let i = start; i <= end; i += step) results.add(i)
      continue
    }

    const num = parseInt(trimmed, 10)
    if (!isNaN(num)) results.add(num)
  }

  return Array.from(results).sort((a, b) => a - b)
}

/**
 * Generate a short human-readable description of a cron expression.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron

  const [minField, hourField, domField, monField, dowField] = parts

  const timeStr = (() => {
    const stepMin = minField.match(/^\*\/(\d+)$/)
    if (stepMin && hourField === "*") return `Every ${stepMin[1]} min`
    if (minField === "*" && hourField === "*") return "Every minute"

    const stepHour = hourField.match(/^\*\/(\d+)$/)
    if (stepHour && minField === "0") return `Every ${stepHour[1]} hours`

    if (/^\d+$/.test(minField) && /^\d+$/.test(hourField)) {
      const h = parseInt(hourField, 10)
      const m = parseInt(minField, 10)
      return `at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    }

    if (/^\d+$/.test(minField) && hourField === "*") {
      return `Hourly at :${minField.padStart(2, "0")}`
    }

    return null
  })()

  const dayStr = (() => {
    if (domField === "*" && monField === "*" && dowField === "*") return "Daily"
    if (dowField === "1-5" && domField === "*" && monField === "*") return "Weekdays"
    if (dowField === "0,6" && domField === "*" && monField === "*") return "Weekends"
    if (dowField !== "*" && domField === "*") {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      const dows = parseCronField(dowField, 0, 6)
      return dows.map((d) => dayNames[d]).join(", ")
    }
    if (domField !== "*" && monField === "*" && dowField === "*") {
      return `Day ${domField} of month`
    }
    return null
  })()

  if (timeStr && dayStr) return `${dayStr} ${timeStr}`
  if (timeStr) return timeStr
  if (dayStr) return dayStr
  return cron
}

/**
 * Expand a cron expression into all firing Date objects within a given month.
 * Safety cap: if hours*minutes > 48, returns only the first occurrence per day.
 */
export function getCronOccurrencesForMonth(
  cron: string,
  refDate: Date
): Date[] {
  const monthStart = startOfMonth(refDate)
  const monthEnd = endOfMonth(refDate)
  return getCronOccurrencesForRange(cron, monthStart, monthEnd)
}

/**
 * Expand a cron expression into all firing Date objects within a 7-day week.
 */
export function getCronOccurrencesForWeek(
  cron: string,
  weekStart: Date
): Date[] {
  const weekEnd = addDays(weekStart, 6)
  return getCronOccurrencesForRange(cron, weekStart, weekEnd)
}

function getCronOccurrencesForRange(
  cron: string,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return []

  const [minField, hourField, domField, monField, dowField] = parts

  const minutes = parseCronField(minField, 0, 59)
  const hours = parseCronField(hourField, 0, 23)
  const doms = domField === "*" ? null : parseCronField(domField, 1, 31)
  const months = monField === "*" ? null : parseCronField(monField, 1, 12)
  const dows = dowField === "*" ? null : parseCronField(dowField, 0, 6)

  const highFrequency = hours.length * minutes.length > 48

  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  const results: Date[] = []

  for (const day of days) {
    const m = day.getMonth() + 1
    const dom = day.getDate()
    const dow = day.getDay()

    if (months && !months.includes(m)) continue
    if (doms && !doms.includes(dom)) continue
    if (dows && !dows.includes(dow)) continue

    if (highFrequency) {
      // Collapse to one occurrence at midnight for high-frequency crons
      const d = new Date(day)
      d.setHours(hours[0], minutes[0], 0, 0)
      results.push(d)
      continue
    }

    for (const h of hours) {
      for (const min of minutes) {
        const d = new Date(day)
        d.setHours(h, min, 0, 0)
        results.push(d)
      }
    }
  }

  return results
}
