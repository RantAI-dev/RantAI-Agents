import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "http://test", sentryDsn: null } }))

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("apiFetch", () => {
  it("attaches Bearer header when access token present", async () => {
    const { useAuthStore } = await import("@/auth/use-auth-store")
    useAuthStore.setState({
      accessToken: "tok",
      activeAccount: { id: "a1", email: "x@y", name: "X", refreshToken: "rt" },
    })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const { apiFetch } = await import("@/api/client")
    await apiFetch("/api/mobile/x")
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers
    expect(headers.get("authorization")).toBe("Bearer tok")
  })

  it("retries once after 401 with refreshed token", async () => {
    const { useAuthStore } = await import("@/auth/use-auth-store")
    useAuthStore.setState({
      accessToken: "stale",
      activeAccount: { id: "a1", email: "x@y", name: "X", refreshToken: "rt-old" },
    })
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("nope", { status: 401 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ accessToken: "new", refreshToken: "rt-new" }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { apiFetch } = await import("@/api/client")
    const out = await apiFetch<{ ok: true }>("/api/mobile/x")
    expect(out.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(useAuthStore.getState().accessToken).toBe("new")
  })
})
