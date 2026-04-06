import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  WorkflowExecuteSchema,
  WorkflowIdParamsSchema,
} from "@/features/workflows/schema"
import {
  executeDashboardWorkflow,
} from "@/features/workflows/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/dashboard/workflows/[id]/execute - Execute a workflow (session auth)
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const parsedParams = WorkflowIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const parsedBody = WorkflowExecuteSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, userId)
    const result = await executeDashboardWorkflow({
      workflowId: parsedParams.data.id,
      userId,
      organizationId: orgContext?.organizationId ?? null,
      input: parsedBody.data.input ?? {},
      threadId: parsedBody.data.threadId,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    if (result.kind === "response") {
      return result.response
    }

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("Failed to execute workflow:", error)
    return NextResponse.json({ error: "Failed to execute workflow" }, { status: 500 })
  }
}
