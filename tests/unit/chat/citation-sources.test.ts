/**
 * QA finding-1, CHAT-032 and CHAT-034: the Sources panel listed retrieved-but-
 * uncited documents ahead of the cited ones, and a no-information answer got an
 * unrelated figure inlined because a caption word happened to match.
 */
import { describe, expect, it } from "vitest"
import {
  autoPlaceFigures,
  citedSourceNumbers,
  partitionSourcesByCitation,
  type EmbeddableFigure,
} from "@/features/conversations/components/chat/citations"

describe("citedSourceNumbers", () => {
  it("collects [n] and [figure:n] within range, ignoring code fences and links", () => {
    const content = [
      "Kode RX-9920-ZETA [15] dikelola oleh Ir. Bramantyo [16][17].",
      "Lihat [figure:3].",
      "```py\nxs[0] + xs[2]\n```",
      "[4](https://example.com) and [99]",
    ].join("\n\n")
    expect([...citedSourceNumbers(content, 17)].sort((a, b) => a - b)).toEqual([3, 15, 16, 17])
  })

  it("returns nothing for an answer without citations", () => {
    expect(citedSourceNumbers("Tidak ada informasi dalam dokumen.", 5).size).toBe(0)
  })
})

describe("partitionSourcesByCitation", () => {
  const sources = [1, 2, 3, 14, 15].map((n) => ({ n, title: `doc ${n}` }))

  it("puts cited sources first without renumbering", () => {
    const { cited, uncited } = partitionSourcesByCitation(sources, new Set([14, 15]))
    expect(cited.map((s) => s.n)).toEqual([14, 15])
    expect(uncited.map((s) => s.n)).toEqual([1, 2, 3])
  })

  it("leaves everything uncited when nothing is cited", () => {
    const { cited, uncited } = partitionSourcesByCitation(sources, new Set())
    expect(cited).toEqual([])
    expect(uncited).toHaveLength(5)
  })
})

describe("autoPlaceFigures", () => {
  const statue: EmbeddableFigure = {
    n: 4,
    documentId: "doc-agama",
    assetKey: "assets/fig-5-7.png",
    title: "Pendidikan Agama Hindu",
    caption: "Gambar 5.7 Patung Airlangga di atas Burung Garuda",
    page: 153,
  }

  it("does not inline a figure into an answer that cites nothing", () => {
    const answer =
      "Tidak ada informasi tentang migrasi flamingo. Dokumen yang tersedia membahas Airlangga dan sejarah."
    expect(autoPlaceFigures(answer, [statue], new Set())).toBe(answer)
  })

  it("still places a caption-matched figure in a cited answer (positive control)", () => {
    const answer = "Raja Airlangga digambarkan menunggang Garuda [2]."
    const out = autoPlaceFigures(answer, [statue], new Set())
    expect(out).toContain("Gambar 5.7 Patung Airlangga")
  })
})
