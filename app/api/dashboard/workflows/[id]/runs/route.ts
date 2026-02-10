import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    const { id } = await params

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
    })

    return NextResponse.json(runs)
  } catch (error) {
    console.error("Failed to fetch runs:", error)
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 })
  }
}
