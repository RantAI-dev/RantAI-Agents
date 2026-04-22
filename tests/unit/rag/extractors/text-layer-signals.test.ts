import { describe, it, expect } from "vitest"
import { isUnpdfSufficient } from "@/lib/rag/extractors/text-layer-signals"

const DEFAULTS = { minCharsPerPage: 300, maxColumnarLines: 5, maxCurrencyMatches: 10 }

describe("isUnpdfSufficient / volume gate", () => {
  it("returns false on empty text", () => {
    expect(isUnpdfSufficient("", 1, DEFAULTS)).toBe(false)
  })

  it("returns false below the char-per-page threshold", () => {
    const text = "x".repeat(200)
    expect(isUnpdfSufficient(text, 1, DEFAULTS)).toBe(false)
  })

  it("returns true at the char-per-page threshold when no table signals", () => {
    const text = "prose ".repeat(60) // 360 chars
    expect(isUnpdfSufficient(text, 1, DEFAULTS)).toBe(true)
  })

  it("scales char threshold with page count", () => {
    const text = "x".repeat(400) // enough for 1 page, not for 2
    expect(isUnpdfSufficient(text, 1, DEFAULTS)).toBe(true)
    expect(isUnpdfSufficient(text, 2, DEFAULTS)).toBe(false)
  })
})
