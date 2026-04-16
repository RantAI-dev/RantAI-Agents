import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTtlSeconds,
} from "@/lib/auth-mobile"

const BodySchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1),
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const { refreshToken, deviceId } = parsed.data

  const incomingHash = hashRefreshToken(refreshToken)
  const session = await prisma.mobileSession.findUnique({
    where: { refreshTokenHash: incomingHash },
  })
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.deviceId !== deviceId
  ) {
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 })
  }

  const newRefresh = generateRefreshToken()
  const newHash = hashRefreshToken(newRefresh)
  const newExpiresAt = new Date(Date.now() + getRefreshTtlSeconds() * 1000)

  await prisma.mobileSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: newHash,
      expiresAt: newExpiresAt,
      lastUsedAt: new Date(),
    },
  })

  const accessToken = await signAccessToken({
    userId: session.userId,
    sessionId: session.id,
  })

  return NextResponse.json({ accessToken, refreshToken: newRefresh })
}
