import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { exportWorkflow } from "@/lib/workflow/import-export"

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

    const { id } = await params
    const workflow = await prisma.workflow.findUnique({
      where: { id },
    })

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    const exported = exportWorkflow({
      name: workflow.name,
      description: workflow.description,
      mode: (workflow as unknown as { mode?: string }).mode,
      trigger: workflow.trigger as unknown,
      variables: workflow.variables as unknown,
      nodes: (workflow.nodes as unknown[]) || [],
      edges: (workflow.edges as unknown[]) || [],
    })

    return new NextResponse(JSON.stringify(exported, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${workflow.name.replace(/[^a-zA-Z0-9-_]/g, "_")}_workflow.json"`,
      },
    })
  } catch (error) {
    console.error("Failed to export workflow:", error)
    return NextResponse.json({ error: "Failed to export workflow" }, { status: 500 })
  }
}
