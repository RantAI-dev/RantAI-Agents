/**
 * Unit tests for the grounding signal on v1 chat responses.
 *
 * The failure worth guarding is the quiet one: retrieval always returns its
 * top-k, so "nothing relevant was found" looks exactly like "five sources were
 * found" unless the score is consulted.
 */
import { describe, it, expect } from "vitest"
import { groundingOf, groundingThreshold } from "@/features/agent-api/grounding"

describe("groundingOf", () => {
  it("is grounded when the best chunk clears the threshold", () => {
    expect(groundingOf([0.31, 0.62, 0.5], 0.4)).toEqual({ grounded: true, retrieval_score: 0.62 })
  })

  it("is not grounded when every chunk is below it, however many there are", () => {
    expect(groundingOf([0.27, 0.34, 0.3, 0.33, 0.29], 0.4)).toEqual({ grounded: false, retrieval_score: 0.34 })
  })

  it("counts a score exactly at the threshold as grounded", () => {
    expect(groundingOf([0.4], 0.4).grounded).toBe(true)
  })

  it("is not grounded when nothing was retrieved", () => {
    expect(groundingOf([], 0.4)).toEqual({ grounded: false, retrieval_score: 0 })
  })

  it("ignores zero and non-finite scores rather than treating them as evidence", () => {
    expect(groundingOf([0, NaN, 0.2], 0.4)).toEqual({ grounded: false, retrieval_score: 0.2 })
  })
})

describe("groundingThreshold", () => {
  it("defaults to the out-of-scope threshold the retriever already uses", () => {
    expect(groundingThreshold({})).toBe(0.4)
  })

  it("can be calibrated per deployment", () => {
    expect(groundingThreshold({ AGENT_API_GROUNDED_MIN_SCORE: "0.55" })).toBe(0.55)
  })

  it("ignores values outside 0–1 and junk, so a typo cannot ground everything or nothing", () => {
    for (const v of ["0", "1", "1.5", "-0.2", "abc", ""]) {
      expect(groundingThreshold({ AGENT_API_GROUNDED_MIN_SCORE: v })).toBe(0.4)
    }
  })
})
