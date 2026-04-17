import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "http://test", sentryDsn: null } }))

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("conversationsApi.list", () => {
  it("hits /api/conversations and returns the list", async () => {
    const { useAuthStore } = await import("@/auth/use-auth-store")
    useAuthStore.setState({
      accessToken: "tok",
      activeAccount: { id: "a", email: "x@y.z", name: "X", refreshToken: "r" },
    })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ conversations: [{ id: "c1", sessionId: "s1" }] }), {
        status: 200,
      }),
    )
    const { conversationsApi } = await import("@/api/conversations")
    const res = await conversationsApi.list()
    expect(res.conversations[0].id).toBe("c1")
    expect(fetchMock).toHaveBeenCalledWith(
      "http://test/api/conversations",
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })
})
