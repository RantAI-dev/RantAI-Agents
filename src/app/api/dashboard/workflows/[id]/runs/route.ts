import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { WorkflowIdParamsSchema } from "@/features/workflows/schema"
import { listWorkflowRuns } from "@/features/workflows/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/dashboard/workflows/[id]/runs - List runs for a workflow
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

    const runs = await listWorkflowRuns(parsedParams.data.id)

    return NextResponse.json(runs)
  } catch (error) {
    console.error("Failed to fetch runs:", error)
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 })
  }
}
