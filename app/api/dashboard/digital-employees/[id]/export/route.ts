import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"
import { exportEmployeeData } from "@/lib/digital-employee/retention"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
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

    // Only admin/owner can export
    if (!hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Verify employee belongs to org
    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, organizationId: orgContext.organizationId },
      select: { id: true, name: true },
    })
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    const data = await exportEmployeeData(id)

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="employee-${employee.name.replace(/[^a-z0-9]/gi, "-")}-export.json"`,
      },
    })
  } catch (error) {
    console.error("Failed to export employee data:", error)
    return NextResponse.json({ error: "Failed to export employee data" }, { status: 500 })
  }
}
