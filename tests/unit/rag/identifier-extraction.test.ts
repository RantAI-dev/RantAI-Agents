import { describe, it, expect } from "vitest"
import { extractIdentifierTokens } from "@/lib/rag/identifier-extraction"

describe("extractIdentifierTokens", () => {
  it("extracts hyphenated codes from multi-code Indonesian query", () => {
    const query = "Apa perbedaan antara kode ING-P20-6120 dan ING-P40-6140?"
    const tokens = extractIdentifierTokens(query)
    expect(tokens).toEqual(["ING-P20-6120", "ING-P40-6140"])
  })

  it("extracts alphanumeric codes with underscores or mixed hyphens and underscores", () => {
    const query = "Check status of ERR_CONNECTION_RESET and TX-99_PROD in cluster"
    const tokens = extractIdentifierTokens(query)
    expect(tokens).toEqual(["ERR_CONNECTION_RESET", "TX-99_PROD"])
  })

  it("ignores plain words without hyphens or underscores (positive control)", () => {
    const query = "Apa perbedaan antara kedua model mobil tersebut di pasar?"
    const tokens = extractIdentifierTokens(query)
    expect(tokens).toEqual([])
  })

  it("ignores standalone hyphens, underscores, or punctuation", () => {
    const query = "Item - vs -- or _ or __ and (test?)"
    const tokens = extractIdentifierTokens(query)
    expect(tokens).toEqual([])
  })

  it("deduplicates case-insensitively while preserving first seen casing", () => {
    const query = "Bandingkan ING-P20-6120 dengan ing-p20-6120 dan ING-p20-6120"
    const tokens = extractIdentifierTokens(query)
    expect(tokens).toEqual(["ING-P20-6120"])
  })

  it("handles empty or whitespace-only query", () => {
    expect(extractIdentifierTokens("")).toEqual([])
    expect(extractIdentifierTokens("   ")).toEqual([])
  })
})
