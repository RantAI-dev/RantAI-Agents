import { describe, it, expect, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/organization", () => ({
  getOrganizationContextWithFallback: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mobileSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { prisma } from "@/lib/prisma"
import { signAccessToken } from "@/lib/auth-mobile"
import { requireUserAndOrg } from "@/lib/auth-helpers"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MOBILE_JWT_SECRET = "test-secret-32-bytes-of-random-data!!"
  process.env.MOBILE_JWT_ACCESS_TTL = "900"
  // The fire-and-forget lastUsedAt update needs a Promise return so .catch() works.
  ;(prisma.mobileSession.update as any).mockResolvedValue({})
})

describe("requireUserAndOrg", () => {
  it("accepts a NextAuth session", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "user_1" } })
    ;(getOrganizationContextWithFallback as any).mockResolvedValue({ organizationId: "org_1" })
    const req = new NextRequest("http://localhost/api/x")
    const result = await requireUserAndOrg(req)
    expect("user" in result && result.user.id).toBe("user_1")
    expect("orgContext" in result && result.orgContext.organizationId).toBe("org_1")
  })

  it("accepts a mobile JWT Bearer token", async () => {
    ;(auth as any).mockResolvedValue(null)
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1",
      userId: "user_2",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "user_2" },
    })
    ;(getOrganizationContextWithFallback as any).mockResolvedValue({ organizationId: "org_2" })
    const token = await signAccessToken({ userId: "user_2", sessionId: "sess_1" })
    const req = new NextRequest("http://localhost/api/x", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await requireUserAndOrg(req)
    expect("user" in result && result.user.id).toBe("user_2")
    expect("orgContext" in result && result.orgContext.organizationId).toBe("org_2")
  })

  it("returns 401 when neither auth method is present", async () => {
    ;(auth as any).mockResolvedValue(null)
    const req = new NextRequest("http://localhost/api/x")
    const result = await requireUserAndOrg(req)
    expect("status" in result && result.status).toBe(401)
  })

  it("rejects a revoked mobile session", async () => {
    ;(auth as any).mockResolvedValue(null)
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1",
      userId: "user_3",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "user_3" },
    })
    const token = await signAccessToken({ userId: "user_3", sessionId: "sess_1" })
    const req = new NextRequest("http://localhost/api/x", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await requireUserAndOrg(req)
    expect("status" in result && result.status).toBe(401)
  })
})
