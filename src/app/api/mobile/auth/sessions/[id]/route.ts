import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireUserAndOrg } from "@/lib/auth-helpers"

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireUserAndOrg(req)
  if ("status" in ctx) return ctx
  const { id } = await params
  await prisma.mobileSession.updateMany({
    where: { id, userId: ctx.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return new NextResponse(null, { status: 204 })
}
