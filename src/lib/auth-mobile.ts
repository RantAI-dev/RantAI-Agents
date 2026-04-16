import { SignJWT, jwtVerify } from "jose"
import { createHash, randomBytes } from "crypto"

interface AccessTokenClaims {
  userId: string
  sessionId: string
}

function getSecret(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET
  if (!secret) throw new Error("MOBILE_JWT_SECRET is not set")
  if (secret.length < 32) throw new Error("MOBILE_JWT_SECRET must be at least 32 characters")
  return new TextEncoder().encode(secret)
}

function getAccessTtlSeconds(): number {
  return Number(process.env.MOBILE_JWT_ACCESS_TTL ?? 900)
}

export function getRefreshTtlSeconds(): number {
  return Number(process.env.MOBILE_JWT_REFRESH_TTL ?? 60 * 60 * 24 * 30)
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const ttl = getAccessTtlSeconds()
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ userId: claims.userId, sessionId: claims.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setSubject(claims.userId)
    .sign(getSecret())
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] })
  if (typeof payload.userId !== "string" || typeof payload.sessionId !== "string") {
    throw new Error("Malformed access token claims")
  }
  return { userId: payload.userId, sessionId: payload.sessionId }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
