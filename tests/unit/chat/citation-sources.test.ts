/**
 * QA finding-1, CHAT-032 and CHAT-034: the Sources panel listed retrieved-but-
 * uncited documents ahead of the cited ones, and a no-information answer got an
 * unrelated figure inlined because a caption word happened to match.
 *
 * TC-994 (Minor): Dangling citation markers stripping & source reconciliation.
 * TC-984 (Minor): Accurate chunk-level page numbers for citations.
 */
import { describe, expect, it } from "vitest"
import {
  autoPlaceFigures,
  citedSourceNumbers,
  partitionSourcesByCitation,
  linkifyCitations,
  reconcileCitations,
  sourcesFromToolCalls,
  type EmbeddableFigure,
} from "@/features/conversations/components/chat/citations"
import { formatSourcePages } from "@/features/conversations/components/chat/message-sources"

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

describe("reconcileCitations (TC-994)", () => {
  it("strips dangling citation markers when no sources are attached for the turn (count=0)", () => {
    const content = "Informasi mengenai kode ING-P20-6120 ditemukan pada dokumen [1], sedangkan ING-P40-6140 pada lampiran [4]."
    const result = reconcileCitations(content, { messageId: "msg-1", count: 0 })
    expect(result).toBe("Informasi mengenai kode ING-P20-6120 ditemukan pada dokumen, sedangkan ING-P40-6140 pada lampiran.")
  })

  it("strips out-of-range dangling citation markers while linkifying valid ones", () => {
    const content = "Menurut spesifikasi [1], performa meningkat [2], tetapi modul [4] belum terdaftar."
    const result = reconcileCitations(content, { messageId: "msg-1", count: 2 })
    expect(result).toBe("Menurut spesifikasi [1](#cite-msg-1-1), performa meningkat [2](#cite-msg-1-2), tetapi modul belum terdaftar.")
  })

  it("preserves code blocks containing square bracket indexing", () => {
    const content = "Kode array:\n```ts\nconst val = list[1];\n```\nDan teks biasa [1]."
    const result = reconcileCitations(content, { messageId: "msg-1", count: 1 })
    expect(result).toContain("const val = list[1];")
    expect(result).toContain("Dan teks biasa [1](#cite-msg-1-1).")
  })

  it("preserves real markdown links", () => {
    const content = "Kunjungi tautan [1](https://example.com) untuk dokumen asli, referensi [1]."
    const result = reconcileCitations(content, { messageId: "msg-1", count: 1 })
    expect(result).toContain("[1](https://example.com)")
    expect(result).toContain("referensi [1](#cite-msg-1-1).")
  })

  it("linkifyCitations delegates to reconcileCitations", () => {
    const content = "Data A [1] dan Data B [3]."
    const result = linkifyCitations(content, "msg-1", 1)
    expect(result).toBe("Data A [1](#cite-msg-1-1) dan Data B.")
  })
})

describe("formatSourcePages (TC-984)", () => {
  it("formats distinct pages from multiple cited chunks of the same document", () => {
    // 0-indexed chunk pages 38 and 78 -> 1-indexed pages 39 and 79
    const label = formatSourcePages([38, 78])
    expect(label).toBe("hal. 39, 79")
  })

  it("deduplicates identical chunk pages and sorts them ascending", () => {
    const label = formatSourcePages([78, 38, 38, 78])
    expect(label).toBe("hal. 39, 79")
  })

  it("formats single chunk page correctly", () => {
    expect(formatSourcePages([38])).toBe("hal. 39")
    expect(formatSourcePages(null, 38)).toBe("hal. 39")
  })

  it("returns null when no page information is available (positive control)", () => {
    expect(formatSourcePages(null, null)).toBeNull()
    expect(formatSourcePages([])).toBeNull()
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

describe("sourcesFromToolCalls (TC-984 reload)", () => {
  // Persisted shape: message.metadata.toolCalls — messages carry no `parts`.
  const toolCalls = [
    { toolCallId: "t0", toolName: "web_search", state: "done", output: { sources: [{ title: "web" }] } },
    {
      toolCallId: "t1",
      toolName: "knowledge_search",
      state: "done",
      output: { sources: [{ documentTitle: "Manual", documentId: "d1", page: 38, pages: [38, 78] }] },
    },
  ]

  it("restores page-accurate sources from the persisted knowledge_search call", () => {
    const sources = sourcesFromToolCalls(toolCalls)
    expect(sources).toHaveLength(1)
    expect(sources![0]).toMatchObject({ title: "Manual", documentId: "d1", page: 38, pages: [38, 78] })
    expect(formatSourcePages(sources![0].pages, sources![0].page)).toBe("hal. 39, 79")
  })

  it("returns null when nothing is restorable", () => {
    expect(sourcesFromToolCalls(undefined)).toBeNull()
    expect(sourcesFromToolCalls([{ toolName: "knowledge_search", output: { sources: [] } }])).toBeNull()
    expect(sourcesFromToolCalls([toolCalls[0]])).toBeNull()
  })
})
