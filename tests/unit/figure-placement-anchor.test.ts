/**
 * Unit tests for anchor-based figure placement in an answer.
 *
 * The rung under test exists because the two rungs above it are unavailable
 * for most curriculum figures: the model rarely cites a figure it was not told
 * about, and four figures in five carry no printed caption whose words could be
 * matched against the prose. The anchor is the remaining signal, and it is a
 * recorded fact rather than an inference — so the properties worth guarding are
 * that it places a caption-less figure correctly, that it never double-places,
 * and that it declines rather than guesses when the anchor was not cited.
 */
import { describe, it, expect } from "vitest"
import { autoPlaceByAnchor, type EmbeddableFigure } from "../../src/features/conversations/components/chat/citations"

const fig = (over: Partial<EmbeddableFigure> = {}): EmbeddableFigure => ({
  n: 2,
  documentId: "doc1",
  assetKey: "assets/fig-2.png",
  title: "IPA Kelas 7",
  caption: null, // the common case: no printed caption at all
  page: 41,
  anchorChunkIndex: 7,
  ...over,
})

const keys = (m: Record<number, string>) =>
  new Map<number, string>(Object.entries(m).map(([n, k]) => [Number(n), k]))

describe("autoPlaceByAnchor", () => {
  it("places a caption-less figure after the paragraph citing its anchor", () => {
    const content = "Fotosintesis terjadi di daun [1].\n\nAkar menyerap air [3]."
    const out = autoPlaceByAnchor(content, [fig()], new Set(), keys({ 1: "doc1::7", 3: "doc1::9" }))
    const imgAt = out.indexOf("![")
    const secondPara = out.indexOf("Akar menyerap")
    expect(imgAt).toBeGreaterThan(-1)
    // The image belongs to the FIRST paragraph — the one citing chunk 7.
    expect(imgAt).toBeLessThan(secondPara)
    expect(out).toContain("fig-2.png") // the key is URL-encoded in the src
  })

  it("does nothing when the figure's anchor was never cited in the prose", () => {
    // Retrieval surfaced the anchor chunk but the model did not cite it, so
    // there is no sentence to attach to. Guessing here is what the caption
    // matcher does; this rung declines instead.
    const content = "Fotosintesis terjadi di daun [1]."
    const out = autoPlaceByAnchor(content, [fig()], new Set(), keys({ 1: "doc1::99" }))
    expect(out).toBe(content)
  })

  it("does not place a figure that is already inlined", () => {
    const content = "Fotosintesis terjadi di daun [1]."
    const inlined = new Set([2])
    const out = autoPlaceByAnchor(content, [fig()], inlined, keys({ 1: "doc1::7" }))
    expect(out).toBe(content)
  })

  it("marks what it placed so the caption rung cannot double-place it", () => {
    const content = "Fotosintesis terjadi di daun [1]."
    const inlined = new Set<number>()
    autoPlaceByAnchor(content, [fig()], inlined, keys({ 1: "doc1::7" }))
    expect(inlined.has(2)).toBe(true)
  })

  it("never crosses documents: an equal chunk index elsewhere is not the anchor", () => {
    const content = "Bab lain menjelaskan hal berbeda [1]."
    const out = autoPlaceByAnchor(content, [fig()], new Set(), keys({ 1: "doc2::7" }))
    expect(out).toBe(content)
  })

  it("is inert without anchors, figures, or citations", () => {
    const content = "Teks biasa [1]."
    expect(autoPlaceByAnchor(content, [fig({ anchorChunkIndex: null })], new Set(), keys({ 1: "doc1::7" }))).toBe(content)
    expect(autoPlaceByAnchor(content, [], new Set(), keys({ 1: "doc1::7" }))).toBe(content)
    expect(autoPlaceByAnchor(content, [fig()], new Set(), new Map())).toBe(content)
    expect(autoPlaceByAnchor("", [fig()], new Set(), keys({ 1: "doc1::7" }))).toBe("")
  })

  it("ignores a citation-shaped string that is already a markdown link", () => {
    // `[1](url)` is a link, not a citation marker; placing after it would land
    // inside the link text.
    const content = "Lihat [1](https://example.com) untuk detail."
    const out = autoPlaceByAnchor(content, [fig()], new Set(), keys({ 1: "doc1::7" }))
    expect(out).toBe(content)
  })

  it("places several figures independently", () => {
    const content = "Paragraf satu [1].\n\nParagraf dua [2]."
    const figures = [fig({ n: 3, anchorChunkIndex: 7 }), fig({ n: 4, anchorChunkIndex: 8, assetKey: "assets/fig-4.png" })]
    const out = autoPlaceByAnchor(content, figures, new Set(), keys({ 1: "doc1::7", 2: "doc1::8" }))
    expect(out).toContain("fig-2.png") // the key is URL-encoded in the src
    expect(out).toContain("fig-4.png")
    expect(out.indexOf("fig-2.png")).toBeLessThan(out.indexOf("Paragraf dua"))
  })
})
