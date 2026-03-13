import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { mapLegacyAutonomy } from "@/lib/digital-employee/trust"
import { hasPermission, canManageEmployee } from "@/lib/digital-employee/rbac"
import { logAudit, classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"

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
        group: { select: { id: true, name: true, status: true } },
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

    if (orgContext && !canManageEmployee(orgContext.membership.role, session.user.id, existing)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const {
      name, description, avatar, assistantId, autonomyLevel,
      deploymentConfig, resourceLimits, gatewayConfig, supervisorId,
      status, sandboxMode, groupId,
    } = body

    // Map legacy autonomy values to L-codes
    const mappedAutonomy = autonomyLevel !== undefined ? mapLegacyAutonomy(autonomyLevel) : undefined

    const employee = await prisma.digitalEmployee.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(avatar !== undefined && { avatar }),
        ...(assistantId !== undefined && { assistantId }),
        ...(mappedAutonomy !== undefined && { autonomyLevel: mappedAutonomy }),
        ...(status !== undefined && { status }),
        ...(deploymentConfig !== undefined && { deploymentConfig }),
        ...(resourceLimits !== undefined && { resourceLimits }),
        ...(gatewayConfig !== undefined && { gatewayConfig }),
        ...(supervisorId !== undefined && { supervisorId }),
        ...(sandboxMode !== undefined && { sandboxMode }),
        ...(groupId !== undefined && { groupId: groupId || null }),
      },
      include: {
        assistant: { select: { id: true, name: true, emoji: true, model: true } },
        group: { select: { id: true, name: true, status: true } },
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

    if (orgContext) {
      logAudit({
        organizationId: orgContext.organizationId,
        employeeId: id,
        userId: session.user.id,
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATE,
        resource: `employee:${id}`,
        detail: { fields: Object.keys(body) },
        riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_UPDATE),
      }).catch(() => {})
    }

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

    if (orgContext && !hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    await prisma.digitalEmployee.delete({
      where: { id },
    })

    if (orgContext) {
      logAudit({
        organizationId: orgContext.organizationId,
        employeeId: id,
        userId: session.user.id,
        action: AUDIT_ACTIONS.EMPLOYEE_DELETE,
        resource: `employee:${id}`,
        detail: { name: existing.name },
        riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_DELETE),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete digital employee:", error)
    return NextResponse.json({ error: "Failed to delete digital employee" }, { status: 500 })
  }
}
