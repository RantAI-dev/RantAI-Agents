// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn(async () => undefined),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}))
vi.mock("@/lib/rag", () => ({
  indexArtifactContent: vi.fn(async () => undefined),
}))

import { updateArtifactTool } from "@/lib/tools/builtin/update-artifact"

const VALID_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>T</title></head><body><h1>Hi</h1></body></html>`

function makeExistingRow() {
  return {
    id: "x",
    title: "T",
    artifactType: "text/html",
    s3Key: "k",
    mimeType: "text/plain",
    content: VALID_HTML,
    updatedAt: new Date(),
    metadata: {},
    fileSize: 0,
  }
}

describe("update_artifact — failureReason on updated=false", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("attaches failureReason: 'not-found' when the target row is missing", async () => {
    const { prisma } = (await import("@/lib/prisma")) as unknown as {
      prisma: { document: { findUnique: ReturnType<typeof vi.fn> } }
    }
    prisma.document.findUnique.mockResolvedValueOnce(null)
    const result = (await updateArtifactTool.execute(
      { id: "missing-id", content: VALID_HTML },
      { userId: "u" },
    )) as { updated: boolean; failureReason?: string }
    expect(result.updated).toBe(false)
    expect(result.failureReason).toBe("not-found")
  })

  it("attaches failureReason: 'concurrent-update' when the optimistic-lock count is 0", async () => {
    const { prisma } = (await import("@/lib/prisma")) as unknown as {
      prisma: {
        document: {
          findUnique: ReturnType<typeof vi.fn>
          updateMany: ReturnType<typeof vi.fn>
        }
      }
    }
    prisma.document.findUnique.mockResolvedValueOnce(
      makeExistingRow() as unknown as never,
    )
    prisma.document.updateMany.mockResolvedValueOnce({ count: 0 })
    const result = (await updateArtifactTool.execute(
      { id: "x", content: VALID_HTML },
      { userId: "u" },
    )) as { updated: boolean; failureReason?: string }
    expect(result.updated).toBe(false)
    expect(result.failureReason).toBe("concurrent-update")
  })

  it("attaches failureReason: 'persistence' when S3 throws after validation passes", async () => {
    const { prisma } = (await import("@/lib/prisma")) as unknown as {
      prisma: { document: { findUnique: ReturnType<typeof vi.fn> } }
    }
    prisma.document.findUnique.mockResolvedValueOnce(
      makeExistingRow() as unknown as never,
    )
    const s3Mod = (await import("@/lib/s3")) as unknown as {
      uploadFile: ReturnType<typeof vi.fn>
    }
    // Use mockRejectedValue (not -Once): the tool calls uploadFile twice —
    // first to archive the previous version (silently swallowed by .catch),
    // then to upload the new content. Only the second reaching the outer
    // catch block triggers persisted=false.
    s3Mod.uploadFile.mockRejectedValue(new Error("InternalError"))
    const result = (await updateArtifactTool.execute(
      { id: "x", content: VALID_HTML },
      { userId: "u" },
    )) as { updated: boolean; failureReason?: string; content?: string }
    expect(result.updated).toBe(false)
    expect(result.failureReason).toBe("persistence")
    expect(result.content).toContain("Hi")
  })
})
