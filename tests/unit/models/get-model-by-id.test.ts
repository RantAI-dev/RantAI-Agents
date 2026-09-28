import { beforeEach, describe, expect, it, vi } from "vitest"

const { findFirstMock, findManyMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  findManyMock: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { llmModel: { findFirst: findFirstMock, findMany: findManyMock } },
}))

import { DEFAULT_MODEL_ID, getModelByIdAsync } from "@/lib/models"

// QA CHAT-057/058: every chat request loaded the whole active model catalogue
// to look up one id. It must be a single-row query now.
describe("getModelByIdAsync", () => {
  beforeEach(() => {
    findFirstMock.mockReset()
    findManyMock.mockReset()
  })

  it("looks up one active row and never loads the catalogue", async () => {
    findFirstMock.mockResolvedValue({
      id: "openai/gpt-x",
      name: "GPT X",
      provider: "OpenAI",
      description: "",
      contextWindow: 128000,
      pricingInput: 1,
      pricingOutput: 2,
      hasVision: true,
      hasToolCalling: true,
      hasStreaming: true,
    })

    const model = await getModelByIdAsync("openai/gpt-x")

    expect(findFirstMock).toHaveBeenCalledWith({ where: { id: "openai/gpt-x", isActive: true } })
    expect(findManyMock).not.toHaveBeenCalled()
    expect(model?.capabilities).toEqual({ vision: true, functionCalling: true, streaming: true })
  })

  it("falls back to the static list when the row is missing (control)", async () => {
    findFirstMock.mockResolvedValue(null)
    const model = await getModelByIdAsync(DEFAULT_MODEL_ID)
    expect(model?.id).toBe(DEFAULT_MODEL_ID)
    expect(findManyMock).not.toHaveBeenCalled()
  })
})
