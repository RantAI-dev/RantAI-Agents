import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { hashRefreshToken } from "@/lib/auth-mobile"

const BodySchema = z.object({ refreshToken: z.string().min(1) })

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  const session = await prisma.mobileSession.findUnique({
    where: { refreshTokenHash: hashRefreshToken(parsed.data.refreshToken) },
  })
  if (!session) return new NextResponse(null, { status: 204 }) // idempotent
  await prisma.mobileSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  })
  return new NextResponse(null, { status: 204 })
}
