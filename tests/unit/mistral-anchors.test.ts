/**
 * Unit tests for deriving reading order from Mistral OCR markdown.
 *
 * Mistral has no explicit block sequence in its response — but it embeds each
 * crop inline as `![id](id)` at the point where it appears, so the markdown is
 * the reading order. These tests guard that reading, because if it silently
 * returns nothing, Mistral-extracted documents fall back to caption matching,
 * which is blind on the third of curriculum figures that have no caption.
 */
import { describe, it, expect } from "vitest"
import { blocksFromMarkdown } from "../../src/lib/rag/extractors/mistral-ocr-extractor"

describe("blocksFromMarkdown", () => {
  it("puts a figure between the prose before and after it", () => {
    const md = "Bilangan cacah dimulai dari nol.\n\n![img-0.jpeg](img-0.jpeg)\n\nContohnya nol, satu, dua."
    expect(blocksFromMarkdown(md, 4)).toEqual([
      { kind: "text", text: "Bilangan cacah dimulai dari nol." },
      { kind: "figure", id: "p4-img-0.jpeg" },
      { kind: "text", text: "Contohnya nol, satu, dua." },
    ])
  })

  it("qualifies the id by page, because Mistral repeats ids across pages", () => {
    // "img-0.jpeg" is page-local in Mistral's response. Left unqualified, every
    // page's first figure would collide and anchor to one another's prose.
    const a = blocksFromMarkdown("teks\n\n![img-0.jpeg](img-0.jpeg)", 0)
    const b = blocksFromMarkdown("teks\n\n![img-0.jpeg](img-0.jpeg)", 7)
    expect(a.find((x) => x.kind === "figure")!.id).toBe("p0-img-0.jpeg")
    expect(b.find((x) => x.kind === "figure")!.id).toBe("p7-img-0.jpeg")
  })

  it("keeps several figures on a page in order, each with its own prose", () => {
    const md = "Satu.\n![a.jpeg](a.jpeg)\nDua.\n![b.jpeg](b.jpeg)\nTiga."
    expect(blocksFromMarkdown(md, 1).map((b) => b.kind)).toEqual([
      "text", "figure", "text", "figure", "text",
    ])
  })

  it("handles a figure at the very start with no prose before it", () => {
    // resolveFigureAnchors must then leave it unanchored rather than reach back
    // to the previous page — a wrong anchor is worse than none.
    const blocks = blocksFromMarkdown("![img-0.jpeg](img-0.jpeg)\n\nKeterangan sesudahnya.", 2)
    expect(blocks[0]).toEqual({ kind: "figure", id: "p2-img-0.jpeg" })
  })

  it("returns text only when the page has no figures", () => {
    expect(blocksFromMarkdown("Halaman tanpa gambar sama sekali.", 3)).toEqual([
      { kind: "text", text: "Halaman tanpa gambar sama sekali." },
    ])
  })

  it("returns nothing for an empty page rather than an empty text block", () => {
    expect(blocksFromMarkdown("", 0)).toEqual([])
    expect(blocksFromMarkdown("   \n\n  ", 0)).toEqual([])
  })
})
