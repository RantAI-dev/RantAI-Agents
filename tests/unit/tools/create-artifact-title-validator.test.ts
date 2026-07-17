// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn(async () => undefined),
  S3Paths: { artifact: () => "mock-key" },
  getArtifactExtension: () => "html",
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { create: vi.fn(async () => ({ id: "doc-id" })) } },
}))
vi.mock("@/lib/rag", () => ({
  indexArtifactContent: vi.fn(async () => undefined),
}))

import { createArtifactTool } from "@/lib/tools/builtin/create-artifact"

const VALID_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>T</title></head><body><h1>Hi</h1></body></html>`

describe("create_artifact — title validator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects the literal title 'Snippet' with failureReason=validation", async () => {
    const result = (await createArtifactTool.execute(
      { title: "Snippet", type: "text/html", content: VALID_HTML },
      { userId: "u" },
    )) as { persisted: boolean; failureReason?: string; error?: string }
    expect(result.persisted).toBe(false)
    expect(result.failureReason).toBe("validation")
    expect(result.error).toMatch(/title/i)
  })

  it("rejects other common LLM-lazy titles (Untitled, Example, Code, Test, Document, Output, Result)", async () => {
    const lazyTitles = ["Untitled", "Example", "Code", "Test", "Document", "Output", "Result"]
    for (const title of lazyTitles) {
      const result = (await createArtifactTool.execute(
        { title, type: "text/html", content: VALID_HTML },
        { userId: "u" },
      )) as { persisted: boolean; failureReason?: string }
      expect(result.persisted, `title "${title}" should be rejected`).toBe(false)
      expect(result.failureReason).toBe("validation")
    }
  })

  it("rejects whitespace-only / empty / very-short titles", async () => {
    for (const title of ["", "   ", "a", "Hi"]) {
      const result = (await createArtifactTool.execute(
        { title, type: "text/html", content: VALID_HTML },
        { userId: "u" },
      )) as { persisted: boolean; failureReason?: string }
      expect(result.persisted, `title "${title}" should be rejected`).toBe(false)
      expect(result.failureReason).toBe("validation")
    }
  })

  it("is case-insensitive — 'snippet', 'SNIPPET', 'sNiPpEt' all rejected", async () => {
    for (const title of ["snippet", "SNIPPET", "sNiPpEt"]) {
      const result = (await createArtifactTool.execute(
        { title, type: "text/html", content: VALID_HTML },
      { userId: "u" },
    )) as { persisted: boolean; failureReason?: string }
      expect(result.persisted, `title "${title}" should be rejected`).toBe(false)
      expect(result.failureReason).toBe("validation")
    }
  })

  it("accepts descriptive multi-word titles", async () => {
    const goodTitles = [
      "Tip calculator with tax breakdown",
      "Fibonacci sequence visualizer",
      "Hello world page",
      "Login form with email validation",
    ]
    for (const title of goodTitles) {
      const result = (await createArtifactTool.execute(
        { title, type: "text/html", content: VALID_HTML },
        { userId: "u" },
      )) as { persisted: boolean; failureReason?: string }
      expect(result.persisted, `title "${title}" should pass`).toBe(true)
      expect(result.failureReason).toBeUndefined()
    }
  })

  it("accepts single-word titles that are domain-specific (not in the lazy-title blocklist)", async () => {
    // Legitimate single-word titles like product names, scientific terms, etc.
    // shouldn't be blocked. The validator targets known LLM defaults, not all
    // single words. "Fibonacci" or "Pythagoras" are descriptive enough.
    for (const title of ["Fibonacci", "Pythagoras", "Mandelbrot"]) {
      const result = (await createArtifactTool.execute(
        { title, type: "text/html", content: VALID_HTML },
        { userId: "u" },
      )) as { persisted: boolean; failureReason?: string }
      expect(result.persisted, `title "${title}" should pass`).toBe(true)
    }
  })
})
