import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mobilePushToken: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

import { prisma } from "@/lib/prisma"

beforeEach(() => {
  vi.restoreAllMocks()
  ;(prisma.mobilePushToken.findMany as any).mockResolvedValue([])
})

describe("sendPushToUser", () => {
  it("returns silently when the user has no tokens", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))
    const { sendPushToUser } = await import("@/lib/push/sender")
    await sendPushToUser("u1", { title: "t", body: "b" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts to Expo Push with all of the user's tokens", async () => {
    ;(prisma.mobilePushToken.findMany as any).mockResolvedValue([
      { id: "p1", expoPushToken: "ExponentPushToken[a]" },
      { id: "p2", expoPushToken: "ExponentPushToken[b]" },
    ])
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: "ok" }, { status: "ok" }] }), {
        status: 200,
      }),
    )
    const { sendPushToUser } = await import("@/lib/push/sender")
    await sendPushToUser("u1", { title: "Hello", body: "World" })
    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toHaveLength(2)
    expect(body[0].title).toBe("Hello")
  })

  it("revokes DeviceNotRegistered tokens", async () => {
    ;(prisma.mobilePushToken.findMany as any).mockResolvedValue([
      { id: "p1", expoPushToken: "ExponentPushToken[gone]" },
    ])
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "error", details: { error: "DeviceNotRegistered" } },
          ],
        }),
        { status: 200 },
      ),
    )
    const { sendPushToUser } = await import("@/lib/push/sender")
    await sendPushToUser("u1", { title: "t", body: "b" })
    expect(prisma.mobilePushToken.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { revokedAt: expect.any(Date) },
    })
  })

  it("never throws on network failure (fire-and-forget)", async () => {
    ;(prisma.mobilePushToken.findMany as any).mockResolvedValue([
      { id: "p1", expoPushToken: "x" },
    ])
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    const { sendPushToUser } = await import("@/lib/push/sender")
    await expect(sendPushToUser("u1", { title: "t", body: "b" })).resolves.toBeUndefined()
  })
})
