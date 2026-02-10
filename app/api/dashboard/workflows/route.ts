import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

// GET /api/dashboard/workflows - List workflows
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const { searchParams } = new URL(req.url)
    const assistantId = searchParams.get("assistantId")

    const workflows = await prisma.workflow.findMany({
      where: {
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
        ...(assistantId ? { assistantId } : {}),
      },
      include: {
        _count: { select: { runs: true } },
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json(workflows)
  } catch (error) {
    console.error("Failed to fetch workflows:", error)
    return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 })
  }
}

// POST /api/dashboard/workflows - Create workflow
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const body = await req.json()
    const { name, description, assistantId } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const workflow = await prisma.workflow.create({
      data: {
        name,
        description: description || null,
        assistantId: assistantId || null,
        organizationId: orgContext?.organizationId || null,
        createdBy: session.user.id,
      },
      include: {
        _count: { select: { runs: true } },
      },
    })

    return NextResponse.json(workflow, { status: 201 })
  } catch (error) {
    console.error("Failed to create workflow:", error)
    return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 })
  }
}
