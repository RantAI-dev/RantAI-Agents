import { describe, it, expect, vi, beforeEach } from "vitest"

const { uploadFileMock, downloadFileMock, deleteFileMock } = vi.hoisted(() => ({
  uploadFileMock: vi.fn(),
  downloadFileMock: vi.fn(),
  deleteFileMock: vi.fn(),
}))

vi.mock("@/lib/s3", () => ({
  uploadFile: uploadFileMock,
  downloadFile: downloadFileMock,
  deleteFile: deleteFileMock,
  deleteFiles: vi.fn(),
}))

import { computeContentHash, getCachedPngs, putCachedPngs } from "@/lib/document-script/cache"

beforeEach(() => {
  uploadFileMock.mockReset()
  downloadFileMock.mockReset()
  deleteFileMock.mockReset()
})

describe("computeContentHash", () => {
  it("returns a stable 16-char prefix of sha256", () => {
    const h = computeContentHash("abc")
    expect(h).toBe("ba7816bf8f01cfea")  // sha256("abc") prefix
  })
})

describe("getCachedPngs", () => {
  it("returns null on cache miss (S3 404)", async () => {
    downloadFileMock.mockRejectedValue(Object.assign(new Error("not found"), { code: "NoSuchKey" }))
    const r = await getCachedPngs("art-1", "abc123")
    expect(r).toBeNull()
  })

  it("returns the manifest + page buffers on hit", async () => {
    const manifest = JSON.stringify({ pageCount: 2 })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    downloadFileMock
      .mockResolvedValueOnce(Buffer.from(manifest))
      .mockResolvedValueOnce(png)
      .mockResolvedValueOnce(png)
    const r = await getCachedPngs("art-1", "abc123")
    expect(r).not.toBeNull()
    expect(r!.length).toBe(2)
    expect(r![0]).toEqual(png)
  })
})

describe("putCachedPngs", () => {
  it("uploads manifest + each page to keyed S3 paths", async () => {
    uploadFileMock.mockResolvedValue({ key: "x", url: "", size: 0 })
    await putCachedPngs("art-1", "abc123", [
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]),
    ])
    expect(uploadFileMock).toHaveBeenCalledTimes(3)  // manifest + 2 pages
    const keys = uploadFileMock.mock.calls.map((c) => c[0])
    expect(keys).toContain("artifact-preview/art-1/abc123/manifest.json")
    expect(keys).toContain("artifact-preview/art-1/abc123/page-0.png")
    expect(keys).toContain("artifact-preview/art-1/abc123/page-1.png")
  })
})
