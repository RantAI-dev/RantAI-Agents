import { NextResponse } from "next/server"

import { UpdateToolSchema } from "@/features/tools/schema"
import {
  deleteDashboardTool,
  updateDashboardTool,
} from "@/features/tools/service"
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

/** PUT /api/mobile/tools/[id] — update a custom tool (org-guarded in service). */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const parsed = UpdateToolSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }
    const result = await updateDashboardTool({
      id,
      organizationId: ctx.organizationId,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Tools API] PUT error:", error)
    return NextResponse.json({ error: "Failed to update tool" }, { status: 500 })
  }
}

/** DELETE /api/mobile/tools/[id] — delete a custom tool (org-guarded in service). */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const result = await deleteDashboardTool({
      id,
      organizationId: ctx.organizationId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Tools API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete tool" }, { status: 500 })
  }
}
