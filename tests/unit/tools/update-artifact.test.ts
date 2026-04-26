// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { findUniqueMock, updateMock, updateManyMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  updateManyMock: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: findUniqueMock,
      update: updateMock,
      updateMany: updateManyMock,
    },
  },
}))

vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn().mockResolvedValue({ key: "k", url: "u" }),
}))

vi.mock("@/lib/rag", () => ({
  indexArtifactContent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/unsplash", () => ({
  resolveImages: vi.fn(async (s: string) => s.replace(/unsplash:[^"]+/g, "https://example.com/img.jpg")),
  resolveSlideImages: vi.fn(async (s: string) => s),
}))

const { validateMock, formatErrorMock } = vi.hoisted(() => ({
  validateMock: vi.fn(),
  formatErrorMock: vi.fn(
    (type: string, v: { errors: string[] }) =>
      `validation failed: ${v.errors.join(", ")}`,
  ),
}))

vi.mock("@/lib/tools/builtin/_validate-artifact", () => ({
  validateArtifactContent: validateMock,
  formatValidationError: formatErrorMock,
}))

import { updateArtifactTool } from "@/lib/tools/builtin/update-artifact"

beforeEach(() => {
  findUniqueMock.mockReset()
  updateMock.mockReset()
  updateManyMock.mockReset()
  validateMock.mockReset()
})

const baseContext = {
  organizationId: "o-1",
  sessionId: "s-1",
  userId: "u-1",
  canvasMode: null,
} as const

const HTML_DOC = '<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body></body></html>'

/** Builds an existing-artifact row the way `prisma.document.findUnique` would
 *  return it, so each test only needs to override the field it cares about. */
function existingArtifact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "art",
    artifactType: "text/html",
    title: "old",
    content: HTML_DOC,
    s3Key: null,
    metadata: null,
    mimeType: null,
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  }
}

describe("update_artifact tool", () => {
  describe("missing-artifact early return", () => {
    it("returns updated:false when the artifact does not exist", async () => {
      findUniqueMock.mockResolvedValue(null)

      const result = await updateArtifactTool.execute(
        { id: "missing-id", content: "hi" },
        baseContext,
      )

      expect(result.updated).toBe(false)
      expect(result.persisted).toBe(false)
      expect(result.error).toMatch(/not found/i)
      expect(updateMock).not.toHaveBeenCalled()
    })
  })

  describe("canvas-mode lock", () => {
    it("rejects when canvas-mode is locked to a different type", async () => {
      findUniqueMock.mockResolvedValue(
        existingArtifact({ artifactType: "application/react" }),
      )

      const result = await updateArtifactTool.execute(
        { id: "art-1", content: "new" },
        { ...baseContext, canvasMode: "text/html" },
      )

      expect(result.updated).toBe(false)
      expect(result.persisted).toBe(false)
      expect(result.error).toMatch(/canvas mode is locked/i)
      expect(validateMock).not.toHaveBeenCalled()
      expect(updateManyMock).not.toHaveBeenCalled()
    })

    it("allows updates when canvas-mode matches the artifact type", async () => {
      findUniqueMock.mockResolvedValue(existingArtifact({ artifactType: "text/html" }))
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-2", content: HTML_DOC },
        { ...baseContext, canvasMode: "text/html" },
      )

      expect(result.updated).toBe(true)
    })

    it("rejects untyped artifacts (artifactType=null) under any non-auto canvas mode", async () => {
      // The earlier guard short-circuited on `existing.artifactType &&`, so a
      // legacy/untyped Document silently slipped past the lock and could be
      // overwritten with content of any type. Now an untyped row rejects every
      // canvas mode that isn't auto / null.
      findUniqueMock.mockResolvedValue(existingArtifact({ artifactType: null }))

      const result = await updateArtifactTool.execute(
        { id: "art-untyped", content: "anything" },
        { ...baseContext, canvasMode: "text/html" },
      )

      expect(result.updated).toBe(false)
      expect(result.error).toMatch(/canvas mode is locked/i)
      expect(result.error).toMatch(/untyped/i)
      expect(validateMock).not.toHaveBeenCalled()
      expect(updateManyMock).not.toHaveBeenCalled()
    })

    it("allows untyped artifacts to update when canvas-mode is null or auto", async () => {
      findUniqueMock.mockResolvedValue(existingArtifact({ artifactType: null }))
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-untyped-auto", content: "anything" },
        { ...baseContext, canvasMode: "auto" },
      )

      expect(result.updated).toBe(true)
    })
  })

  describe("optimistic locking", () => {
    it("returns persisted:false when a concurrent writer changed the row mid-update", async () => {
      const oldUpdatedAt = new Date(2026, 0, 1)
      findUniqueMock.mockResolvedValue(
        existingArtifact({ s3Key: "artifacts/o-1/s-1/art-lock.html", updatedAt: oldUpdatedAt }),
      )
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      // The other writer's commit invalidated `updatedAt = oldUpdatedAt`, so
      // updateMany matches zero rows.
      updateManyMock.mockResolvedValue({ count: 0 })

      const result = await updateArtifactTool.execute(
        { id: "art-lock", content: HTML_DOC },
        baseContext,
      )

      expect(result.updated).toBe(false)
      expect(result.persisted).toBe(false)
      expect(result.error).toMatch(/concurrent|conflict|stale/i)
    })

    it("succeeds when updateMany matches exactly one row", async () => {
      findUniqueMock.mockResolvedValue(existingArtifact())
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-ok", content: HTML_DOC },
        baseContext,
      )

      expect(result.updated).toBe(true)
      expect(result.persisted).toBe(true)
    })
  })

  describe("validation.content rewrite is persisted", () => {
    it("writes the validator's resolved content for text/document, not the raw input", async () => {
      findUniqueMock.mockResolvedValue(
        existingArtifact({
          artifactType: "text/document",
          s3Key: "artifacts/o-1/s-1/art-3.docx",
          mimeType: "text/plain",
        }),
      )
      const RAW = '{"meta":{"title":"x"},"body":[{"type":"image","src":"unsplash:mountain","alt":"a","width":100,"height":100}]}'
      const RESOLVED = '{"meta":{"title":"x"},"body":[{"type":"image","src":"https://example.com/resolved.jpg","alt":"a","width":100,"height":100}]}'
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [], content: RESOLVED })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-3", content: RAW },
        baseContext,
      )

      expect(result.updated).toBe(true)
      expect(updateManyMock).toHaveBeenCalledOnce()
      const updateArgs = updateManyMock.mock.calls[0][0]
      expect(updateArgs.data.content).toBe(RESOLVED)
    })
  })

  describe("title fallback in tool result", () => {
    it("returns the existing stored title when the caller omits a title change", async () => {
      // Without this fallback the tool emits `title: undefined` (serializes as
      // JSON-absent), leaving the LLM unable to recall the artifact's actual
      // current title from its own tool result.
      findUniqueMock.mockResolvedValue(existingArtifact({ title: "Stored title" }))
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-title", content: HTML_DOC },
        baseContext,
      )

      expect(result.title).toBe("Stored title")
    })

    it("returns the new title when the caller does request a change", async () => {
      findUniqueMock.mockResolvedValue(existingArtifact({ title: "Stored title" }))
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-title", title: "New title", content: HTML_DOC },
        baseContext,
      )

      expect(result.title).toBe("New title")
    })
  })
})
