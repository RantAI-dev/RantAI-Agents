import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getUserPreferences,
  updateUserPreferences,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findUserPreferencesByUserId: vi.fn(),
  findAssistantById: vi.fn(),
  upsertUserPreferences: vi.fn(),
}))

describe("user-preferences service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns fallback preferences when no row exists", async () => {
    vi.mocked(repository.findUserPreferencesByUserId).mockResolvedValue(null)

    const result = await getUserPreferences("user_1")

    expect(result).toEqual({
      userId: "user_1",
      defaultAssistantId: null,
      sidebarConfig: null,
    })
  })

  it("returns 404 when provided default assistant does not exist", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue(null)

    const result = await updateUserPreferences("user_1", {
      defaultAssistantId: "missing",
    })

    expect(result).toEqual({ status: 404, error: "Assistant not found" })
  })
})
