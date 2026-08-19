import { NextResponse } from "next/server"

import { InviteMemberSchema } from "@/features/organizations/members/schema"
import {
  inviteOrganizationMember,
  listOrganizationMembers,
} from "@/features/organizations/members/service"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/organization/members — members of the caller's active org.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }

    const result = await listOrganizationMembers({
      actorUserId: ctx.userId,
      organizationId: ctx.organizationId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Members API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 })
  }
}

/**
 * POST /api/mobile/organization/members — invite a member (owner/admin only).
 * Body: { email, role? }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!ctx.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 })
    }

    const parsed = InviteMemberSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const result = await inviteOrganizationMember({
      actorUserId: ctx.userId,
      organizationId: ctx.organizationId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Mobile Members API] POST error:", error)
    return NextResponse.json({ error: "Failed to invite member" }, { status: 500 })
  }
}
