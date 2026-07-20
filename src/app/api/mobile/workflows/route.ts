import { NextResponse } from "next/server"

import { listDashboardWorkflows } from "@/features/workflows/service"
import { getMobileContext } from "@/lib/mobile-org"

/**
 * GET /api/mobile/workflows — list workflows visible to the user's org.
 * Read & monitor only; creating/editing graphs is not supported on mobile.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const workflows = await listDashboardWorkflows({
      organizationId: ctx.organizationId,
      assistantId: null,
    })

    return NextResponse.json(workflows)
  } catch (error) {
    console.error("[Mobile Workflows API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 })
  }
}
