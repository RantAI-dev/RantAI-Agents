import { NextResponse } from "next/server"

import { UpdateDashboardSkillSchema } from "@/features/skills/schema"
import {
  deleteDashboardSkillRecord,
  getDashboardSkillById,
  updateDashboardSkillRecord,
} from "@/features/skills/service"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * Loads a skill and verifies it belongs to the caller's org (the base service
 * doesn't org-scope by id, so guard here). Returns null if OK, else a response.
 */
async function guardOwnership(
  id: string,
  organizationId: string | null
): Promise<NextResponse | null> {
  const skill = await getDashboardSkillById(id)
  if (isServiceError(skill)) {
    return NextResponse.json({ error: skill.error }, { status: skill.status })
  }
  const skillOrg = (skill as { organizationId?: string | null }).organizationId ?? null
  if (skillOrg !== organizationId) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 })
  }
  return null
}

/** PUT /api/mobile/skills/[id] — update a custom skill. */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const denied = await guardOwnership(id, ctx.organizationId)
    if (denied) return denied

    const parsed = UpdateDashboardSkillSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }
    const result = await updateDashboardSkillRecord({ id, input: parsed.data })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Skills] PUT error:", error)
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 })
  }
}

/** DELETE /api/mobile/skills/[id] — delete a custom skill. */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const denied = await guardOwnership(id, ctx.organizationId)
    if (denied) return denied

    const result = await deleteDashboardSkillRecord(id)
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Skills] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 })
  }
}
