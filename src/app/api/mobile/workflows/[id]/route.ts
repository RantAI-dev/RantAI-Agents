import { NextResponse } from "next/server"
import { z } from "zod"

import { WorkflowIdParamsSchema } from "@/features/workflows/schema"
import {
  deleteDashboardWorkflow,
  updateDashboardWorkflow,
} from "@/features/workflows/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"
import { authorizeMobileWorkflow } from "@/lib/mobile-workflow"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** Mobile can only flip the run status (deploy/pause/archive), not edit the graph. */
const MobileWorkflowStatusSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]),
})

// GET /api/mobile/workflows/[id]
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

    const workflow = await authorizeMobileWorkflow(ctx, parsedParams.data.id)
    if (isHttpServiceError(workflow)) {
      return NextResponse.json({ error: workflow.error }, { status: workflow.status })
    }

    return NextResponse.json(workflow)
  } catch (error) {
    console.error("[Mobile Workflows API] GET [id] error:", error)
    return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 })
  }
}

// PUT /api/mobile/workflows/[id] — status change only (deploy/pause/archive)
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = WorkflowIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
    }

    const parsedBody = MobileWorkflowStatusSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }

    const auth = await authorizeMobileWorkflow(ctx, parsedParams.data.id)
    if (isHttpServiceError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const workflow = await updateDashboardWorkflow({
      id: parsedParams.data.id,
      organizationId: ctx.organizationId,
      input: { status: parsedBody.data.status },
    })
    if (isHttpServiceError(workflow)) {
      return NextResponse.json({ error: workflow.error }, { status: workflow.status })
    }

    return NextResponse.json(workflow)
  } catch (error) {
    console.error("[Mobile Workflows API] PUT [id] error:", error)
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 })
  }
}

// DELETE /api/mobile/workflows/[id]
export async function DELETE(request: Request, { params }: RouteParams) {
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

    const result = await deleteDashboardWorkflow(parsedParams.data.id, ctx.organizationId)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Workflows API] DELETE [id] error:", error)
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 })
  }
}
