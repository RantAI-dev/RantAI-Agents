// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn(async () => undefined),
  S3Paths: { artifact: () => "mock-key" },
  getArtifactExtension: () => "html",
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      create: vi.fn(async () => ({ id: "doc-id" })),
    },
  },
}))
vi.mock("@/lib/rag", () => ({
  indexArtifactContent: vi.fn(async () => undefined),
}))

import { createArtifactTool } from "@/lib/tools/builtin/create-artifact"

describe("create_artifact — failureReason on persisted=false", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("attaches failureReason: 'size' when content exceeds the size limit", async () => {
    const huge = "x".repeat(513 * 1024) // 513 KB > 512 KB MAX
    const result = (await createArtifactTool.execute(
      { title: "Big", type: "text/html", content: huge },
      { userId: "u" },
    )) as { persisted: boolean; failureReason?: string }
    expect(result.persisted).toBe(false)
    expect(result.failureReason).toBe("size")
  })

  it("attaches failureReason: 'canvas-mode-mismatch' when canvas mode locks a different type", async () => {
    const result = (await createArtifactTool.execute(
      { title: "X", type: "text/html", content: "<p>ok</p>" },
      { userId: "u", canvasMode: "application/code" },
    )) as { persisted: boolean; failureReason?: string }
    expect(result.persisted).toBe(false)
    expect(result.failureReason).toBe("canvas-mode-mismatch")
  })

  it("attaches failureReason: 'missing-language' when application/code omits language", async () => {
    const result = (await createArtifactTool.execute(
      { title: "X", type: "application/code", content: "print('hi')" },
      { userId: "u" },
    )) as { persisted: boolean; failureReason?: string }
    expect(result.persisted).toBe(false)
    expect(result.failureReason).toBe("missing-language")
  })

  it("attaches failureReason: 'validation' when structural validation fails", async () => {
    // text/html with mismatched/unclosed tags — validator-known failure mode.
    const broken = "<html><body><p>unclosed"
    const result = (await createArtifactTool.execute(
      { title: "Broken", type: "text/html", content: broken },
      { userId: "u" },
    )) as { persisted: boolean; failureReason?: string }
    expect(result.persisted).toBe(false)
    expect(result.failureReason).toBe("validation")
  })

  it("attaches failureReason: 'persistence' when S3 throws and Prisma is never reached", async () => {
    const s3Mod = (await import("@/lib/s3")) as unknown as {
      uploadFile: ReturnType<typeof vi.fn>
    }
    s3Mod.uploadFile.mockRejectedValueOnce(
      Object.assign(
        new Error("We encountered an internal error, please try again."),
        { Code: "InternalError", $fault: "server" },
      ),
    )
    const result = (await createArtifactTool.execute(
      { title: "T", type: "text/html", content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>T</title></head><body><h1>Hi</h1></body></html>` },
      { userId: "u" },
    )) as { persisted: boolean; failureReason?: string; content?: string }
    expect(result.persisted).toBe(false)
    expect(result.failureReason).toBe("persistence")
    // Critical: content is preserved so the client can keep it ephemerally.
    expect(result.content).toContain("Hi")
  })

  it("does NOT attach failureReason on the happy path", async () => {
    const result = (await createArtifactTool.execute(
      { title: "T", type: "text/html", content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>T</title></head><body><h1>Hi</h1></body></html>` },
      { userId: "u" },
    )) as { persisted: boolean; failureReason?: string }
    expect(result.persisted).toBe(true)
    expect(result.failureReason).toBeUndefined()
  })
})
