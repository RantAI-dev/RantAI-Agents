import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { workflowEngine } from "@/lib/workflow"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/dashboard/workflows/[id]/execute - Execute a workflow
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const input = body.input || {}

    const workflow = await prisma.workflow.findUnique({
      where: { id },
    })

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    // Execute workflow via engine
    const runId = await workflowEngine.execute(id, input)

    // Return the run record
    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
    })

    return NextResponse.json(run, { status: 201 })
  } catch (error) {
    console.error("Failed to execute workflow:", error)
    return NextResponse.json({ error: "Failed to execute workflow" }, { status: 500 })
  }
}
