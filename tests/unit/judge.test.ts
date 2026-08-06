/**
 * Unit tests for the LLM-as-judge bias controls.
 *
 * Each of these corresponds to a methodological claim the paper makes about the
 * judge. If a test here fails, a sentence in the manuscript has become false.
 */
import { describe, it, expect } from "vitest"
import {
  assertJudgeIndependence,
  shuffle,
  parseJsonLoose,
  selfConsistent,
  summarizeDiagnostics,
  DEFAULT_JUDGE,
  type PairResult,
} from "../bench-kb/src/judge"

describe("assertJudgeIndependence", () => {
  it("rejects a generator from the judge's own vendor (self-preference guard)", () => {
    expect(() =>
      assertJudgeIndependence(DEFAULT_JUDGE, ["anthropic/claude-haiku-4.5", "google/gemini-3-flash-preview"]),
    ).toThrow(/Judge independence violated/)
  })

  it("names the offending model so the failure is actionable", () => {
    expect(() => assertJudgeIndependence(DEFAULT_JUDGE, ["anthropic/claude-haiku-4.5"])).toThrow(
      /anthropic\/claude-haiku-4\.5/,
    )
  })

  it("allows generators from other vendors", () => {
    expect(() =>
      assertJudgeIndependence(DEFAULT_JUDGE, ["google/gemini-3-flash-preview", "qwen/qwen3-235b"]),
    ).not.toThrow()
  })
})

describe("shuffle (blinding)", () => {
  it("is deterministic for a given seed, so runs reproduce", () => {
    const items = ["a", "b", "c", "d", "e"]
    expect(shuffle(items, 42)).toEqual(shuffle(items, 42))
  })

  it("actually permutes for some seed (not an identity function)", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"]
    const seeds = [1, 2, 3, 4, 5]
    expect(seeds.some((s) => shuffle(items, s).join("") !== items.join(""))).toBe(true)
  })

  it("preserves the multiset of items", () => {
    const items = ["a", "b", "c", "d"]
    expect(shuffle(items, 7).slice().sort()).toEqual(items.slice().sort())
  })

  it("does not mutate the input", () => {
    const items = ["a", "b", "c"]
    shuffle(items, 9)
    expect(items).toEqual(["a", "b", "c"])
  })
})

describe("parseJsonLoose", () => {
  it("parses bare JSON", () => {
    expect(parseJsonLoose<{ slot: number }>('{"slot": 3}')).toEqual({ slot: 3 })
  })

  it("parses fenced JSON, which judges emit despite instructions", () => {
    expect(parseJsonLoose<{ slot: number }>('```json\n{"slot": 2}\n```')).toEqual({ slot: 2 })
  })

  it("parses JSON buried in prose", () => {
    expect(parseJsonLoose<{ winner: string }>('Sure! {"winner": "A"} hope that helps')).toEqual({
      winner: "A",
    })
  })

  it("returns null rather than throwing on garbage", () => {
    expect(parseJsonLoose("no json at all")).toBeNull()
  })
})

describe("selfConsistent", () => {
  it("takes the majority value and reports the agreement rate", async () => {
    const seq = [1, 2, 2]
    const r = await selfConsistent(async (i) => seq[i], 3, (v) => String(v))
    expect(r.value).toBe(2)
    expect(r.agreement).toBeCloseTo(2 / 3)
    expect(r.samples).toEqual([1, 2, 2])
  })

  it("reports full agreement when every repeat matches", async () => {
    const r = await selfConsistent(async () => 5, 3, (v) => String(v))
    expect(r.agreement).toBe(1)
  })
})

describe("summarizeDiagnostics", () => {
  it("reports mean agreement, unanimity and the position flip rate", () => {
    const pairs: PairResult[] = [
      { verdict: "A", inconsistent: false, forward: "A", reversed: "A" },
      { verdict: "tie", inconsistent: true, forward: "A", reversed: "B" },
    ]
    const d = summarizeDiagnostics(DEFAULT_JUDGE, [1, 1, 0.5], { pairs })
    expect(d.meanAgreement).toBeCloseTo(0.8333, 3)
    expect(d.unanimousRate).toBeCloseTo(2 / 3, 3)
    expect(d.positionFlipRate).toBeCloseTo(0.5)
  })

  it("always carries the human-spotcheck limitation into the output", () => {
    const d = summarizeDiagnostics(DEFAULT_JUDGE, [1])
    // NB: the note is a wrapped multi-line string, so the assertion must not
    // assume single spaces at the wrap points.
    expect(d.note).toMatch(/claim the judge is a substitute for human/)
    expect(d.note).toMatch(/human spot-check/)
  })

  it("omits the flip rate when no pairwise judging ran", () => {
    expect(summarizeDiagnostics(DEFAULT_JUDGE, [1]).positionFlipRate).toBeUndefined()
  })
})
