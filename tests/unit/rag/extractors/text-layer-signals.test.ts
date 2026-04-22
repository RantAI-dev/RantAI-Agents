import { describe, it, expect } from "vitest"
import { isUnpdfSufficient, hasColumnarLines, hasDenseCurrency } from "@/lib/rag/extractors/text-layer-signals"

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

describe("hasColumnarLines", () => {
  it("returns false on plain prose", () => {
    const text = [
      "This is a paragraph about running.",
      "Another paragraph describing cats.",
      "A third line with ordinary prose content.",
    ].join("\n")
    expect(hasColumnarLines(text, 5)).toBe(false)
  })

  it("returns true when multi-whitespace columnar lines exceed the threshold", () => {
    // Six lines each with 2+ runs of 3+ whitespace chars between words → table-like
    const tabular = Array.from({ length: 6 }, () =>
      "Cash   $29,943   $29,965"
    ).join("\n")
    expect(hasColumnarLines(tabular, 5)).toBe(true)
  })

  it("ignores short lines even if they look columnar", () => {
    const text = Array.from({ length: 10 }, () => "A   B   C").join("\n") // <10 chars each trimmed
    expect(hasColumnarLines(text, 5)).toBe(false)
  })

  it("the threshold is exclusive — exactly N columnar lines is not enough", () => {
    const text = Array.from({ length: 5 }, () =>
      "Long row   $1,000   $2,000"
    ).join("\n")
    expect(hasColumnarLines(text, 5)).toBe(false)
  })
})

describe("isUnpdfSufficient / columnar gate", () => {
  it("returns false when columnar lines exceed threshold even with enough chars", () => {
    const tabular = Array.from({ length: 6 }, () =>
      "Cash   $29,943   $29,965"
    ).join("\n")
    // Padded with prose so volume gate passes
    const padding = "prose text ".repeat(40)
    expect(isUnpdfSufficient(tabular + "\n" + padding, 1, DEFAULTS)).toBe(false)
  })
})

describe("hasDenseCurrency", () => {
  it("returns false on prose with no currency", () => {
    expect(hasDenseCurrency("just some words here", 10)).toBe(false)
  })

  it("returns false when currency count is below threshold", () => {
    const text = Array.from({ length: 5 }, () => "$1,234").join(" ")
    expect(hasDenseCurrency(text, 10)).toBe(false)
  })

  it("returns true when currency count exceeds threshold", () => {
    const text = Array.from({ length: 11 }, () => "$1,234").join(" ")
    expect(hasDenseCurrency(text, 10)).toBe(true)
  })

  it("matches dollar amounts with optional space after $ and decimals", () => {
    const text = Array.from({ length: 11 }, () => "$ 29,943.50").join("\n")
    expect(hasDenseCurrency(text, 10)).toBe(true)
  })
})

describe("isUnpdfSufficient / currency gate", () => {
  it("returns false when currency density exceeds threshold", () => {
    // Enough chars, no columns — but many $ amounts means tables likely exist
    const padded = "description text ".repeat(40) // 680 chars prose
    const currency = Array.from({ length: 11 }, () => "$29,943").join(" ")
    expect(isUnpdfSufficient(padded + " " + currency, 1, DEFAULTS)).toBe(false)
  })

  it("returns true on pure prose with enough volume", () => {
    const prose = "The quick brown fox jumps over the lazy dog. ".repeat(20)
    expect(isUnpdfSufficient(prose, 1, DEFAULTS)).toBe(true)
  })
})
