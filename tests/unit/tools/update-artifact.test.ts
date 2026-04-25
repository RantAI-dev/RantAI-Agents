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

describe("update_artifact tool", () => {
  describe("Fix #23 — missing artifact", () => {
    it("returns updated:false with error when the artifact does not exist", async () => {
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

  describe("Fix #6 — canvas-mode lock", () => {
    it("rejects when canvas-mode is locked to a different type", async () => {
      findUniqueMock.mockResolvedValue({
        id: "art-1",
        artifactType: "application/react",
        title: "old",
        content: "old",
        s3Key: null,
        metadata: null,
        mimeType: null,
        updatedAt: new Date(2026, 0, 1),
      })

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

    it("allows updates when canvas-mode is auto, null, or matches the artifact type", async () => {
      findUniqueMock.mockResolvedValue({
        id: "art-2",
        artifactType: "text/html",
        title: "old",
        content: "old",
        s3Key: null,
        metadata: null,
        mimeType: null,
        updatedAt: new Date(2026, 0, 1),
      })
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-2", content: "<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body></body></html>" },
        { ...baseContext, canvasMode: "text/html" },
      )

      expect(result.updated).toBe(true)
    })
  })

  describe("NEW-2 — optimistic locking", () => {
    it("returns persisted:false when a concurrent writer changed the row mid-update", async () => {
      const oldUpdatedAt = new Date(2026, 0, 1)
      findUniqueMock.mockResolvedValue({
        id: "art-lock",
        artifactType: "text/html",
        title: "old",
        content: "<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body></body></html>",
        s3Key: "artifacts/o-1/s-1/art-lock.html",
        metadata: null,
        mimeType: null,
        updatedAt: oldUpdatedAt,
      })
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      // Simulate another writer having changed the row — our updateMany
      // returns count === 0 because the WHERE updatedAt = oldUpdatedAt
      // no longer matches.
      updateManyMock.mockResolvedValue({ count: 0 })

      const result = await updateArtifactTool.execute(
        { id: "art-lock", content: "<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body>fresh</body></html>" },
        baseContext,
      )

      expect(result.persisted).toBe(false)
      expect(result.error).toMatch(/concurrent|conflict|stale/i)
    })

    it("succeeds when updateMany matches exactly one row", async () => {
      const oldUpdatedAt = new Date(2026, 0, 1)
      findUniqueMock.mockResolvedValue({
        id: "art-ok",
        artifactType: "text/html",
        title: "old",
        content: "<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body></body></html>",
        s3Key: null,
        metadata: null,
        mimeType: null,
        updatedAt: oldUpdatedAt,
      })
      validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-ok", content: "<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body>v2</body></html>" },
        baseContext,
      )

      expect(result.updated).toBe(true)
      expect(result.persisted).toBe(true)
    })
  })

  describe("Fix #2 — Document AST validation.content not discarded", () => {
    it("persists validation.content (the resolved AST) for text/document", async () => {
      findUniqueMock.mockResolvedValue({
        id: "art-3",
        artifactType: "text/document",
        title: "old",
        content: "old",
        s3Key: "artifacts/o-1/s-1/art-3.docx",
        metadata: null,
        mimeType: "text/plain",
        updatedAt: new Date(2026, 0, 1),
      })
      const RAW_CONTENT = '{"meta":{"title":"x"},"body":[{"type":"image","src":"unsplash:mountain","alt":"a","width":100,"height":100}]}'
      const RESOLVED_CONTENT = '{"meta":{"title":"x"},"body":[{"type":"image","src":"https://example.com/resolved.jpg","alt":"a","width":100,"height":100}]}'
      validateMock.mockResolvedValue({
        ok: true,
        errors: [],
        warnings: [],
        content: RESOLVED_CONTENT,
      })
      updateManyMock.mockResolvedValue({ count: 1 })

      const result = await updateArtifactTool.execute(
        { id: "art-3", content: RAW_CONTENT },
        baseContext,
      )

      expect(result.updated).toBe(true)
      expect(updateManyMock).toHaveBeenCalledOnce()
      const updateArgs = updateManyMock.mock.calls[0][0]
      // The Prisma update must persist the resolved content, not the raw input.
      expect(updateArgs.data.content).toBe(RESOLVED_CONTENT)
    })
  })
})
