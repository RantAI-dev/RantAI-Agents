import { NextResponse } from "next/server"

import { deleteDashboardMemory } from "@/features/memory/service"
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
 * DELETE /api/mobile/memories/[id] — delete a single memory entry.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const result = await deleteDashboardMemory({ userId: ctx.userId, memoryId: id })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Memory API] DELETE [id] error:", error)
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 })
  }
}
