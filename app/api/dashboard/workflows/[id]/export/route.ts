import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { WorkflowIdParamsSchema } from "@/src/features/workflows/schema"
import { exportDashboardWorkflow } from "@/src/features/workflows/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/dashboard/workflows/[id]/export
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

    const result = await exportDashboardWorkflow(parsedParams.data.id)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return new NextResponse(JSON.stringify(result.exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${result.name.replace(/[^a-zA-Z0-9-_]/g, "_")}_workflow.json"`,
      },
    })
  } catch (error) {
    console.error("Failed to export workflow:", error)
    return NextResponse.json({ error: "Failed to export workflow" }, { status: 500 })
  }
}
