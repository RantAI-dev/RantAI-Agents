import { NextResponse } from "next/server"

import {
  WorkflowExecuteSchema,
  WorkflowIdParamsSchema,
} from "@/features/workflows/schema"
import { executeDashboardWorkflow } from "@/features/workflows/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"
import { authorizeMobileWorkflow } from "@/lib/mobile-workflow"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/mobile/workflows/[id]/execute — run a STANDARD workflow. Returns the
 * created run (status RUNNING) immediately; the client polls the run endpoint.
 * CHATFLOW workflows stream and are not supported by the mobile MVP.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const parsedBody = WorkflowExecuteSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }

    const workflow = await authorizeMobileWorkflow(ctx, parsedParams.data.id)
    if (isHttpServiceError(workflow)) {
      return NextResponse.json({ error: workflow.error }, { status: workflow.status })
    }

    if ((workflow as { mode?: string }).mode === "CHATFLOW") {
      return NextResponse.json(
        { error: "Chatflow workflows are not supported on mobile yet." },
        { status: 400 }
      )
    }

    const result = await executeDashboardWorkflow({
      workflowId: parsedParams.data.id,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      input: parsedBody.data.input ?? {},
      threadId: parsedBody.data.threadId,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    // STANDARD mode always returns a JSON run; the streaming branch is guarded above.
    if (result.kind === "response") {
      return result.response
    }
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("[Mobile Workflows API] execute error:", error)
    return NextResponse.json({ error: "Failed to execute workflow" }, { status: 500 })
  }
}
