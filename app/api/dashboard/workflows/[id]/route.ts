import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  WorkflowIdParamsSchema,
  UpdateWorkflowSchema,
} from "@/src/features/workflows/schema"
import {
  deleteDashboardWorkflow,
  getDashboardWorkflow,
  updateDashboardWorkflow,
} from "@/src/features/workflows/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/dashboard/workflows/[id]
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const workflow = await getDashboardWorkflow(parsedParams.data.id)
    if (isHttpServiceError(workflow)) {
      return NextResponse.json({ error: workflow.error }, { status: workflow.status })
    }

    return NextResponse.json(workflow)
  } catch (error) {
    console.error("Failed to fetch workflow:", error)
    return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 })
  }
}

// PUT /api/dashboard/workflows/[id]
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const parsedBody = UpdateWorkflowSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const workflow = await updateDashboardWorkflow({
      id: parsedParams.data.id,
      input: parsedBody.data,
    })
    if (isHttpServiceError(workflow)) {
      return NextResponse.json({ error: workflow.error }, { status: workflow.status })
    }

    return NextResponse.json(workflow)
  } catch (error) {
    console.error("Failed to update workflow:", error)
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 })
  }
}

// DELETE /api/dashboard/workflows/[id]
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const result = await deleteDashboardWorkflow(parsedParams.data.id)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to delete workflow:", error)
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 })
  }
}
