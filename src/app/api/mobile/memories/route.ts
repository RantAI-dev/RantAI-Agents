import { NextResponse } from "next/server"

import {
  clearDashboardMemories,
  listDashboardMemories,
} from "@/features/memory/service"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/memories?type= — the user's AI memories + summary stats.
 * Memory is per-user (not org-scoped).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const type = new URL(request.url).searchParams.get("type")
    return NextResponse.json(
      await listDashboardMemories({ userId: ctx.userId, type })
    )
  } catch (error) {
    console.error("[Mobile Memory API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch memories" }, { status: 500 })
  }
}

/**
 * DELETE /api/mobile/memories — clear all memories of a type.
 * Body: { type: "WORKING" | "SEMANTIC" | "LONG_TERM" }.
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const result = await clearDashboardMemories({ userId: ctx.userId, input: body })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Memory API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to clear memories" }, { status: 500 })
  }
}
