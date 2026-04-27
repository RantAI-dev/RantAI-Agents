import { describe, it, expect, vi, beforeEach } from "vitest"

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }))
vi.mock("@/lib/llm/generate", () => ({ generateScriptRewrite: generateMock }))

const { validateMock } = vi.hoisted(() => ({ validateMock: vi.fn() }))
vi.mock("@/lib/document-script/validator", () => ({
  validateScriptArtifact: validateMock,
}))

import { llmRewriteWithRetry } from "@/lib/document-script/llm-rewrite"

beforeEach(() => {
  generateMock.mockReset()
  validateMock.mockReset()
})

describe("llmRewriteWithRetry", () => {
  it("succeeds on first attempt when script validates", async () => {
    generateMock.mockResolvedValue("/* good */")
    validateMock.mockResolvedValue({ ok: true, errors: [] })
    const r = await llmRewriteWithRetry({ currentScript: "/* old */", editPrompt: "change" })
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(1)
  })

  it("retries on validation failure and feeds error back to LLM", async () => {
    generateMock
      .mockResolvedValueOnce("/* bad */")
      .mockResolvedValueOnce("/* still bad */")
      .mockResolvedValueOnce("/* good */")
    validateMock
      .mockResolvedValueOnce({ ok: false, errors: ["syntax error"] })
      .mockResolvedValueOnce({ ok: false, errors: ["bad output"] })
      .mockResolvedValueOnce({ ok: true, errors: [] })
    const r = await llmRewriteWithRetry({ currentScript: "/* old */", editPrompt: "change" })
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(3)
    expect(generateMock.mock.calls[1][0].editPrompt).toMatch(/syntax error/)
    expect(generateMock.mock.calls[2][0].editPrompt).toMatch(/bad output/)
  })

  it("gives up after 3 attempts (1 initial + 2 retries)", async () => {
    generateMock.mockResolvedValue("/* always bad */")
    validateMock.mockResolvedValue({ ok: false, errors: ["nope"] })
    const r = await llmRewriteWithRetry({ currentScript: "/* old */", editPrompt: "change" })
    expect(r.ok).toBe(false)
    expect(r.attempts).toBe(3)
    expect(r.error).toMatch(/3 attempts/)
  })
})
