import { describe, it, expect } from "vitest"
import { mergeStructuralWithTextLayer, __test } from "@/lib/rag/extractors/hybrid-merge"

const { parseBlocks, trySubstitute, extractAnchor } = __test

describe("hybrid-merge / parseBlocks", () => {
  it("classifies headings, prose, tables, code, and LaTeX", () => {
    const md = [
      "# Title",
      "",
      "First paragraph body.",
      "Continues here.",
      "",
      "| col1 | col2 |",
      "| --- | --- |",
      "| a | b |",
      "",
      "```python",
      "print(1)",
      "```",
      "",
      "$$",
      "E = mc^2",
      "$$",
    ].join("\n")
    const blocks = parseBlocks(md).filter(b => b.kind !== "blank")
    expect(blocks.map(b => b.kind)).toEqual(["heading", "prose", "table", "code", "latex"])
  })

  it("captures HTML tables (MinerU format) spanning multiple lines", () => {
    const md = [
      "Intro paragraph.",
      "",
      "<table><tr><td>a</td><td>b</td></tr>",
      "<tr><td>c</td><td>d</td></tr></table>",
      "",
      "Outro paragraph.",
    ].join("\n")
    const blocks = parseBlocks(md).filter(b => b.kind !== "blank")
    expect(blocks[0].kind).toBe("prose")
    expect(blocks[1].kind).toBe("table")
    expect(blocks[1].raw).toContain("</table>")
    expect(blocks[2].kind).toBe("prose")
  })
})

describe("hybrid-merge / extractAnchor", () => {
  it("returns first/last N words respectively", () => {
    const text = "the quick brown fox jumps over the lazy dog"
    expect(extractAnchor(text, "start", 3)).toBe("the quick brown")
    expect(extractAnchor(text, "end", 3)).toBe("the lazy dog")
  })

  it("returns the whole text when shorter than wordCount", () => {
    expect(extractAnchor("hi there", "start", 10)).toBe("hi there")
  })
})

describe("hybrid-merge / trySubstitute", () => {
  it("substitutes unpdf's exact characters when anchors match cleanly", () => {
    // Realistic scenario: a whole paragraph where OCR glitched once in the MIDDLE
    // (Ł -> L). Start + end anchors are clean, so substitution catches the fix.
    const prose =
      "The dominant sequence transduction models are based on recurrent networks. " +
      "Aidan and Lukasz Kaiser worked on this. " +
      "Our model achieves state-of-the-art BLEU on WMT 2014."
    const textLayer =
      "The dominant sequence transduction models are based on recurrent networks. " +
      "Aidan and Łukasz Kaiser worked on this. " +
      "Our model achieves state-of-the-art BLEU on WMT 2014."
    const result = trySubstitute(prose, textLayer)
    expect(result).toBeTruthy()
    expect(result).toContain("Łukasz") // Unicode preserved from unpdf
  })

  it("returns null when the start anchor is absent", () => {
    const prose = "This text does not appear in the other document at all."
    const textLayer = "Completely unrelated content about frogs and toads."
    expect(trySubstitute(prose, textLayer)).toBeNull()
  })

  it("returns null when the length ratio is unreasonable", () => {
    // Start + end anchors collide on something nearby, producing a tiny span
    const prose = "aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm nnn ooo"
    const textLayer = "aaa bbb ccc ddd eee fff xxx kkk lll mmm nnn ooo" // shorter middle
    const result = trySubstitute(prose, textLayer)
    // Either matched with a valid ratio or rejected — assertion: never returns garbage
    if (result !== null) {
      expect(result.length / prose.length).toBeGreaterThan(0.7)
      expect(result.length / prose.length).toBeLessThan(1.5)
    }
  })
})

describe("hybrid-merge / mergeStructuralWithTextLayer", () => {
  it("preserves tables verbatim from the structural extractor", () => {
    const structural = [
      "Intro.",
      "",
      "<table><tr><td>Cash</td><td>$29,943</td></tr></table>",
      "",
      "Outro.",
    ].join("\n")
    const textLayer = "Intro. Cash 29 943 Outro." // unpdf typically smears tables
    const merged = mergeStructuralWithTextLayer(structural, textLayer)
    expect(merged).toContain("<table>")
    expect(merged).toContain("$29,943") // structural's table kept as-is
  })

  it("preserves headings and code fences verbatim", () => {
    const structural = [
      "# Important",
      "",
      "Some introduction.",
      "",
      "```ts",
      "const x = 1",
      "```",
    ].join("\n")
    const textLayer = "Important Some introduction. const x = 1"
    const merged = mergeStructuralWithTextLayer(structural, textLayer)
    expect(merged).toMatch(/^# Important/m)
    expect(merged).toContain("```ts")
    expect(merged).toContain("```")
  })

  it("substitutes prose text from unpdf when anchors resolve", () => {
    // Full paragraph so anchor words are clean even when mid-paragraph OCR glitched
    const structural =
      "Introduction. The authors of this paper include Aidan and Lukasz Kaiser. " +
      "They worked on the Transformer architecture together."
    const textLayer =
      "Introduction. The authors of this paper include Aidan and Łukasz Kaiser. " +
      "They worked on the Transformer architecture together."
    const merged = mergeStructuralWithTextLayer(structural, textLayer)
    expect(merged).toContain("Łukasz")
  })

  it("keeps structural version for very short blocks where anchors overlap the OCR error", () => {
    // Known limitation: anchor-based substitution requires at least a few
    // "clean" words outside the OCR error. On <10-word prose with the error in
    // the anchor zone, we keep the structural version. Safe fallback, not wrong.
    const structural = "The author Lukasz Kaiser wrote the code."
    const textLayer = "The author Łukasz Kaiser wrote the code."
    const merged = mergeStructuralWithTextLayer(structural, textLayer)
    // Structural is kept (no crash, no garbage — just OCR'd version)
    expect(merged).toContain("Lukasz Kaiser")
  })

  it("falls back to structural when text-layer is empty", () => {
    const structural = "# Heading\n\nSome prose."
    expect(mergeStructuralWithTextLayer(structural, "")).toBe(structural)
  })

  it("falls back to text-layer when structural is empty", () => {
    const textLayer = "Just flat text."
    expect(mergeStructuralWithTextLayer("", textLayer)).toBe(textLayer)
  })

  it("leaves prose untouched when anchors don't resolve in text-layer", () => {
    const structural = "# Title\n\nThis prose is nowhere in the other doc."
    const textLayer = "Entirely unrelated content about chemistry."
    const merged = mergeStructuralWithTextLayer(structural, textLayer)
    expect(merged).toContain("This prose is nowhere in the other doc.")
    expect(merged).toContain("# Title")
  })
})
