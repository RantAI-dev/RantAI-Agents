import { beforeEach, describe, expect, it, vi } from "vitest"

const findFirstMock = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dashboardSession: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
    },
  },
}))

import { validateOwnedSessionId } from "@/features/chat-public/repository"

describe("validateOwnedSessionId", () => {
  beforeEach(() => {
    findFirstMock.mockReset()
  })

  it("returns the id when the session exists for the user", async () => {
    findFirstMock.mockResolvedValue({ id: "sess_1" })
    await expect(
      validateOwnedSessionId("sess_1", "user_1")
    ).resolves.toBe("sess_1")
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: "sess_1", userId: "user_1" },
      select: { id: true },
    })
  })

  it("returns null when no row matches (deleted session, foreign user, or never persisted)", async () => {
    findFirstMock.mockResolvedValue(null)
    await expect(
      validateOwnedSessionId("sess_stale", "user_1")
    ).resolves.toBeNull()
  })

  it("short-circuits without a DB hit when sessionId is undefined", async () => {
    await expect(
      validateOwnedSessionId(undefined, "user_1")
    ).resolves.toBeNull()
    expect(findFirstMock).not.toHaveBeenCalled()
  })

  it("short-circuits without a DB hit when sessionId is empty string", async () => {
    await expect(validateOwnedSessionId("", "user_1")).resolves.toBeNull()
    expect(findFirstMock).not.toHaveBeenCalled()
  })
})
