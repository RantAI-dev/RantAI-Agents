import { describe, it, expect, vi, beforeEach } from "vitest"

const { uploadFileMock, downloadFileMock } = vi.hoisted(() => ({
  uploadFileMock: vi.fn().mockResolvedValue({ key: "x", url: "", size: 0 }),
  downloadFileMock: vi.fn().mockRejectedValue(Object.assign(new Error("nf"), { code: "NoSuchKey" })),
}))
vi.mock("@/lib/s3", () => ({
  uploadFile: uploadFileMock,
  downloadFile: downloadFileMock,
  deleteFile: vi.fn(),
  deleteFiles: vi.fn(),
}))

import { renderArtifactPreview } from "@/lib/rendering/server/docx-preview-pipeline"

const VALID_SCRIPT = `
  import { Document, Paragraph, TextRun, Packer } from "docx"
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("hello")] })] }] })
  Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
`

beforeEach(() => {
  uploadFileMock.mockClear()
  downloadFileMock.mockClear()
})

describe("renderArtifactPreview", () => {
  it("runs the full pipeline and caches the result", async () => {
    const r = await renderArtifactPreview("art-1", VALID_SCRIPT)
    expect(r.pages.length).toBeGreaterThanOrEqual(1)
    expect(r.pages[0].subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    // Manifest + at least 1 page uploaded
    expect(uploadFileMock).toHaveBeenCalledTimes(1 + r.pages.length)
  }, 60_000)
})
