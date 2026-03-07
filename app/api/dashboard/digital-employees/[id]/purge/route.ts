import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { purgeEmployeeData } from "@/lib/digital-employee/retention"
import { logAudit, classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    // Owner only for purge
    if (orgContext.membership.role !== "owner") {
      return NextResponse.json({ error: "Only organization owner can purge employee data" }, { status: 403 })
    }

    const body = await req.json()
    const { confirmName } = body

    // Verify employee exists and belongs to org
    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, organizationId: orgContext.organizationId },
      select: { id: true, name: true },
    })
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    // Safety: require name confirmation
    if (confirmName !== employee.name) {
      return NextResponse.json({ error: "Name confirmation does not match" }, { status: 400 })
    }

    // Log audit BEFORE purging (since the employee will be deleted)
    await logAudit({
      organizationId: orgContext.organizationId,
      employeeId: id,
      userId: session.user.id,
      action: AUDIT_ACTIONS.EMPLOYEE_DELETE,
      resource: `employee:${employee.name}`,
      detail: { purge: true, confirmedBy: session.user.id },
      riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_DELETE),
    })

    await purgeEmployeeData(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to purge employee data:", error)
    return NextResponse.json({ error: "Failed to purge employee data" }, { status: 500 })
  }
}
