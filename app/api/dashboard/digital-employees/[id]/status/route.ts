import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { orchestrator } from "@/lib/digital-employee"

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

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      select: { id: true, status: true, groupId: true },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const containerUrl = await orchestrator.getGroupContainerUrl(employee.groupId)

    return NextResponse.json({
      employeeId: id,
      status: employee.status,
      containerRunning: !!containerUrl,
      groupId: employee.groupId,
    })
  } catch (error) {
    console.error("Status check failed:", error)
    return NextResponse.json({ error: "Status check failed" }, { status: 500 })
  }
}
