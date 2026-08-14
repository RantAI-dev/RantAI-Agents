import { NextResponse } from "next/server"

import { UpdateOrganizationSchema } from "@/features/organizations/detail/schema"
import { updateOrganizationDetail } from "@/features/organizations/detail/service"
import { getMobileContext } from "@/lib/mobile-org"
import { prisma } from "@/lib/prisma"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/organization — the caller's active organization
 * (auto-picked membership) with their role. Returns null when the user has no
 * organization yet. Read-only; editing/members are a later phase.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json(null)
    }

    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, slug: true },
    })
    if (!org) {
      return NextResponse.json(null)
    }

    return NextResponse.json({ ...org, role: ctx.role })
  } catch (error) {
    console.error("[Mobile Organization API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/mobile/organization — rename the active org (owner/admin only).
 * Body: { name }.
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }

    const parsed = UpdateOrganizationSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const result = await updateOrganizationDetail({
      actorUserId: ctx.userId,
      organizationId: ctx.organizationId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ...result, role: ctx.role })
  } catch (error) {
    console.error("[Mobile Organization API] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    )
  }
}
