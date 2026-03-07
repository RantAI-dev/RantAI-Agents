import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

// GET /api/dashboard/digital-employees/pending-approvals
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    const approvals = await prisma.employeeApproval.findMany({
      where: {
        status: "PENDING",
        digitalEmployee: {
          ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
        },
      },
      select: {
        id: true,
        digitalEmployeeId: true,
        digitalEmployee: { select: { name: true } },
      },
    })

    // Group by employee
    const byEmployee: Record<string, { employeeId: string; name: string; count: number }> = {}
    for (const a of approvals) {
      if (!byEmployee[a.digitalEmployeeId]) {
        byEmployee[a.digitalEmployeeId] = {
          employeeId: a.digitalEmployeeId,
          name: a.digitalEmployee.name,
          count: 0,
        }
      }
      byEmployee[a.digitalEmployeeId].count++
    }

    return NextResponse.json({
      total: approvals.length,
      byEmployee: Object.values(byEmployee),
    })
  } catch (error) {
    console.error("Failed to fetch pending approvals:", error)
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}
