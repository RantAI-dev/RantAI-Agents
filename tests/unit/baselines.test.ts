/**
 * Unit tests for the published baselines' placement rules.
 *
 * These guard a fairness property, not just correctness: if a baseline is
 * implemented wrongly it loses for the wrong reason, and the comparison in the
 * paper becomes a strawman. The bipartite matcher in particular must be exact —
 * a greedy approximation would silently hand us the win.
 */
import { describe, it, expect } from "vitest"
import { bipartiteAssign } from "../bench-kb/src/ikat/systems"

describe("bipartiteAssign (MRAMG-style max-weight matching)", () => {
  it("picks the globally best assignment, not the greedy one", () => {
    // Greedy takes figure 0 -> sentence 0 (0.9) and then figure 1 is stuck with
    // sentence 1 (0.1), total 1.0. The optimum is 0->1 (0.8) and 1->0 (0.85),
    // total 1.65. A greedy implementation fails this test.
    const w = [
      [0.9, 0.8],
      [0.85, 0.1],
    ]
    expect(bipartiteAssign(w, 2)).toEqual([1, 0])
  })

  it("assigns at most one figure per sentence", () => {
    const w = [
      [0.9, 0.1],
      [0.9, 0.1],
      [0.9, 0.1],
    ]
    const a = bipartiteAssign(w, 3)
    expect(new Set(a).size).toBe(3)
  })

  it("handles more figures than sentences by parking the surplus at the end", () => {
    const w = [
      [0.9],
      [0.8],
    ]
    const a = bipartiteAssign(w, 1)
    // One figure gets sentence 0; the other cannot be placed and is parked at
    // nSentences, which callers render as end-of-answer.
    expect(a.filter((x) => x === 0)).toHaveLength(1)
    expect(a.filter((x) => x === 1)).toHaveLength(1)
  })

  it("returns end-of-answer for every figure when there are no sentences", () => {
    expect(bipartiteAssign([[], []], 0)).toEqual([0, 0])
  })

  it("returns an empty assignment when there are no figures", () => {
    expect(bipartiteAssign([], 3)).toEqual([])
  })
})
