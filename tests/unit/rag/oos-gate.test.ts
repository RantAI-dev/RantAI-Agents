import { describe, expect, it } from "vitest"
import { isLikelyOutOfScope } from "@/lib/rag/oos-gate"

// QA CHAT-034: a no-match question still showed unrelated sources and figures.
describe("isLikelyOutOfScope", () => {
  it("flags retrieval whose best hit is below the floor", () => {
    expect(isLikelyOutOfScope([0.31, 0.29, 0.27])).toBe(true)
  })

  it("keeps retrieval with at least one close hit (positive control)", () => {
    expect(isLikelyOutOfScope([0.31, 0.58, 0.27])).toBe(false)
  })

  it("does not judge when there are no vector scores", () => {
    expect(isLikelyOutOfScope([])).toBe(false)
    expect(isLikelyOutOfScope([0, 0])).toBe(false)
  })

  it("ignores graph-only zero scores next to real ones", () => {
    expect(isLikelyOutOfScope([0, 0.35])).toBe(true)
    expect(isLikelyOutOfScope([0, 0.62])).toBe(false)
  })
})
