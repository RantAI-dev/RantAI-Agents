/**
 * Unit tests for the prompt/context budget.
 *
 * These guard the failure that reached production: a self-hosted model with an
 * 8192-token ceiling, fed an ~8100-token prompt of retrieved excerpts, has no
 * room left to answer in. It does not error — it emits a few tokens and stops,
 * so the student sees a confident half-sentence cut mid-word.
 */
import { describe, it, expect } from "vitest"
import { fitContext, estimateTokens } from "../../src/features/agent-api/service"

const excerpt = (n: number, size = 4000) =>
  `[${n}] Buku Kelas VIII — Bab ${n}\n` + "x".repeat(size)

/** A formatted block shaped like formatHybridContextForPrompt's output. */
function block(count: number, size = 4000): string {
  const body = Array.from({ length: count }, (_, i) => excerpt(i + 1, size)).join(
    "\n\n---\n\n"
  )
  const sources = Array.from({ length: count }, (_, i) => `${i + 1}. Buku Kelas VIII`).join("\n")
  return `## Knowledge Base Context\n\nExcerpts:\n${body}\n\nSources:\n${sources}`
}

describe("estimateTokens", () => {
  it("grows with length and never returns zero for real text", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("halo")).toBeGreaterThan(0)
    expect(estimateTokens("x".repeat(3400))).toBeGreaterThan(estimateTokens("x".repeat(340)))
  })
})

describe("fitContext", () => {
  it("leaves a context that already fits completely untouched", () => {
    const small = block(1, 200)
    expect(fitContext(small, "prompt pendek")).toBe(small)
  })

  it("drops trailing excerpts when the block is too large", () => {
    const big = block(12)
    const out = fitContext(big, "prompt pendek")
    expect(out.length).toBeLessThan(big.length)
    // Ranked retrieval: the first excerpt is the most relevant and must survive.
    expect(out).toContain("[1] Buku Kelas VIII — Bab 1")
    expect(out).not.toContain("[12] Buku Kelas VIII — Bab 12")
  })

  it("keeps the Sources footer, so inline [n] citations still resolve", () => {
    const out = fitContext(block(12), "prompt pendek")
    expect(out).toContain("Sources:")
    expect(out).toContain("1. Buku Kelas VIII")
  })

  it("returns something rather than nothing when even one excerpt is too big", () => {
    const out = fitContext(block(1, 200000), "prompt pendek")
    expect(out.length).toBeGreaterThan(0)
  })

  it("drops the context entirely when the persona alone blows the budget", () => {
    const hugePrompt = "y".repeat(400000)
    expect(fitContext(block(3), hugePrompt)).toBe("")
  })

  it("reserves room to answer: output never fills the whole window", () => {
    const out = fitContext(block(12), "prompt pendek")
    // Budget 6000 minus 1024 reserved; the kept block must respect that.
    expect(estimateTokens(out)).toBeLessThanOrEqual(6000 - 1024)
  })
})
