import { describe, it, expect } from "vitest"
import {
  computeOverallProgress,
  computeEtaSeconds,
  formatProgressLabel,
} from "@/lib/ingest/progress"

// ─── computeOverallProgress ──────────────────────────────────────────────────

describe("computeOverallProgress", () => {
  it("is 0 at queued and 100 only at done", () => {
    expect(computeOverallProgress({ step: "queued" }, true)).toBe(0)
    expect(computeOverallProgress({ step: "done" }, true)).toBe(100)
    expect(computeOverallProgress({ step: "done" }, false)).toBe(100)
  })

  it("never reports 100 before done, even at a step's end", () => {
    // storing fully complete but not yet flipped to done
    expect(computeOverallProgress({ step: "storing", current: 400, total: 400 }, true)).toBeLessThan(100)
    expect(computeOverallProgress({ step: "storing", current: 400, total: 400 }, true)).toBe(99)
  })

  it("weights extraction as the dominant early cost (enhanced)", () => {
    // start of extracting = 0% completed weight; mid-extraction fills its slice
    expect(computeOverallProgress({ step: "extracting" }, true)).toBe(0)
    expect(computeOverallProgress({ step: "extracting", current: 1, total: 2 }, true)).toBe(23) // ~45/2
    // entity step starts after extracting(45)+chunking(3) = 48
    expect(computeOverallProgress({ step: "extracting_entities" }, true)).toBe(48)
  })

  it("redistributes the entity weight in basic mode (no entity step)", () => {
    // basic extracting weight is 55 → embedding starts later than enhanced
    expect(computeOverallProgress({ step: "extracting", current: 1, total: 2 }, false)).toBe(28) // ~55/2
    // embedding starts after extracting(55)+chunking(5)+figures(10) = 70
    expect(computeOverallProgress({ step: "embedding" }, false)).toBe(70)
  })

  it("advances monotonically across the enhanced pipeline", () => {
    const order = [
      { step: "queued" as const },
      { step: "extracting" as const },
      { step: "chunking" as const },
      { step: "extracting_entities" as const },
      { step: "processing_figures" as const },
      { step: "embedding" as const },
      { step: "storing" as const },
      { step: "done" as const },
    ]
    const values = order.map((s) => computeOverallProgress(s, true))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })

  it("ignores a malformed in-step fraction", () => {
    expect(computeOverallProgress({ step: "embedding", current: 5, total: 0 }, true)).toBe(
      computeOverallProgress({ step: "embedding" }, true)
    )
  })
})

// ─── computeEtaSeconds ───────────────────────────────────────────────────────

describe("computeEtaSeconds", () => {
  const start = new Date("2026-07-28T00:00:00Z")

  it("is null while progress is too low or complete", () => {
    expect(computeEtaSeconds(0, start, start.getTime() + 10_000)).toBeNull()
    expect(computeEtaSeconds(5, start, start.getTime() + 10_000)).toBeNull()
    expect(computeEtaSeconds(100, start, start.getTime() + 10_000)).toBeNull()
  })

  it("is null without a start time", () => {
    expect(computeEtaSeconds(50, null, start.getTime())).toBeNull()
  })

  it("extrapolates remaining time from elapsed and progress", () => {
    // 25% done after 30s → ~90s remaining
    expect(computeEtaSeconds(25, start, start.getTime() + 30_000)).toBe(90)
    // 50% done after 60s → ~60s remaining
    expect(computeEtaSeconds(50, start, start.getTime() + 60_000)).toBe(60)
  })
})

// ─── formatProgressLabel ─────────────────────────────────────────────────────

describe("formatProgressLabel", () => {
  it("shows step, counters, and ETA when present", () => {
    expect(
      formatProgressLabel({ step: "extracting", stepCurrent: 12, stepTotal: 210, etaSeconds: 120 })
    ).toBe("Extracting text · 12/210 · ~2 min left")
  })

  it("omits counters/eta when absent", () => {
    expect(formatProgressLabel({ step: "embedding" })).toBe("Embedding")
  })

  it("uses seconds for short ETAs", () => {
    expect(formatProgressLabel({ step: "storing", etaSeconds: 8 })).toBe("Storing · ~8s left")
  })
})
