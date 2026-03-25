import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { WorkflowResumeSchema, WorkflowRunIdParamsSchema } from "@/src/features/workflows/schema"
import { resumeWorkflowRun } from "@/src/features/workflows/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string; runId: string }>
}

// POST /api/dashboard/workflows/[id]/runs/[runId]/resume - Resume a paused run
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowRunIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const parsedBody = WorkflowResumeSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const result = await resumeWorkflowRun({
      runId: parsedParams.data.runId,
      stepId: parsedBody.data.stepId,
      data: parsedBody.data.data,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to resume run:", error)
    return NextResponse.json({ error: "Failed to resume run" }, { status: 500 })
  }
}
