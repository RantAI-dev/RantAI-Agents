// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { resolveImagesMock, resolveSlideImagesMock } = vi.hoisted(() => ({
  resolveImagesMock: vi.fn(),
  resolveSlideImagesMock: vi.fn(),
}))

vi.mock("@/lib/unsplash", () => ({
  resolveImages: resolveImagesMock,
  resolveSlideImages: resolveSlideImagesMock,
}))

const { validateMock, formatErrorMock } = vi.hoisted(() => ({
  validateMock: vi.fn(),
  formatErrorMock: vi.fn(
    (type: string, v: { errors: string[] }) => `validation failed: ${v.errors.join(", ")}`,
  ),
}))

vi.mock("@/lib/tools/builtin/_validate-artifact", () => ({
  validateArtifactContent: validateMock,
  formatValidationError: formatErrorMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn().mockResolvedValue({ key: "k", url: "u" }),
  S3Paths: {
    artifact: (org: string | null, sid: string, id: string, ext: string) =>
      `artifacts/${org ?? "global"}/${sid}/${id}${ext}`,
  },
}))

vi.mock("@/lib/rag", () => ({
  indexArtifactContent: vi.fn().mockResolvedValue(undefined),
}))

import { createArtifactTool } from "@/lib/tools/builtin/create-artifact"

beforeEach(() => {
  resolveImagesMock.mockReset()
  resolveSlideImagesMock.mockReset()
  validateMock.mockReset()
})

describe("create_artifact — finalContent passed to HTML resolver", () => {
  it("passes the validator-rewritten content (not the original) to resolveImages", async () => {
    const RAW = '<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body data-marker="ORIGINAL"></body></html>'
    const REWRITTEN = '<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body data-marker="REWRITTEN-BY-VALIDATOR"></body></html>'
    validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [], content: REWRITTEN })
    resolveImagesMock.mockImplementation(async (s: string) => s)

    await createArtifactTool.execute(
      { title: "t", type: "text/html", content: RAW },
      {
        organizationId: "o-1",
        sessionId: "s-1",
        userId: "u-1",
        canvasMode: null,
      },
    )

    // Without the fix, resolveImages receives RAW and the rewrite is dropped.
    expect(resolveImagesMock).toHaveBeenCalledWith(REWRITTEN)
  })
})
