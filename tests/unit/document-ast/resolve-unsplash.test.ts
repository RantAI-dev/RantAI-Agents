import { describe, it, expect, vi, beforeEach } from "vitest"
import { resolveUnsplashInAst } from "@/lib/document-ast/resolve-unsplash"
import type { DocumentAst } from "@/lib/document-ast/schema"

vi.mock("@/lib/unsplash/client", () => ({
  searchPhoto: vi.fn(),
}))

// Stub Prisma so the cache layer is empty and we always fall through to
// searchPhoto. Without this, a real (or test) DB could return cached entries
// and bypass the calls these tests assert on.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    resolvedImage: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}))

const metaBase = {
  title: "T", pageSize: "letter" as const, orientation: "portrait" as const,
  font: "Arial", fontSize: 12, showPageNumbers: false,
}

describe("resolveUnsplashInAst", () => {
  beforeEach(async () => {
    const { searchPhoto } = await import("@/lib/unsplash/client")
    ;(searchPhoto as any).mockReset()
    ;(searchPhoto as any).mockImplementation(async (q: string) => ({
      urls: { regular: `https://images.unsplash.com/photo-${encodeURIComponent(q)}` },
      user: { name: "Photographer" },
    }))
  })

  it("replaces unsplash: image src with a resolved URL", async () => {
    const ast: DocumentAst = {
      meta: metaBase,
      body: [
        { type: "image", src: "unsplash:mountain sunset", alt: "hero", width: 800, height: 400 },
        { type: "paragraph", children: [{ type: "text", text: "x" }] },
      ],
    }
    const out = await resolveUnsplashInAst(ast)
    const img = out.body[0]
    expect(img.type).toBe("image")
    if (img.type === "image") {
      expect(img.src).toMatch(/^https:\/\/images\.unsplash\.com\//)
      expect(img.src).not.toContain("unsplash:")
    }
  })

  it("replaces coverPage.logoUrl if prefixed", async () => {
    const ast: DocumentAst = {
      meta: metaBase,
      coverPage: { title: "Cover", logoUrl: "unsplash:company logo" },
      body: [{ type: "paragraph", children: [{ type: "text", text: "x" }] }],
    }
    const out = await resolveUnsplashInAst(ast)
    expect(out.coverPage?.logoUrl).toMatch(/^https:\/\//)
  })

  it("walks into nested images inside table cells and list items", async () => {
    const ast: DocumentAst = {
      meta: metaBase,
      body: [
        {
          type: "list", ordered: false, items: [
            {
              children: [
                { type: "paragraph", children: [{ type: "text", text: "see:" }] },
                { type: "image", src: "unsplash:in list", alt: "a", width: 200, height: 100 },
              ],
            },
          ],
        },
        {
          type: "table", width: 9360, columnWidths: [9360],
          rows: [{ cells: [{ children: [
            { type: "image", src: "unsplash:in cell", alt: "b", width: 200, height: 100 },
          ] }] }],
        },
      ],
    }
    const out = await resolveUnsplashInAst(ast)
    const first = (out.body[0] as any).items[0].children[1]
    const second = (out.body[1] as any).rows[0].cells[0].children[0]
    expect(first.src).not.toContain("unsplash:")
    expect(second.src).not.toContain("unsplash:")
  })

  it("falls back to placehold.co when searchPhoto returns null", async () => {
    const { searchPhoto } = await import("@/lib/unsplash/client")
    ;(searchPhoto as any).mockResolvedValueOnce(null)
    const ast: DocumentAst = {
      meta: metaBase,
      body: [{ type: "image", src: "unsplash:ocean", alt: "x", width: 800, height: 400 }],
    }
    const out = await resolveUnsplashInAst(ast)
    const img = out.body[0]
    if (img.type === "image") {
      expect(img.src).toContain("placehold.co")
      expect(img.src).toContain("ocean")
    }
  })

  it("falls back to placehold.co when searchPhoto throws", async () => {
    const { searchPhoto } = await import("@/lib/unsplash/client")
    ;(searchPhoto as any).mockRejectedValueOnce(new Error("network down"))
    const ast: DocumentAst = {
      meta: metaBase,
      body: [{ type: "image", src: "unsplash:river", alt: "x", width: 800, height: 400 }],
    }
    const out = await resolveUnsplashInAst(ast)
    const img = out.body[0]
    if (img.type === "image") {
      expect(img.src).toContain("placehold.co")
    }
  })

  it("does not touch non-unsplash URLs", async () => {
    const ast: DocumentAst = {
      meta: metaBase,
      body: [{ type: "image", src: "https://cdn.example.com/x.png", alt: "x", width: 100, height: 100 }],
    }
    const out = await resolveUnsplashInAst(ast)
    const img = out.body[0]
    if (img.type === "image") expect(img.src).toBe("https://cdn.example.com/x.png")
  })

  it("dedupes identical unsplash keywords into one API call", async () => {
    const { searchPhoto } = await import("@/lib/unsplash/client")
    const ast: DocumentAst = {
      meta: metaBase,
      body: [
        { type: "image", src: "unsplash:same", alt: "a", width: 100, height: 100 },
        { type: "image", src: "unsplash:same", alt: "b", width: 100, height: 100 },
        { type: "image", src: "unsplash:same", alt: "c", width: 100, height: 100 },
      ],
    }
    await resolveUnsplashInAst(ast)
    expect((searchPhoto as any).mock.calls.length).toBe(1)
  })
})
