import { describe, it, expect } from "vitest"
import {
  buildCron,
  parseCronField,
  parseCronFrequency,
  describeCron,
  dateKey,
  getNextOccurrences,
} from "@/lib/digital-employee/cron-utils"

// ─── buildCron ───────────────────────────────────────────────────────────────

describe("buildCron", () => {
  it("every_minute → * * * * *", () => {
    expect(buildCron({ frequency: "every_minute" })).toBe("* * * * *")
  })

  it("every_5_min → */5 * * * *", () => {
    expect(buildCron({ frequency: "every_5_min" })).toBe("*/5 * * * *")
  })

  it("every_15_min → */15 * * * *", () => {
    expect(buildCron({ frequency: "every_15_min" })).toBe("*/15 * * * *")
  })

  it("every_30_min → */30 * * * *", () => {
    expect(buildCron({ frequency: "every_30_min" })).toBe("*/30 * * * *")
  })

  it("hourly with minute option", () => {
    expect(buildCron({ frequency: "hourly", minute: 15 })).toBe("15 * * * *")
  })

  it("hourly defaults minute to 0", () => {
    expect(buildCron({ frequency: "hourly" })).toBe("0 * * * *")
  })

  it("daily with hour and minute", () => {
    expect(buildCron({ frequency: "daily", hour: 14, minute: 30 })).toBe("30 14 * * *")
  })

  it("daily defaults to 09:00", () => {
    expect(buildCron({ frequency: "daily" })).toBe("0 9 * * *")
  })

  it("weekly with dayOfWeek", () => {
    expect(buildCron({ frequency: "weekly", hour: 9, minute: 0, dayOfWeek: 5 })).toBe("0 9 * * 5")
  })

  it("weekly defaults to Monday at 09:00", () => {
    expect(buildCron({ frequency: "weekly" })).toBe("0 9 * * 1")
  })

  it("monthly with dayOfMonth", () => {
    expect(buildCron({ frequency: "monthly", hour: 8, minute: 0, dayOfMonth: 15 })).toBe("0 8 15 * *")
  })

  it("monthly defaults to 1st at 09:00", () => {
    expect(buildCron({ frequency: "monthly" })).toBe("0 9 1 * *")
  })

  it("custom defaults to 00:00", () => {
    expect(buildCron({ frequency: "custom" })).toBe("0 0 * * *")
  })
})

// ─── parseCronField ──────────────────────────────────────────────────────────

describe("parseCronField", () => {
  it("* expands to full range", () => {
    expect(parseCronField("*", 0, 5)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("*/2 generates step values", () => {
    expect(parseCronField("*/2", 0, 6)).toEqual([0, 2, 4, 6])
  })

  it("plain number returns single value", () => {
    expect(parseCronField("5", 0, 59)).toEqual([5])
  })

  it("range 1-3 returns inclusive range", () => {
    expect(parseCronField("1-3", 0, 10)).toEqual([1, 2, 3])
  })

  it("range with step 1-10/3 returns stepped range", () => {
    expect(parseCronField("1-10/3", 0, 59)).toEqual([1, 4, 7, 10])
  })

  it("comma-separated values", () => {
    expect(parseCronField("1,3,5", 0, 10)).toEqual([1, 3, 5])
  })

  it("mixed comma + range", () => {
    const result = parseCronField("1,5-7", 0, 10)
    expect(result).toEqual([1, 5, 6, 7])
  })

  it("returns sorted deduplicated values", () => {
    const result = parseCronField("5,3,5,1", 0, 10)
    expect(result).toEqual([1, 3, 5])
  })
})

// ─── parseCronFrequency ──────────────────────────────────────────────────────

describe("parseCronFrequency", () => {
  it("detects every_minute", () => {
    expect(parseCronFrequency("* * * * *")).toEqual({ frequency: "every_minute" })
  })

  it("detects every_5_min", () => {
    expect(parseCronFrequency("*/5 * * * *")).toEqual({ frequency: "every_5_min" })
  })

  it("detects every_15_min", () => {
    expect(parseCronFrequency("*/15 * * * *")).toEqual({ frequency: "every_15_min" })
  })

  it("detects every_30_min", () => {
    expect(parseCronFrequency("*/30 * * * *")).toEqual({ frequency: "every_30_min" })
  })

  it("detects hourly with minute", () => {
    expect(parseCronFrequency("15 * * * *")).toEqual({ frequency: "hourly", minute: 15 })
  })

  it("detects daily with hour and minute", () => {
    expect(parseCronFrequency("30 14 * * *")).toEqual({ frequency: "daily", minute: 30, hour: 14 })
  })

  it("detects weekly with dayOfWeek", () => {
    expect(parseCronFrequency("0 9 * * 5")).toEqual({
      frequency: "weekly", minute: 0, hour: 9, dayOfWeek: 5,
    })
  })

  it("detects monthly with dayOfMonth", () => {
    expect(parseCronFrequency("0 8 15 * *")).toEqual({
      frequency: "monthly", minute: 0, hour: 8, dayOfMonth: 15,
    })
  })

  it("returns custom for unrecognized patterns", () => {
    expect(parseCronFrequency("*/7 * * * *")).toEqual({ frequency: "custom" })
  })

  it("returns custom for invalid cron (wrong field count)", () => {
    expect(parseCronFrequency("* * *")).toEqual({ frequency: "custom" })
  })

  it("roundtrips with buildCron", () => {
    const options = { frequency: "weekly" as const, minute: 30, hour: 10, dayOfWeek: 3 }
    const cron = buildCron(options)
    const parsed = parseCronFrequency(cron)
    expect(parsed).toEqual(options)
  })
})

// ─── describeCron ────────────────────────────────────────────────────────────

describe("describeCron", () => {
  it("describes every minute", () => {
    expect(describeCron("* * * * *")).toBe("Daily Every minute")
  })

  it("describes step minutes", () => {
    expect(describeCron("*/15 * * * *")).toContain("15 min")
  })

  it("describes daily at specific time", () => {
    expect(describeCron("30 14 * * *")).toContain("14:30")
  })

  it("describes hourly at specific minute", () => {
    expect(describeCron("15 * * * *")).toContain(":15")
  })

  it("describes weekdays", () => {
    expect(describeCron("0 9 * * 1-5")).toContain("Weekdays")
  })

  it("describes weekends", () => {
    expect(describeCron("0 9 * * 0,6")).toContain("Weekends")
  })

  it("describes day of month", () => {
    expect(describeCron("0 9 15 * *")).toContain("Day 15")
  })

  it("returns raw cron for invalid input", () => {
    expect(describeCron("bad")).toBe("bad")
  })
})

// ─── dateKey ─────────────────────────────────────────────────────────────────

describe("dateKey", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(dateKey(new Date(2025, 0, 5))).toBe("2025-01-05")
  })

  it("pads single-digit month and day", () => {
    expect(dateKey(new Date(2025, 2, 3))).toBe("2025-03-03")
  })
})

// ─── getNextOccurrences ──────────────────────────────────────────────────────

describe("getNextOccurrences", () => {
  it("returns requested number of occurrences for every_minute", () => {
    const results = getNextOccurrences("* * * * *", 5)
    expect(results).toHaveLength(5)
  })

  it("returns dates in ascending order", () => {
    const results = getNextOccurrences("* * * * *", 3)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].getTime()).toBeGreaterThan(results[i - 1].getTime())
    }
  })

  it("returns empty for invalid cron", () => {
    expect(getNextOccurrences("bad cron", 5)).toEqual([])
  })

  it("returns occurrences matching the cron minute field", () => {
    const results = getNextOccurrences("30 * * * *", 3)
    for (const d of results) {
      expect(d.getMinutes()).toBe(30)
    }
  })

  it("returns occurrences matching the cron hour field", () => {
    const results = getNextOccurrences("0 14 * * *", 2)
    for (const d of results) {
      expect(d.getHours()).toBe(14)
      expect(d.getMinutes()).toBe(0)
    }
  })
})
