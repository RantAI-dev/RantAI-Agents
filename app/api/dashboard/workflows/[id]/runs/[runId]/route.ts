import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string; runId: string }>
}

// GET /api/dashboard/workflows/[id]/runs/[runId] - Get run detail
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { runId } = await params

    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
    })

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    return NextResponse.json(run)
  } catch (error) {
    console.error("Failed to fetch run:", error)
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 })
  }
}
