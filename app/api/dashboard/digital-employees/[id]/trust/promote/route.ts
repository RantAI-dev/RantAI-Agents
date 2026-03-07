import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { AUTONOMY_LEVELS, mapLegacyAutonomy, computeTrustScore } from "@/lib/digital-employee/trust"
import { logAudit, classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const currentLevel = mapLegacyAutonomy(employee.autonomyLevel)
    const currentIdx = AUTONOMY_LEVELS.findIndex((l) => l.code === currentLevel)
    if (currentIdx >= AUTONOMY_LEVELS.length - 1) {
      return NextResponse.json({ error: "Already at maximum level" }, { status: 400 })
    }

    const newLevel = AUTONOMY_LEVELS[currentIdx + 1]

    await prisma.$transaction([
      prisma.digitalEmployee.update({
        where: { id },
        data: { autonomyLevel: newLevel.code },
      }),
      prisma.employeeTrustEvent.create({
        data: {
          digitalEmployeeId: id,
          eventType: "promotion",
          weight: 1,
          metadata: { from: currentLevel, to: newLevel.code, by: session.user.id },
        },
      }),
    ])

    logAudit({
      organizationId: employee.organizationId,
      employeeId: id,
      userId: session.user.id,
      action: AUDIT_ACTIONS.EMPLOYEE_PROMOTE,
      resource: `employee:${id}`,
      detail: { fromLevel: currentLevel, toLevel: newLevel.code },
      riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_PROMOTE),
    }).catch(() => {})

    return NextResponse.json({ level: newLevel.code, label: newLevel.label })
  } catch (error) {
    console.error("Failed to promote:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
