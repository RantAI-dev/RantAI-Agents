import { NextResponse } from "next/server"

import { WorkflowRunIdParamsSchema } from "@/features/workflows/schema"
import { getWorkflowRun } from "@/features/workflows/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"
import { authorizeMobileWorkflow } from "@/lib/mobile-workflow"

interface RouteParams {
  params: Promise<{ id: string; runId: string }>
}

// GET /api/mobile/workflows/[id]/runs/[runId] — one run with its full step trace
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowRunIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
    }

    const auth = await authorizeMobileWorkflow(ctx, parsedParams.data.id)
    if (isHttpServiceError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const run = await getWorkflowRun(parsedParams.data.runId)
    if (isHttpServiceError(run)) {
      return NextResponse.json({ error: run.error }, { status: run.status })
    }

    // Ensure the run actually belongs to the authorized workflow.
    if ((run as { workflowId?: string }).workflowId !== parsedParams.data.id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    return NextResponse.json(run)
  } catch (error) {
    console.error("[Mobile Workflows API] run detail error:", error)
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 })
  }
}
