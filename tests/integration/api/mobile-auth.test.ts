import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    mobileSession: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock("bcryptjs", () => ({ compare: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { compare } from "bcryptjs"
import { POST as login } from "@/app/api/mobile/auth/login/route"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MOBILE_JWT_SECRET = "test-secret-32-bytes-of-random-data!!"
  process.env.MOBILE_JWT_ACCESS_TTL = "900"
  process.env.MOBILE_JWT_REFRESH_TTL = "2592000"
})

describe("POST /api/mobile/auth/login", () => {
  it("returns 400 on invalid body", async () => {
    const req = new Request("http://localhost/api/mobile/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
    })
    const res = await login(req)
    expect(res.status).toBe(400)
  })

  it("returns 401 on bad credentials", async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(null)
    const req = new Request("http://localhost/api/mobile/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "test@example.com",
        password: "p",
        deviceId: "d1",
        deviceName: "iPhone 15",
        platform: "ios",
      }),
    })
    const res = await login(req)
    expect(res.status).toBe(401)
  })

  it("returns tokens on success", async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      name: "X",
      role: "USER",
      passwordHash: "hash",
    })
    ;(compare as any).mockResolvedValue(true)
    ;(prisma.mobileSession.upsert as any).mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
    })
    const req = new Request("http://localhost/api/mobile/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "test@example.com",
        password: "p",
        deviceId: "d1",
        deviceName: "iPhone 15",
        platform: "ios",
      }),
    })
    const res = await login(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accessToken).toMatch(/^eyJ/)
    expect(body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.user).toEqual({ id: "user_1", email: "test@example.com", name: "X", role: "USER" })
  })
})

describe("POST /api/mobile/auth/refresh", () => {
  it("rotates refresh token on success", async () => {
    const oldRefresh = "old-refresh-token"
    const oldHash = (await import("@/lib/auth-mobile")).hashRefreshToken(oldRefresh)
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
      deviceId: "d1",
      refreshTokenHash: oldHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    })
    ;(prisma.mobileSession.update as any).mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
    })

    const { POST: refresh } = await import("@/app/api/mobile/auth/refresh/route")
    const req = new Request("http://localhost/api/mobile/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: oldRefresh, deviceId: "d1" }),
    })
    const res = await refresh(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accessToken).toMatch(/^eyJ/)
    expect(body.refreshToken).not.toBe(oldRefresh)
  })

  it("rejects when token does not match", async () => {
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
      refreshTokenHash: "different-hash",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const { POST: refresh } = await import("@/app/api/mobile/auth/refresh/route")
    const req = new Request("http://localhost/api/mobile/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "wrong", deviceId: "d1" }),
    })
    const res = await refresh(req)
    expect(res.status).toBe(401)
  })
})

describe("POST /api/mobile/auth/logout", () => {
  it("revokes the current session", async () => {
    const updateMock = vi.fn().mockResolvedValue({ id: "sess_1", revokedAt: new Date() })
    ;(prisma.mobileSession.update as any) = updateMock
    const oldRefresh = "tok"
    const oldHash = (await import("@/lib/auth-mobile")).hashRefreshToken(oldRefresh)
    ;(prisma.mobileSession.findUnique as any).mockResolvedValue({
      id: "sess_1",
      userId: "user_1",
      refreshTokenHash: oldHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      deviceId: "d1",
    })
    const { POST: logout } = await import("@/app/api/mobile/auth/logout/route")
    const req = new Request("http://localhost/api/mobile/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: oldRefresh }),
    })
    const res = await logout(req)
    expect(res.status).toBe(204)
    expect(updateMock).toHaveBeenCalled()
  })
})
