import { NextResponse } from "next/server"

import { WorkflowIdParamsSchema } from "@/features/workflows/schema"
import { listWorkflowRuns } from "@/features/workflows/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"
import { authorizeMobileWorkflow } from "@/lib/mobile-workflow"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/mobile/workflows/[id]/runs — last 50 runs for a workflow
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const auth = await authorizeMobileWorkflow(ctx, parsedParams.data.id)
    if (isHttpServiceError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const runs = await listWorkflowRuns(parsedParams.data.id)
    return NextResponse.json(runs)
  } catch (error) {
    console.error("[Mobile Workflows API] runs error:", error)
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 })
  }
}
