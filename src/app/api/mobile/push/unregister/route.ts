import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireUserAndOrg } from "@/lib/auth-helpers"

const BodySchema = z.object({ deviceId: z.string().min(1) })

export async function POST(req: Request) {
  const ctx = await requireUserAndOrg(req)
  if ("status" in ctx) return ctx
  const json = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  await prisma.mobilePushToken.updateMany({
    where: { userId: ctx.user.id, deviceId: parsed.data.deviceId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return new NextResponse(null, { status: 204 })
}
