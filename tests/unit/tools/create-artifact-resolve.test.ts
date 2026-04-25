// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

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

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn().mockResolvedValue({}),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      create: createMock,
    },
  },
}))

vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn().mockResolvedValue({ key: "k", url: "u" }),
  S3Paths: {
    artifact: (org: string | null, sid: string, id: string, ext: string) =>
      `artifacts/${org ?? "global"}/${sid}/${id}${ext}`,
  },
  getArtifactExtension: () => ".html",
}))

vi.mock("@/lib/rag", () => ({
  indexArtifactContent: vi.fn().mockResolvedValue(undefined),
}))

import { createArtifactTool } from "@/lib/tools/builtin/create-artifact"

beforeEach(() => {
  validateMock.mockReset()
  createMock.mockReset()
  createMock.mockResolvedValue({})
})

describe("create_artifact — persists validation.content as the final content", () => {
  it("persists the validator-rewritten content (not the raw input) for HTML", async () => {
    const RAW = '<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body><img src="unsplash:cat" alt="c"></body></html>'
    const REWRITTEN = '<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body><img src="https://example.com/cat.jpg" alt="c"></body></html>'
    validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [], content: REWRITTEN })

    const result = await createArtifactTool.execute(
      { title: "t", type: "text/html", content: RAW },
      {
        organizationId: "o-1",
        sessionId: "s-1",
        userId: "u-1",
        canvasMode: null,
      },
    )

    expect(result.content).toBe(REWRITTEN)
    expect(createMock).toHaveBeenCalledOnce()
    expect(createMock.mock.calls[0][0].data.content).toBe(REWRITTEN)
  })

  it("falls back to raw content when the validator returns no rewrite", async () => {
    const RAW = '<!doctype html><html><head><title>x</title><meta name=viewport content=x></head><body></body></html>'
    validateMock.mockResolvedValue({ ok: true, errors: [], warnings: [] })

    const result = await createArtifactTool.execute(
      { title: "t", type: "text/html", content: RAW },
      {
        organizationId: "o-1",
        sessionId: "s-1",
        userId: "u-1",
        canvasMode: null,
      },
    )

    expect(result.content).toBe(RAW)
  })
})
