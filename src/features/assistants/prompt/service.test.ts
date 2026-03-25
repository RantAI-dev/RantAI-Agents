import { beforeEach, describe, expect, it, vi } from "vitest"
import { generateAssistantPrompt } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  generateAssistantPromptText: vi.fn(),
}))

describe("assistants-prompt service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("parses structured generator output", async () => {
    vi.mocked(repository.generateAssistantPromptText).mockResolvedValue(
      [
        "NAME: Sales Assistant",
        "EMOJI: 📈",
        "PROMPT:",
        "## Goal",
        "Help convert leads.",
      ].join("\n")
    )

    const result = await generateAssistantPrompt({
      description: "assistant for sales",
    })

    expect(result).toEqual({
      suggestedName: "Sales Assistant",
      suggestedEmoji: "📈",
      systemPrompt: "## Goal\nHelp convert leads.",
    })
  })

  it("falls back when structured tokens are missing", async () => {
    vi.mocked(repository.generateAssistantPromptText).mockResolvedValue("Just prompt body")

    const result = await generateAssistantPrompt({
      description: "assistant for support",
    })

    expect(result).toEqual({
      suggestedName: "",
      suggestedEmoji: "🤖",
      systemPrompt: "Just prompt body",
    })
  })
})
