import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { workflowEngine } from "@/lib/workflow"

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

    const { runId } = await params
    const body = await req.json()
    const { stepId, data } = body

    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
    })

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    if (run.status !== "PAUSED") {
      return NextResponse.json({ error: "Run is not paused" }, { status: 400 })
    }

    // Resume via workflow engine
    await workflowEngine.resume(runId, stepId, data)

    // Return updated run
    const updatedRun = await prisma.workflowRun.findUnique({
      where: { id: runId },
    })

    return NextResponse.json(updatedRun)
  } catch (error) {
    console.error("Failed to resume run:", error)
    return NextResponse.json({ error: "Failed to resume run" }, { status: 500 })
  }
}
