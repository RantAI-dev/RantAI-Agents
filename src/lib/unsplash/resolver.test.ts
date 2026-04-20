import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock the prisma + searchPhoto modules the resolver depends on so these
// tests stay offline + deterministic. resolveUnsplashQueries does a
// cache-first lookup (we return no cached rows) then fans out to
// searchPhoto (we return a stub photo).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    resolvedImage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock("./client", () => ({
  searchPhoto: vi.fn(),
}))

import { searchPhoto } from "./client"
import { resolveDocumentImages } from "./resolver"
import type { UnsplashPhoto } from "./types"

// Minimal stub — only fields resolver.ts reads (urls.regular, user.name).
// Cast to UnsplashPhoto so vi.mocked(searchPhoto).mockResolvedValue(...)
// type-checks; the unused fields are never dereferenced by the resolver.
const stubPhoto = (keyword: string): UnsplashPhoto =>
  ({
    urls: { regular: `https://images.unsplash.com/photo-${keyword}` },
    user: { name: "Stub Author" },
  }) as UnsplashPhoto

describe("resolveDocumentImages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns content unchanged when no unsplash: markdown images exist", async () => {
    vi.mocked(searchPhoto).mockResolvedValue(null)
    const content = "# Title\n\nBody paragraph with no images."
    const result = await resolveDocumentImages(content)
    expect(result).toBe(content)
    expect(searchPhoto).not.toHaveBeenCalled()
  })

  it("rewrites ![alt](unsplash:X) to ![alt](real-url&w=1200)", async () => {
    vi.mocked(searchPhoto).mockResolvedValue(stubPhoto("coffee"))
    const content = "# Title\n\n![A hot cup](unsplash:coffee)\n\nBody."
    const result = await resolveDocumentImages(content)
    expect(result).toContain(
      "![A hot cup](https://images.unsplash.com/photo-coffee&w=1200)",
    )
    expect(result).not.toContain("unsplash:coffee")
    expect(searchPhoto).toHaveBeenCalledWith("coffee")
  })

  it("preserves the optional title suffix in markdown image syntax", async () => {
    vi.mocked(searchPhoto).mockResolvedValue(stubPhoto("sunset"))
    const content = '![sunset](unsplash:sunset "A warm evening")'
    const result = await resolveDocumentImages(content)
    expect(result).toContain('"A warm evening"')
    expect(result).toMatch(
      /!\[sunset\]\(https:\/\/images\.unsplash\.com\/photo-sunset&w=1200 "A warm evening"\)/,
    )
  })

  it("leaves HTML-style src attributes untouched (that path is resolveHtmlImages)", async () => {
    vi.mocked(searchPhoto).mockResolvedValue(null)
    const content =
      '# Doc\n\n<img src="unsplash:should-not-match" />\n\nBody.'
    const result = await resolveDocumentImages(content)
    expect(result).toBe(content)
    expect(searchPhoto).not.toHaveBeenCalled()
  })

  it("resolves multiple unique keywords in one pass and dedupes repeats", async () => {
    vi.mocked(searchPhoto).mockImplementation(async (q) => stubPhoto(q))
    const content = [
      "![a](unsplash:coffee)",
      "![b](unsplash:tea)",
      "![c](unsplash:coffee)", // duplicate — should be resolved from the same map entry
    ].join("\n\n")
    const result = await resolveDocumentImages(content)
    expect(result).toContain("photo-coffee&w=1200")
    expect(result).toContain("photo-tea&w=1200")
    // searchPhoto called once per unique normalized query (2), not per occurrence (3)
    expect(searchPhoto).toHaveBeenCalledTimes(2)
  })

  it("falls back to a placehold.co URL when Unsplash returns no match", async () => {
    vi.mocked(searchPhoto).mockResolvedValue(null)
    const content = "![nothing](unsplash:utterly-obscure)"
    const result = await resolveDocumentImages(content)
    expect(result).toContain("placehold.co")
    expect(result).toContain("utterly-obscure")
    expect(result).not.toContain("unsplash:utterly-obscure")
  })

  it("does not match inside fenced code blocks that happen to contain unsplash: syntax", async () => {
    // Note: the regex is intentionally simple and does not parse markdown
    // structure. If the LLM embeds `![alt](unsplash:X)` inside a ``` fence,
    // we will still rewrite it. This test documents the current behavior
    // rather than a guarantee — accept it as a known limitation.
    vi.mocked(searchPhoto).mockResolvedValue(stubPhoto("inside"))
    const content = "```\n![a](unsplash:inside)\n```"
    const result = await resolveDocumentImages(content)
    expect(result).toContain("photo-inside&w=1200")
  })
})
