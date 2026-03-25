import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  removeSystemDefaultAssistant,
  setSystemDefaultAssistant,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  clearSystemDefaultAssistants: vi.fn(),
  findAssistantById: vi.fn(),
  setAssistantSystemDefault: vi.fn(),
  unsetAssistantSystemDefault: vi.fn(),
}))

describe("assistants-default service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when setting default for missing assistant", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue(null)

    const result = await setSystemDefaultAssistant("assistant_1")

    expect(result).toEqual({ status: 404, error: "Assistant not found" })
  })

  it("returns 400 when removing default from non-default assistant", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue({
      id: "assistant_1",
      isSystemDefault: false,
    } as Awaited<ReturnType<typeof repository.findAssistantById>>)

    const result = await removeSystemDefaultAssistant("assistant_1")

    expect(result).toEqual({
      status: 400,
      error: "This assistant is not the system default",
    })
  })
})
