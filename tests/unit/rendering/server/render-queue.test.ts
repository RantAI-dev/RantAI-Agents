import { describe, it, expect } from "vitest"
import { withRenderSlot } from "@/lib/rendering/server/render-queue"

describe("withRenderSlot", () => {
  it("limits concurrent executions to N", async () => {
    let active = 0
    let peak = 0
    const work = async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 50))
      active--
      return "ok"
    }
    // Spawn 10 in parallel; queue capped at 3
    const results = await Promise.all(
      Array.from({ length: 10 }, () => withRenderSlot(work, { capacity: 3 })),
    )
    expect(results).toHaveLength(10)
    expect(results.every((r) => r === "ok")).toBe(true)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it("releases the slot even when work throws", async () => {
    const errors: unknown[] = []
    const ops = Array.from({ length: 5 }, (_, i) =>
      withRenderSlot(
        async () => {
          if (i % 2 === 0) throw new Error(`boom ${i}`)
          return i
        },
        { capacity: 2 },
      ).catch((e) => errors.push(e)),
    )
    await Promise.all(ops)
    // If slots leaked, the next call would deadlock — test would time out
    const after = await withRenderSlot(async () => "ok", { capacity: 2 })
    expect(after).toBe("ok")
    expect(errors).toHaveLength(3)  // i=0,2,4
  })
})
