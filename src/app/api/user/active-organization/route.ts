import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeActiveOrgCookie, clearActiveOrgCookie } from "@/lib/active-org-cookie"

const BodySchema = z.object({
  organizationId: z.string().min(1),
})

/**
 * POST /api/user/active-organization
 *
 * Sets the active-org cookie after verifying the caller has an accepted
 * membership in that org. Used by useOrganization client provider when the
 * user picks an org (or on the first-mount migration from localStorage).
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 })
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: session.user.id,
        organizationId: parsed.data.organizationId,
      },
    },
    select: { id: true, acceptedAt: true },
  })

  if (!membership || !membership.acceptedAt) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 })
  }

  await writeActiveOrgCookie(parsed.data.organizationId)
  return NextResponse.json({ ok: true, organizationId: parsed.data.organizationId })
}

/**
 * DELETE /api/user/active-organization
 *
 * Clears the cookie. Next request will fall through to auto-pick (first
 * membership).
 */
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  await clearActiveOrgCookie()
  return NextResponse.json({ ok: true })
}
