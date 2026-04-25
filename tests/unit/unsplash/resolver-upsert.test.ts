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

import { resolveQueries } from "@/lib/unsplash/resolver"

beforeEach(() => {
  findManyMock.mockReset()
  createMock.mockReset()
  upsertMock.mockReset()
  searchPhotoMock.mockReset()
})

describe("resolveQueries cache write", () => {
  it("uses upsert (not create) so concurrent writers do not race on the unique constraint", async () => {
    findManyMock.mockResolvedValue([])
    searchPhotoMock.mockResolvedValue({
      urls: { regular: "https://images.example/photo" },
      user: { name: "Photographer" },
    })
    upsertMock.mockResolvedValue({})

    await resolveQueries(["mountain"])

    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(createMock).not.toHaveBeenCalled()
    const call = upsertMock.mock.calls[0][0]
    expect(call.where).toEqual({ query: "mountain" })
    expect(call.create.query).toBe("mountain")
    expect(call.update.url).toContain("https://images.example/photo")
  })
})
