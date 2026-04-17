import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mobileSession: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { signAccessToken } from "@/lib/auth-mobile"
import { getUserId } from "@/lib/get-user-id"

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.mobileSession.update as any).mockResolvedValue({})
  process.env.MOBILE_JWT_SECRET = "test-secret-32-bytes-of-random-data!!"
  process.env.MOBILE_JWT_ACCESS_TTL = "900"
})

describe("getUserId", () => {
  it("returns userId from NextAuth session", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u_web" } })
    const id = await getUserId(new Request("http://localhost/x"))
    expect(id).toBe("u_web")
  })

  it("returns userId from mobile JWT", async () => {
    ;(auth as any).mockResolvedValue(null)
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1",
      userId: "u_mob",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const token = await signAccessToken({ userId: "u_mob", sessionId: "sess_1" })
    const req = new Request("http://localhost/x", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(await getUserId(req)).toBe("u_mob")
  })

  it("returns null when neither method authenticates", async () => {
    ;(auth as any).mockResolvedValue(null)
    expect(await getUserId(new Request("http://localhost/x"))).toBeNull()
  })

  it("returns null when mobile JWT references a revoked session", async () => {
    ;(auth as any).mockResolvedValue(null)
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1",
      userId: "u_mob",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    })
    const token = await signAccessToken({ userId: "u_mob", sessionId: "sess_1" })
    const req = new Request("http://localhost/x", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(await getUserId(req)).toBeNull()
  })
})
