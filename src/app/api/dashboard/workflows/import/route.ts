import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { WorkflowImportSchema } from "@/features/workflows/schema"
import { importDashboardWorkflow } from "@/features/workflows/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

// POST /api/dashboard/workflows/import
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedBody = WorkflowImportSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const workflow = await importDashboardWorkflow({
      actorUserId: session.user.id,
      organizationId: orgContext?.organizationId ?? null,
      input: parsedBody.data,
    })
    if (isHttpServiceError(workflow)) {
      return NextResponse.json({ error: workflow.error }, { status: workflow.status })
    }

    return NextResponse.json(workflow)
  } catch (error) {
    console.error("Failed to import workflow:", error)
    const message = error instanceof Error ? error.message : "Failed to import workflow"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
