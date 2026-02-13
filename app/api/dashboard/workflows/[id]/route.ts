import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/dashboard/workflows/[id]
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: { _count: { select: { runs: true } } },
    })

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    return NextResponse.json(workflow)
  } catch (error) {
    console.error("Failed to fetch workflow:", error)
    return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 })
  }
}

// PUT /api/dashboard/workflows/[id]
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { name, description, nodes, edges, trigger, variables, status, mode, chatflowConfig, apiEnabled, assistantId } = body

    // Auto-generate API key when enabling API access
    let apiKey: string | undefined
    if (apiEnabled === true) {
      const existing = await prisma.workflow.findUnique({ where: { id }, select: { apiKey: true } })
      if (!existing?.apiKey) {
        apiKey = `wf_${id.slice(0, 8)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
      }
    }

    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(nodes !== undefined && { nodes }),
        ...(edges !== undefined && { edges }),
        ...(trigger !== undefined && { trigger }),
        ...(variables !== undefined && { variables }),
        ...(status !== undefined && { status }),
        ...(mode !== undefined && { mode }),
        ...(chatflowConfig !== undefined && { chatflowConfig }),
        ...(apiEnabled !== undefined && { apiEnabled }),
        ...(assistantId !== undefined && { assistantId: assistantId || null }),
        ...(apiKey && { apiKey }),
        // Clear API key when disabling
        ...(apiEnabled === false && { apiKey: null }),
      },
      include: { _count: { select: { runs: true } } },
    })

    return NextResponse.json(workflow)
  } catch (error) {
    console.error("Failed to update workflow:", error)
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 })
  }
}

// DELETE /api/dashboard/workflows/[id]
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    await prisma.workflow.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete workflow:", error)
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 })
  }
}
