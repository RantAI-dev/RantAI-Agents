import { describe, it, expect, beforeEach } from "vitest"
import { metrics, recordSandbox, recordRender, resetMetrics } from "@/lib/document-script/metrics"

beforeEach(() => resetMetrics())

describe("metrics", () => {
  it("counts sandbox attempts and failures separately", () => {
    recordSandbox({ ok: true, durationMs: 200 })
    recordSandbox({ ok: false, durationMs: 50 })
    recordSandbox({ ok: true, durationMs: 300 })
    expect(metrics().sandbox_attempts).toBe(3)
    expect(metrics().sandbox_failures).toBe(1)
    expect(metrics().sandbox_duration_ms_total).toBe(550)
  })

  it("counts render attempts, failures, and duration", () => {
    recordRender({ ok: true, durationMs: 1000 })
    recordRender({ ok: false, durationMs: 200 })
    expect(metrics().render_attempts).toBe(2)
    expect(metrics().render_failures).toBe(1)
    expect(metrics().render_duration_ms_total).toBe(1200)
  })

  it("resetMetrics zeroes everything", () => {
    recordSandbox({ ok: true, durationMs: 100 })
    resetMetrics()
    expect(metrics().sandbox_attempts).toBe(0)
  })
})
