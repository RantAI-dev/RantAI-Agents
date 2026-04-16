import { describe, expect, it, beforeAll } from "vitest"

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = "test-secret-32-bytes-of-random-data!!"
  process.env.MOBILE_JWT_ACCESS_TTL = "900"
  process.env.MOBILE_JWT_REFRESH_TTL = "2592000"
})

describe("auth-mobile", () => {
  it("signs and verifies an access token", async () => {
    const { signAccessToken, verifyAccessToken } = await import("@/lib/auth-mobile")
    const token = await signAccessToken({ userId: "user_1", sessionId: "sess_1" })
    expect(typeof token).toBe("string")
    const claims = await verifyAccessToken(token)
    expect(claims.userId).toBe("user_1")
    expect(claims.sessionId).toBe("sess_1")
  })

  it("rejects an expired access token", async () => {
    const { signAccessToken, verifyAccessToken } = await import("@/lib/auth-mobile")
    process.env.MOBILE_JWT_ACCESS_TTL = "-1"
    const token = await signAccessToken({ userId: "user_1", sessionId: "sess_1" })
    process.env.MOBILE_JWT_ACCESS_TTL = "900"
    await expect(verifyAccessToken(token)).rejects.toThrow()
  })

  it("hashes a refresh token deterministically", async () => {
    const { hashRefreshToken } = await import("@/lib/auth-mobile")
    const a = hashRefreshToken("abc")
    const b = hashRefreshToken("abc")
    const c = hashRefreshToken("xyz")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it("generates random refresh tokens of expected length", async () => {
    const { generateRefreshToken } = await import("@/lib/auth-mobile")
    const t = generateRefreshToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/) // base64url 32 bytes = 43 chars
  })
})
