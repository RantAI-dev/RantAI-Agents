/**
 * Unit tests for figure anchoring in the production ingest path.
 *
 * Each of these guards a property the benchmark result depends on. Anchoring is
 * what lets a caption-less figure be retrieved at all, and 19-34% of curriculum
 * figures carry no printed caption — so a silent failure here does not break
 * ingest, it just quietly returns production to caption-only matching, which is
 * the weakest system we measured (F1 0.049 against human gold).
 */
import { describe, it, expect } from "vitest"
import { resolveFigureAnchors } from "../../src/lib/rag/figure-assets"
import type { Chunk } from "../../src/lib/rag/chunker"

const chunk = (chunkIndex: number, content: string): Chunk => ({
  content,
  metadata: { documentTitle: "t", category: "c", chunkIndex },
})

describe("resolveFigureAnchors", () => {
  it("anchors a figure to the chunk holding the prose that precedes it", () => {
    const blocks = [
      [
        { kind: "text", text: "Bilangan cacah adalah bilangan yang dimulai dari nol." },
        { kind: "figure", id: "p1-b1" },
      ],
    ]
    const chunks = [chunk(0, "Pendahuluan bab."), chunk(1, "Bilangan cacah adalah bilangan yang dimulai dari nol. Contohnya nol, satu, dua.")]
    expect(resolveFigureAnchors(blocks, chunks).get("p1-b1")).toBe(1)
  })

  it("prefers the nearest preceding prose, not the first on the page", () => {
    // A page has several passages; the figure belongs to the one just above it.
    const blocks = [
      [
        { kind: "text", text: "Bagian pertama membahas penjumlahan bilangan cacah." },
        { kind: "text", text: "Bagian kedua membahas pengurangan bilangan cacah." },
        { kind: "figure", id: "p2-b2" },
      ],
    ]
    const chunks = [
      chunk(3, "Bagian pertama membahas penjumlahan bilangan cacah."),
      chunk(4, "Bagian kedua membahas pengurangan bilangan cacah."),
    ]
    expect(resolveFigureAnchors(blocks, chunks).get("p2-b2")).toBe(4)
  })

  it("skips blocks too short to identify a chunk", () => {
    // A stray "1." or page number must not become the anchor probe.
    const blocks = [
      [
        { kind: "text", text: "Air dapat berubah wujud menjadi es ketika didinginkan." },
        { kind: "text", text: "12" },
        { kind: "figure", id: "p3-b2" },
      ],
    ]
    const chunks = [chunk(7, "Air dapat berubah wujud menjadi es ketika didinginkan.")]
    expect(resolveFigureAnchors(blocks, chunks).get("p3-b2")).toBe(7)
  })

  it("returns nothing rather than guessing when the prose is not in any chunk", () => {
    const blocks = [[{ kind: "text", text: "Teks yang tidak pernah masuk ke chunk mana pun." }, { kind: "figure", id: "p4-b1" }]]
    expect(resolveFigureAnchors(blocks, [chunk(0, "Isi yang sama sekali berbeda.")]).size).toBe(0)
  })

  it("ignores a figure with no preceding text at all", () => {
    // A figure opening a page has nothing above it; parking it on the previous
    // page's chunk would be a guess, and a wrong anchor is worse than none.
    const blocks = [[{ kind: "figure", id: "p5-b0" }, { kind: "text", text: "Keterangan sesudah gambar." }]]
    expect(resolveFigureAnchors(blocks, [chunk(0, "Keterangan sesudah gambar.")]).size).toBe(0)
  })

  it("never anchors to a figure chunk", () => {
    // Figure chunks are appended to the same array; anchoring one figure to
    // another would create a chain that retrieval cannot follow back to prose.
    const blocks = [[{ kind: "text", text: "Kincir angin mengubah energi angin menjadi listrik." }, { kind: "figure", id: "p6-b1" }]]
    const chunks: Chunk[] = [
      { content: "[Gambar] Kincir angin mengubah energi angin menjadi listrik.", metadata: { documentTitle: "t", category: "c", chunkIndex: 0, chunkType: "figure" } },
      chunk(1, "Kincir angin mengubah energi angin menjadi listrik."),
    ]
    expect(resolveFigureAnchors(blocks, chunks).get("p6-b1")).toBe(1)
  })

  it("degrades quietly when the extractor gave no block order", () => {
    // Every document ingested before this change has none, and they must keep
    // working through the caption path rather than throwing.
    expect(resolveFigureAnchors(undefined, [chunk(0, "apa pun")]).size).toBe(0)
    expect(resolveFigureAnchors([], [chunk(0, "apa pun")]).size).toBe(0)
    expect(resolveFigureAnchors([[{ kind: "figure", id: "x" }]], undefined).size).toBe(0)
  })

  it("matches regardless of whitespace and case differences", () => {
    // Chunkers normalise whitespace; the parser's block text keeps the original.
    const blocks = [[{ kind: "text", text: "Gaya  gesek\n  memperlambat   gerak benda." }, { kind: "figure", id: "p7-b1" }]]
    const chunks = [chunk(2, "gaya gesek memperlambat gerak benda pada permukaan kasar.")]
    expect(resolveFigureAnchors(blocks, chunks).get("p7-b1")).toBe(2)
  })
})
