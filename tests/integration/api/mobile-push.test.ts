import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mobilePushToken: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    mobileSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock("@/lib/organization", () => ({
  getOrganizationContextWithFallback: vi
    .fn()
    .mockResolvedValue({ organizationId: "org_1" }),
}))
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }))

import { prisma } from "@/lib/prisma"
import { signAccessToken } from "@/lib/auth-mobile"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MOBILE_JWT_SECRET = "test-secret-32-bytes-of-random-data!!"
  process.env.MOBILE_JWT_ACCESS_TTL = "900"
  // requireUserAndOrg fires-and-forgets a lastUsedAt update; needs a Promise.
  ;(prisma.mobileSession.update as any).mockResolvedValue({})
})

async function authedRequest(url: string, body: any) {
  ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
    id: "sess_1",
    userId: "user_1",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: "user_1" },
  })
  const token = await signAccessToken({ userId: "user_1", sessionId: "sess_1" })
  return new Request(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/mobile/push/register", () => {
  it("upserts a push token", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ id: "push_1" })
    ;(prisma.mobilePushToken.upsert as any) = upsertMock
    const { POST } = await import("@/app/api/mobile/push/register/route")
    const req = await authedRequest("http://localhost/api/mobile/push/register", {
      deviceId: "d1",
      expoPushToken: "ExponentPushToken[xyz]",
      platform: "ios",
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalled()
  })

  it("rejects unauth", async () => {
    const { POST } = await import("@/app/api/mobile/push/register/route")
    const req = new Request("http://localhost/api/mobile/push/register", {
      method: "POST",
      body: JSON.stringify({ deviceId: "d1", expoPushToken: "x", platform: "ios" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
