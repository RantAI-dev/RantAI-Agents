import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { WorkflowRunIdParamsSchema } from "@/src/features/workflows/schema"
import { getWorkflowRun } from "@/src/features/workflows/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string; runId: string }>
}

// GET /api/dashboard/workflows/[id]/runs/[runId] - Get run detail
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowRunIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const run = await getWorkflowRun(parsedParams.data.runId)
    if (isHttpServiceError(run)) {
      return NextResponse.json({ error: run.error }, { status: run.status })
    }

    return NextResponse.json(run)
  } catch (error) {
    console.error("Failed to fetch run:", error)
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 })
  }
}
