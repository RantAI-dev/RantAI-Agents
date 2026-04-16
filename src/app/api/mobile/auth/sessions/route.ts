import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireUserAndOrg } from "@/lib/auth-helpers"

export async function GET(req: Request) {
  const ctx = await requireUserAndOrg(req)
  if ("status" in ctx) return ctx
  const sessions = await prisma.mobileSession.findMany({
    where: { userId: ctx.user.id, revokedAt: null },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      deviceId: true,
      deviceName: true,
      platform: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  })
  return NextResponse.json({ sessions })
}
