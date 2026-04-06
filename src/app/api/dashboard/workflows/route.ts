import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  CreateWorkflowSchema,
  WorkflowListQuerySchema,
} from "@/features/workflows/schema"
import {
  createDashboardWorkflow,
  listDashboardWorkflows,
} from "@/features/workflows/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

// GET /api/dashboard/workflows - List workflows
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsedQuery = WorkflowListQuerySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams.entries())
    )
    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 })
    }

    const workflows = await listDashboardWorkflows({
      organizationId: orgContext?.organizationId ?? null,
      assistantId: parsedQuery.data.assistantId || null,
    })

    return NextResponse.json(workflows)
  } catch (error) {
    console.error("Failed to fetch workflows:", error)
    return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 })
  }
}

// POST /api/dashboard/workflows - Create workflow
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsedBody = CreateWorkflowSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const workflow = await createDashboardWorkflow({
      actorUserId: session.user.id,
      organizationId: orgContext?.organizationId ?? null,
      input: parsedBody.data,
    })
    if (isHttpServiceError(workflow)) {
      return NextResponse.json({ error: workflow.error }, { status: workflow.status })
    }

    return NextResponse.json(workflow, { status: 201 })
  } catch (error) {
    console.error("Failed to create workflow:", error)
    return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 })
  }
}
