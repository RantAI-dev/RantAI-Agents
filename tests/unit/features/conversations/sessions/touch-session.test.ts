// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    dashboardMessage: {
      findMany: vi.fn(),
      upsert: vi.fn((args: { create: { id: string } }) => ({ id: args.create.id })),
      create: vi.fn((args: { data: unknown }) => args.data),
    },
    dashboardSession: { updateMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

import { createDashboardMessages } from "@/features/conversations/sessions/repository"

describe("createDashboardMessages bumps the session's last activity (QA CHAT-015)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.dashboardMessage.findMany.mockResolvedValue([])
    prismaMock.dashboardSession.updateMany.mockResolvedValue({ count: 1 })
  })

  it("touches updatedAt on the session the messages were added to", async () => {
    const result = await createDashboardMessages([
      { id: "m1", sessionId: "s1", role: "user", content: "hi" },
      { id: "m2", sessionId: "s1", role: "assistant", content: "hello" },
    ])
    // positive control: the messages themselves are still returned
    expect(result).toEqual([{ id: "m1" }, { id: "m2" }])
    expect(prismaMock.dashboardSession.updateMany).toHaveBeenCalledTimes(1)
    const call = prismaMock.dashboardSession.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: { in: ["s1"] } })
    expect(call.data.updatedAt).toBeInstanceOf(Date)
  })

  it("a failing touch never fails message creation", async () => {
    prismaMock.dashboardSession.updateMany.mockRejectedValueOnce(new Error("db hiccup"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(
      createDashboardMessages([{ id: "m1", sessionId: "s1", role: "user", content: "hi" }]),
    ).resolves.toEqual([{ id: "m1" }])
    spy.mockRestore()
  })
})
