import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/dashboard/digital-employees/[id]
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      include: {
        assistant: {
          select: {
            id: true, name: true, emoji: true, model: true,
            systemPrompt: true, useKnowledgeBase: true,
            knowledgeBaseGroupIds: true,
          },
        },
        _count: {
          select: {
            runs: true,
            approvals: true,
            files: true,
            customTools: true,
            installedSkills: true,
            memoryEntries: true,
          },
        },
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      ...employee,
      totalTokensUsed: employee.totalTokensUsed.toString(),
    })
  } catch (error) {
    console.error("Failed to fetch digital employee:", error)
    return NextResponse.json({ error: "Failed to fetch digital employee" }, { status: 500 })
  }
}

// PUT /api/dashboard/digital-employees/[id]
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const body = await req.json()

    // Verify ownership
    const existing = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const {
      name, description, avatar, assistantId, autonomyLevel,
      deploymentConfig, resourceLimits, gatewayConfig, supervisorId,
    } = body

    const employee = await prisma.digitalEmployee.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(avatar !== undefined && { avatar }),
        ...(assistantId !== undefined && { assistantId }),
        ...(autonomyLevel !== undefined && { autonomyLevel }),
        ...(deploymentConfig !== undefined && { deploymentConfig }),
        ...(resourceLimits !== undefined && { resourceLimits }),
        ...(gatewayConfig !== undefined && { gatewayConfig }),
        ...(supervisorId !== undefined && { supervisorId }),
      },
      include: {
        assistant: { select: { id: true, name: true, emoji: true, model: true } },
        _count: {
          select: {
            runs: true,
            approvals: true,
            files: true,
            customTools: true,
            installedSkills: true,
          },
        },
      },
    })

    return NextResponse.json({
      ...employee,
      totalTokensUsed: employee.totalTokensUsed.toString(),
    })
  } catch (error) {
    console.error("Failed to update digital employee:", error)
    return NextResponse.json({ error: "Failed to update digital employee" }, { status: 500 })
  }
}

// DELETE /api/dashboard/digital-employees/[id] - Permanent delete
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const existing = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await prisma.digitalEmployee.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete digital employee:", error)
    return NextResponse.json({ error: "Failed to delete digital employee" }, { status: 500 })
  }
}
