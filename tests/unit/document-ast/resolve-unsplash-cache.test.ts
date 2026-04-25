// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { findManyMock, createMock, upsertMock, searchPhotoMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  createMock: vi.fn(),
  upsertMock: vi.fn(),
  searchPhotoMock: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    resolvedImage: {
      findMany: findManyMock,
      create: createMock,
      upsert: upsertMock,
    },
  },
}))

vi.mock("@/lib/unsplash/client", () => ({
  searchPhoto: searchPhotoMock,
}))

import { resolveUnsplashInAst } from "@/lib/document-ast/resolve-unsplash"
import type { DocumentAst } from "@/lib/document-ast/schema"

beforeEach(() => {
  findManyMock.mockReset()
  createMock.mockReset()
  upsertMock.mockReset()
  searchPhotoMock.mockReset()
})

const astWithImage: DocumentAst = {
  meta: { title: "T" },
  body: [
    {
      type: "image",
      src: "unsplash:mountain at dusk",
      alt: "x",
      width: 100,
      height: 100,
    },
  ],
} as unknown as DocumentAst

describe("resolveUnsplashInAst — Prisma cache", () => {
  it("uses the cached URL and does NOT call searchPhoto on a cache hit", async () => {
    findManyMock.mockResolvedValue([
      { query: "mountain at dusk", url: "https://cached.example/mountain.jpg" },
    ])

    const out = await resolveUnsplashInAst(astWithImage)

    // The fix: cache hit means we never call the Unsplash API
    expect(searchPhotoMock).not.toHaveBeenCalled()
    const img = out.body[0] as { src: string }
    expect(img.src).toBe("https://cached.example/mountain.jpg")
  })

  it("queries the cache (findMany) before falling back to searchPhoto", async () => {
    findManyMock.mockResolvedValue([])
    searchPhotoMock.mockResolvedValue({
      urls: { regular: "https://images.example/photo" },
      user: { name: "Photographer" },
    })

    await resolveUnsplashInAst(astWithImage)

    expect(findManyMock).toHaveBeenCalled()
    expect(searchPhotoMock).toHaveBeenCalledWith("mountain at dusk")
  })
})
