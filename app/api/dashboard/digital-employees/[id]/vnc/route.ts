import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

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
      select: { groupId: true },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (!employee.groupId) {
      return NextResponse.json({ error: "Employee has no team" }, { status: 400 })
    }

    const group = await prisma.employeeGroup.findFirst({
      where: { id: employee.groupId },
      select: { noVncPort: true },
    })

    if (!group?.noVncPort) {
      return NextResponse.json({ error: "Container not running" }, { status: 503 })
    }

    const noVncPort = group.noVncPort

    return NextResponse.json({
      url: `http://localhost:${noVncPort}/vnc.html?autoconnect=true&resize=scale`,
    })
  } catch (error) {
    console.error("VNC URL lookup failed:", error)
    return NextResponse.json({ error: "VNC lookup failed" }, { status: 500 })
  }
}
