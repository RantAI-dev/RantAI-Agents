import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUsageTodayCents } from "@/features/media/limits"

const PatchBody = z.object({
  mediaLimitCentsPerDay: z.number().int().min(0).nullable(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mediaLimitCentsPerDay: true },
  })
  const usedTodayCents = await getUsageTodayCents(session.user.id)
  return NextResponse.json({
    mediaLimitCentsPerDay: user?.mediaLimitCentsPerDay ?? null,
    usedTodayCents,
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { mediaLimitCentsPerDay: parsed.data.mediaLimitCentsPerDay },
  })
  return NextResponse.json({ ok: true })
}
