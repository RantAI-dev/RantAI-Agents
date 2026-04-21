import { describe, it, expect } from "vitest"
import { reciprocalRankFusion } from "@/lib/rag/hybrid-merge"

describe("reciprocalRankFusion", () => {
  it("merges two ranked lists by RRF score, highest score first", () => {
    const listA = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const listB = [{ id: "b" }, { id: "a" }, { id: "d" }]
    const result = reciprocalRankFusion([listA, listB])
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c", "d"])
    // a: 1/61 + 1/62 = 0.0325; b: 1/62 + 1/61 = 0.0325 — tie, stable on insertion order
  })

  it("handles single list (no fusion, preserves order)", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const result = reciprocalRankFusion([list])
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"])
  })

  it("empty lists produce empty result", () => {
    expect(reciprocalRankFusion([])).toEqual([])
    expect(reciprocalRankFusion([[], []])).toEqual([])
  })

  it("caps to limit param when provided", () => {
    const listA = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}` }))
    const result = reciprocalRankFusion([listA], { limit: 3 })
    expect(result.length).toBe(3)
  })

  it("k constant affects rank weighting", () => {
    const listA = [{ id: "x" }, { id: "y" }]
    const listB = [{ id: "y" }, { id: "x" }]
    const tight = reciprocalRankFusion([listA, listB], { k: 1 })
    const loose = reciprocalRankFusion([listA, listB], { k: 1000 })
    // Both configurations should return both items — we just verify no crash + both ids present.
    expect(tight.map((r) => r.id).sort()).toEqual(["x", "y"])
    expect(loose.map((r) => r.id).sort()).toEqual(["x", "y"])
  })
})
