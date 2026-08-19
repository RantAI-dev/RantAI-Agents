import { NextResponse } from "next/server"

import { UpdateMemberRoleSchema } from "@/features/organizations/members/schema"
import {
  changeOrganizationMemberRole,
  removeOrganizationMember,
} from "@/features/organizations/members/service"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ memberId: string }>
}

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * PATCH /api/mobile/organization/members/[memberId] — change a member's role
 * (owner only). Body: { role }.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }

    const { memberId } = await params
    const parsed = UpdateMemberRoleSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const result = await changeOrganizationMemberRole({
      actorUserId: ctx.userId,
      organizationId: ctx.organizationId,
      memberId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Members API] PATCH error:", error)
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 })
  }
}

/**
 * DELETE /api/mobile/organization/members/[memberId] — remove a member
 * (owner/admin, with owner/admin constraints enforced by the service).
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }

    const { memberId } = await params
    const result = await removeOrganizationMember({
      actorUserId: ctx.userId,
      organizationId: ctx.organizationId,
      memberId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Members API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 })
  }
}
