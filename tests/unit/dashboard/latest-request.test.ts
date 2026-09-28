// @vitest-environment node
import { describe, it, expect } from "vitest"
import { createLatestRequestGate } from "@/app/dashboard/_components/latest-request"

describe("createLatestRequestGate", () => {
  it("aborts the previous request and marks it stale when a new one begins", () => {
    const gate = createLatestRequestGate()
    const first = gate.begin()
    const second = gate.begin()
    expect(first.signal.aborted).toBe(true)
    expect(first.isCurrent()).toBe(false)
    // positive control: the newest request is live
    expect(second.signal.aborted).toBe(false)
    expect(second.isCurrent()).toBe(true)
  })

  it("cancel() aborts and invalidates the in-flight request", () => {
    const gate = createLatestRequestGate()
    const req = gate.begin()
    gate.cancel()
    expect(req.signal.aborted).toBe(true)
    expect(req.isCurrent()).toBe(false)
  })
})
