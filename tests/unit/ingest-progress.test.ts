import { describe, it, expect } from "vitest"
import {
  computeOverallProgress,
  computeEtaSeconds,
  formatProgressLabel,
} from "@/lib/ingest/progress"

// ─── computeOverallProgress ──────────────────────────────────────────────────

const FULL = { entities: true, figures: true }
const LEAN = { entities: false, figures: false } // e.g. xlsx/csv policy

describe("computeOverallProgress", () => {
  it("is 0 at queued and 100 only at done", () => {
    expect(computeOverallProgress({ step: "queued" }, FULL)).toBe(0)
    expect(computeOverallProgress({ step: "done" }, FULL)).toBe(100)
    expect(computeOverallProgress({ step: "done" }, LEAN)).toBe(100)
  })

  it("never reports 100 before done, even at a step's end", () => {
    // storing fully complete but not yet flipped to done
    expect(computeOverallProgress({ step: "storing", current: 400, total: 400 }, FULL)).toBeLessThan(100)
    expect(computeOverallProgress({ step: "storing", current: 400, total: 400 }, FULL)).toBe(99)
  })

  it("weights extraction as the dominant early cost (full pipeline)", () => {
    // start of extracting = 0% completed weight; mid-extraction fills its slice
    expect(computeOverallProgress({ step: "extracting" }, FULL)).toBe(0)
    expect(computeOverallProgress({ step: "extracting", current: 1, total: 2 }, FULL)).toBe(23) // ~45/2
    // entity step starts after extracting(45)+chunking(4) = 49
    expect(computeOverallProgress({ step: "extracting_entities" }, FULL)).toBe(49)
  })

  it("zeroes skipped steps and renormalizes the rest", () => {
    // With entities+figures skipped, remaining costs 45+4+12+7=68 scale to 100:
    // embedding starts after (45+4)/68 ≈ 72%.
    expect(computeOverallProgress({ step: "embedding" }, LEAN)).toBe(72)
    // A skipped step never adds weight: figures start == embedding start point
    expect(computeOverallProgress({ step: "processing_figures" }, LEAN)).toBe(
      computeOverallProgress({ step: "embedding" }, LEAN)
    )
    // mid-extraction fills the (larger) normalized slice: (45/68)/2 ≈ 33%
    expect(computeOverallProgress({ step: "extracting", current: 1, total: 2 }, LEAN)).toBe(33)
  })

  it("advances monotonically across the full pipeline", () => {
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
    for (const flags of [FULL, LEAN, { entities: true, figures: false }]) {
      const values = order.map((s) => computeOverallProgress(s, flags))
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
      }
    }
  })

  it("ignores a malformed in-step fraction", () => {
    expect(computeOverallProgress({ step: "embedding", current: 5, total: 0 }, FULL)).toBe(
      computeOverallProgress({ step: "embedding" }, FULL)
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
