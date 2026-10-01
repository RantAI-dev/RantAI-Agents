import { describe, expect, it, vi } from "vitest"
import sharp from "sharp"
import {
  citedFigureNumbers,
  createFigureTagScanner,
  createInlineFigureFeed,
  encodeForInline,
  inlineFigureLimits,
  isFigureAssetOfDocument,
  loadInlineFigure,
  type FigureSourceLike,
} from "./inline-figures"

const DOC = "30d591e6-7d21-4e9b-92c7-52a14965740a"
const OTHER_DOC = "025b6c2d-13d6-42cb-adba-560f3c58c799"
const key = (doc: string, file: string) => `documents/org1/${doc}/assets/${file}`

const sources: FigureSourceLike[] = [
  { title: "IPA Kelas VIII", section: "Bab 1", chunkType: "text", documentId: DOC, page: 39 },
  { title: "IPA Kelas VIII", section: "Bab 1 > Mulut", chunkType: "text", documentId: DOC, page: 40 },
  { title: "IPA Kelas VIII", section: "Gambar 1.11 Bagian-Bagian Mulut", chunkType: "figure", documentId: DOC, assetKey: key(DOC, "fig-p40-53.png"), page: 40 },
  { title: "IPA Kelas VIII", section: "Gambar 1.12 Lambung", chunkType: "figure", documentId: DOC, assetKey: key(DOC, "fig-p41-54.png"), page: 41 },
]

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer()

const limits = { maxPerAnswer: 4, maxEdgePx: 720, maxRawBytes: 400_000 }

describe("createFigureTagScanner", () => {
  it("reports a tag split across deltas, once", () => {
    const s = createFigureTagScanner()
    expect(s.push("air liur.\n[fig")).toEqual([])
    expect(s.push("ure:")).toEqual([])
    expect(s.push("3]\nLalu")).toEqual([3])
    expect(s.push(" makanan [figure:3] lagi")).toEqual([])
  })

  it("reports several tags in order and tolerates a space after the colon", () => {
    const s = createFigureTagScanner()
    expect(s.push("a [figure:4] b [figure: 3] c")).toEqual([4, 3])
  })

  it("does not report an unfinished tag", () => {
    const s = createFigureTagScanner()
    expect(s.push("lihat [figure:3")).toEqual([])
  })

  it("still finds a tag after a long run of plain text", () => {
    const s = createFigureTagScanner()
    for (let i = 0; i < 50; i++) expect(s.push("kata ".repeat(20))).toEqual([])
    expect(s.push("[figure:")).toEqual([])
    expect(s.push("12]")).toEqual([12])
  })
})

describe("citedFigureNumbers", () => {
  it("returns first-citation order without repeats", () => {
    expect(citedFigureNumbers("x [figure:4] y [figure:3] z [figure:4]")).toEqual([4, 3])
    expect(citedFigureNumbers("tanpa gambar [1][2]")).toEqual([])
  })
})

describe("isFigureAssetOfDocument", () => {
  it("accepts an asset under its own document", () => {
    expect(isFigureAssetOfDocument(key(DOC, "fig-p40-53.png"), DOC)).toBe(true)
  })

  it("rejects another document's asset, a non-asset object and path traversal", () => {
    expect(isFigureAssetOfDocument(key(OTHER_DOC, "fig-p1-1.png"), DOC)).toBe(false)
    expect(isFigureAssetOfDocument(`documents/org1/${DOC}/buku.pdf`, DOC)).toBe(false)
    expect(isFigureAssetOfDocument(`documents/org1/${DOC}/assets/../../${OTHER_DOC}/buku.pdf`, DOC)).toBe(false)
    expect(isFigureAssetOfDocument(`secrets/${DOC}/assets/x.png`, DOC)).toBe(false)
  })
})

describe("encodeForInline", () => {
  it("downscales the long edge and returns WebP that decodes to those dimensions", async () => {
    const out = await encodeForInline(await png(1600, 800), 720)
    expect(out.mime).toBe("image/webp")
    expect(out.width).toBe(720)
    expect(out.height).toBe(360)
    const meta = await sharp(out.buffer).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 720, 360])
  })

  it("never enlarges a small crop", async () => {
    const out = await encodeForInline(await png(300, 200), 720)
    expect([out.width, out.height]).toEqual([300, 200])
  })
})

describe("loadInlineFigure", () => {
  it("loads a cited figure and carries its caption fields", async () => {
    const download = vi.fn(async () => png(1000, 500))
    const fig = await loadInlineFigure(3, sources, { download, limits })
    expect(download).toHaveBeenCalledWith(key(DOC, "fig-p40-53.png"))
    expect(fig).toMatchObject({ n: 3, title: "IPA Kelas VIII", section: "Gambar 1.11 Bagian-Bagian Mulut", page: 40, mime: "image/webp", width: 720, height: 360 })
    const decoded = await sharp(Buffer.from(fig!.data, "base64")).metadata()
    expect(decoded.width).toBe(720)
    expect(fig!.bytes).toBe(Buffer.from(fig!.data, "base64").length)
  })

  it("ignores a number that points at a text source or past the list — without touching storage", async () => {
    const download = vi.fn(async () => png(10, 10))
    expect(await loadInlineFigure(1, sources, { download, limits })).toBeNull()
    expect(await loadInlineFigure(99, sources, { download, limits })).toBeNull()
    expect(await loadInlineFigure(0, sources, { download, limits })).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it("refuses an asset key that belongs to another document — without touching storage", async () => {
    const download = vi.fn(async () => png(10, 10))
    const tampered: FigureSourceLike[] = [
      { title: "x", chunkType: "figure", documentId: DOC, assetKey: key(OTHER_DOC, "fig-p1-1.png") },
      { title: "x", chunkType: "figure", documentId: DOC, assetKey: `documents/org1/${DOC}/assets/../../../secret.env` },
    ]
    expect(await loadInlineFigure(1, tampered, { download, limits })).toBeNull()
    expect(await loadInlineFigure(2, tampered, { download, limits })).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it("returns null instead of throwing when storage fails", async () => {
    const warn = vi.fn()
    const fig = await loadInlineFigure(3, sources, { download: async () => { throw new Error("NoSuchKey") }, limits, warn })
    expect(fig).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })

  it("falls back to the original when re-encoding fails, but not for an oversized original", async () => {
    const small = await png(40, 40)
    const encode = async () => { throw new Error("sharp unavailable") }
    const ok = await loadInlineFigure(3, sources, { download: async () => small, encode, limits, warn: () => {} })
    expect(ok).toMatchObject({ mime: "image/png", width: null, bytes: small.length })
    expect(Buffer.from(ok!.data, "base64").equals(small)).toBe(true)

    const big = Buffer.alloc(limits.maxRawBytes + 1)
    expect(await loadInlineFigure(3, sources, { download: async () => big, encode, limits, warn: () => {} })).toBeNull()
  })
})

describe("createInlineFigureFeed", () => {
  it("emits each cited figure once, as its tag completes", async () => {
    const download = vi.fn(async () => png(100, 100))
    const feed = createInlineFigureFeed(sources, { download, limits })
    expect(await feed.onDelta("Mulut [figure:")).toEqual([])
    expect((await feed.onDelta("3] lalu lambung [figure:4]")).map((f) => f.n)).toEqual([3, 4])
    expect(await feed.onDelta(" ulang [figure:3]")).toEqual([])
    expect(download).toHaveBeenCalledTimes(2)
  })

  it("stops at the per-answer cap, and skipped citations do not consume it", async () => {
    const many: FigureSourceLike[] = [
      { title: "t", chunkType: "text", documentId: DOC },
      ...Array.from({ length: 6 }, (_, i) => ({ title: "t", chunkType: "figure", documentId: DOC, assetKey: key(DOC, `f${i}.png`) })),
    ]
    const download = vi.fn(async () => png(50, 50))
    const feed = createInlineFigureFeed(many, { download, limits: { ...limits, maxPerAnswer: 2 } })
    const figs = await feed.forText("[figure:1] [figure:2] [figure:3] [figure:4] [figure:5]")
    expect(figs.map((f) => f.n)).toEqual([2, 3])
    expect(download).toHaveBeenCalledTimes(2)
  })
})

describe("inlineFigureLimits", () => {
  it("reads overrides and ignores nonsense", () => {
    expect(inlineFigureLimits({ AGENT_API_INLINE_FIGURE_MAX: "2", AGENT_API_INLINE_FIGURE_MAX_PX: "480" } as never)).toMatchObject({ maxPerAnswer: 2, maxEdgePx: 480 })
    expect(inlineFigureLimits({ AGENT_API_INLINE_FIGURE_MAX: "0", AGENT_API_INLINE_FIGURE_MAX_PX: "abc" } as never)).toMatchObject({ maxPerAnswer: 4, maxEdgePx: 720 })
  })
})
