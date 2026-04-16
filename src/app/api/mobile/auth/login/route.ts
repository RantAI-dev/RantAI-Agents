import { NextResponse } from "next/server"
import { z } from "zod"
import { compare } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTtlSeconds,
} from "@/lib/auth-mobile"

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  platform: z.enum(["ios", "android"]),
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const { email, password, deviceId, deviceName, platform } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  const ok = await compare(password, user.passwordHash)
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })

  const refreshToken = generateRefreshToken()
  const refreshTokenHash = hashRefreshToken(refreshToken)
  const expiresAt = new Date(Date.now() + getRefreshTtlSeconds() * 1000)

  const session = await prisma.mobileSession.upsert({
    where: { userId_deviceId: { userId: user.id, deviceId } },
    create: {
      userId: user.id,
      deviceId,
      deviceName,
      platform,
      refreshTokenHash,
      expiresAt,
    },
    update: {
      deviceName,
      platform,
      refreshTokenHash,
      expiresAt,
      lastUsedAt: new Date(),
      revokedAt: null,
    },
  })

  const accessToken = await signAccessToken({ userId: user.id, sessionId: session.id })

  return NextResponse.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  })
}
