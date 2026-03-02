import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/assistants/[id]/workflows - Get assistant's attached workflows
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const assistantWorkflows = await prisma.assistantWorkflow.findMany({
      where: { assistantId: id },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            mode: true,
            category: true,
            trigger: true,
            tags: true,
            nodes: true,
            _count: { select: { runs: true } },
          },
        },
      },
    })

    return NextResponse.json(
      assistantWorkflows.map((aw) => ({
        ...aw.workflow,
        enabledForAssistant: aw.enabled,
      }))
    )
  } catch (error) {
    console.error("[Assistant Workflows API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant workflows" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id]/workflows - Set assistant's attached workflows
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { workflowIds } = body as { workflowIds: string[] }

    if (!Array.isArray(workflowIds)) {
      return NextResponse.json(
        { error: "workflowIds must be an array" },
        { status: 400 }
      )
    }

    // Verify assistant exists
    const assistant = await prisma.assistant.findUnique({ where: { id } })
    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    // Replace all workflow bindings in a transaction
    await prisma.$transaction([
      prisma.assistantWorkflow.deleteMany({ where: { assistantId: id } }),
      ...(workflowIds.length > 0
        ? [
            prisma.assistantWorkflow.createMany({
              data: workflowIds.map((workflowId) => ({
                assistantId: id,
                workflowId,
              })),
            }),
          ]
        : []),
    ])

    // Return updated list
    const updatedWorkflows = await prisma.assistantWorkflow.findMany({
      where: { assistantId: id },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            mode: true,
            category: true,
          },
        },
      },
    })

    return NextResponse.json(updatedWorkflows.map((aw) => aw.workflow))
  } catch (error) {
    console.error("[Assistant Workflows API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant workflows" },
      { status: 500 }
    )
  }
}
