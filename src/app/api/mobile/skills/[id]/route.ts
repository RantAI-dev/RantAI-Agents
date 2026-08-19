import { NextResponse } from "next/server"

import { UpdateDashboardSkillSchema } from "@/features/skills/schema"
import {
  deleteDashboardSkillRecord,
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

/** PUT /api/mobile/skills/[id] — update a custom skill (org-scoped in service). */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const parsed = UpdateDashboardSkillSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }
    const result = await updateDashboardSkillRecord({
      id,
      organizationId: ctx.organizationId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Skills] PUT error:", error)
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 })
  }
}

/** DELETE /api/mobile/skills/[id] — delete a custom skill (org-scoped in service). */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const result = await deleteDashboardSkillRecord(id, ctx.organizationId)
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Skills] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 })
  }
}
