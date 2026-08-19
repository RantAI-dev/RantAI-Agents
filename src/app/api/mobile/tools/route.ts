import { NextResponse } from "next/server"

import { CreateToolSchema } from "@/features/tools/schema"
import {
  createDashboardTool,
  listToolsForDashboard,
} from "@/features/tools/service"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/tools — catalog of tools the caller can bind to an agent or
 * manage (built-in + org-scoped custom tools). `isBuiltIn` distinguishes
 * read-only built-ins from the org's own (editable) tools; `enabled` is the
 * on/off state.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tools = await listToolsForDashboard(ctx.organizationId)

    return NextResponse.json(
      tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        category: tool.category,
        icon: tool.icon,
        isBuiltIn: tool.isBuiltIn,
        enabled: tool.enabled,
      }))
    )
  } catch (error) {
    console.error("[Mobile Tools API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch tools" }, { status: 500 })
  }
}

/**
 * POST /api/mobile/tools — create a custom (HTTP) tool.
 * Body: { name, displayName, description, parameters?, executionConfig? }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const parsed = CreateToolSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const result = await createDashboardTool({
      input: parsed.data,
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Mobile Tools API] POST error:", error)
    return NextResponse.json({ error: "Failed to create tool" }, { status: 500 })
  }
}
