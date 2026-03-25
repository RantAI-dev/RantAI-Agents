import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveDefaultAssistant } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findAssistantById: vi.fn(),
  findFallbackBuiltInAssistant: vi.fn(),
  findSystemDefaultAssistant: vi.fn(),
  findUserPreferenceByUserId: vi.fn(),
}))

describe("user-default-assistant service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("prefers user default assistant when available", async () => {
    vi.mocked(repository.findUserPreferenceByUserId).mockResolvedValue({
      userId: "user_1",
      defaultAssistantId: "assistant_user",
    } as never)
    vi.mocked(repository.findAssistantById).mockResolvedValue({ id: "assistant_user" } as never)

    const result = await resolveDefaultAssistant("user_1")

    expect(result).toEqual({
      assistant: { id: "assistant_user" },
      source: "user",
    })
  })

  it("falls back to system default when user default is unavailable", async () => {
    vi.mocked(repository.findUserPreferenceByUserId).mockResolvedValue({
      userId: "user_1",
      defaultAssistantId: "missing",
    } as never)
    vi.mocked(repository.findAssistantById).mockResolvedValue(null)
    vi.mocked(repository.findSystemDefaultAssistant).mockResolvedValue({ id: "assistant_system" } as never)

    const result = await resolveDefaultAssistant("user_1")

    expect(result).toEqual({
      assistant: { id: "assistant_system" },
      source: "system",
    })
  })
})
