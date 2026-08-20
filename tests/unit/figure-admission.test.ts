/**
 * Unit tests for figure admission.
 *
 * The failure this rule exists to prevent is silent: a threshold that admits
 * nothing raises no error, logs no warning, and simply answers without the
 * picture — which is how an absolute floor of 0.2 kept the vision gate from
 * running at all in production while every component test passed. So the
 * properties guarded here are the ones whose breakage is invisible in prod:
 * that a shifted score distribution cannot mute the stage, that the cap is
 * respected, and that a broken reranker degrades to "top few" rather than to
 * silence.
 */
import { describe, it, expect } from "vitest"
import {
  admissionRule,
  admit,
  describeRule,
  DEFAULT_ALPHA,
  DEFAULT_MAX_KEEP,
} from "../../src/lib/rag/figure-admission"

const c = (...scores: number[]) => scores.map((score, i) => ({ item: `f${i}`, score }))

describe("admissionRule", () => {
  it("is relative by default", () => {
    expect(admissionRule({} as NodeJS.ProcessEnv)).toEqual({
      kind: "relative",
      alpha: DEFAULT_ALPHA,
      maxKeep: DEFAULT_MAX_KEEP,
    })
  })

  it("honours an explicit absolute floor as an escape hatch", () => {
    const r = admissionRule({ KB_FIGURE_MIN_RERANK: "0.2" } as unknown as NodeJS.ProcessEnv)
    expect(r).toEqual({ kind: "absolute", min: 0.2, maxKeep: DEFAULT_MAX_KEEP })
  })

  it("ignores a nonsense alpha rather than admitting nothing", () => {
    // alpha > 1 would cut every candidate including the best one; alpha <= 0
    // would admit the whole list. Both are configuration mistakes, and neither
    // should be obeyed literally.
    for (const bad of ["0", "-1", "1.5", "abc", ""]) {
      const r = admissionRule({ KB_FIGURE_REL_ALPHA: bad } as unknown as NodeJS.ProcessEnv)
      expect(r).toEqual({ kind: "relative", alpha: DEFAULT_ALPHA, maxKeep: DEFAULT_MAX_KEEP })
    }
  })
})

describe("admit — relative", () => {
  const rule = { kind: "relative", alpha: 0.2, maxKeep: 3 } as const

  it("admits the leader whatever the corpus scale", () => {
    // The same relevance ordering at two wildly different scales: printed
    // captions score ~0.016 where author-written descriptions score ~0.8. An
    // absolute floor serves at most one of these; the relative rule serves both.
    for (const scale of [1, 0.02, 0.001, 1e-5]) {
      const out = admit(c(1 * scale, 0.5 * scale, 0.01 * scale), rule)
      expect(out.length).toBeGreaterThan(0)
      expect(out[0]!.item).toBe("f0")
    }
  })

  it("keeps candidates within alpha of the best and drops the rest", () => {
    const out = admit(c(0.9, 0.3, 0.17, 0.01), rule).map((x) => x.item)
    // cut = 0.18: 0.9 and 0.3 clear it, 0.17 and 0.01 do not.
    expect(out).toEqual(["f0", "f1"])
  })

  it("never exceeds the cap", () => {
    const out = admit(c(0.9, 0.89, 0.88, 0.87, 0.86), rule)
    expect(out).toHaveLength(3)
  })

  it("sorts by score even when the input is unordered", () => {
    const out = admit(c(0.2, 0.9, 0.5), rule).map((x) => x.item)
    expect(out).toEqual(["f1", "f2", "f0"])
  })

  it("falls back to the cap when the reranker separated nothing", () => {
    // All-zero scores mean the ranker is uninformative, not that every figure
    // is wrong. Emitting the cap lets the vision gate — which looks at the
    // actual crop — make the call instead of failing to silence here.
    const out = admit(c(0, 0, 0, 0), rule)
    expect(out).toHaveLength(3)
  })

  it("treats a non-finite score as zero instead of dropping the candidate", () => {
    const out = admit(c(0.9, Number.NaN, 0.4), rule)
    expect(out.map((x) => x.item)).toEqual(["f0", "f2"])
  })

  it("returns nothing only when there is nothing to admit", () => {
    expect(admit([], rule)).toEqual([])
  })
})

describe("admit — absolute", () => {
  it("still filters by the floor when explicitly configured", () => {
    const out = admit(c(0.9, 0.3, 0.01), { kind: "absolute", min: 0.2, maxKeep: 3 })
    expect(out.map((x) => x.item)).toEqual(["f0", "f1"])
  })

  it("can admit nothing — which is the documented risk of this mode", () => {
    const out = admit(c(0.016, 0.004), { kind: "absolute", min: 0.2, maxKeep: 3 })
    expect(out).toEqual([])
  })
})

describe("describeRule", () => {
  it("names the rule that actually ran", () => {
    expect(describeRule({ kind: "relative", alpha: 0.2, maxKeep: 3 })).toBe("relative>=0.2*max cap 3")
    expect(describeRule({ kind: "absolute", min: 0.001, maxKeep: 3 })).toBe("absolute>=0.001 cap 3")
  })
})
