import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { orchestrator } from "@/lib/digital-employee"

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

    const result = await orchestrator.deployGroup(employee.groupId)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    try {
      const { containerId, port } = await orchestrator.startGroupContainer(employee.groupId)
      return NextResponse.json({ success: true, containerId, port })
    } catch (startError) {
      console.error("Auto-start after resume failed:", startError)
      // Deploy succeeded but container start failed — still return success
      // The user can manually start from the UI
      return NextResponse.json({ success: true, warning: "Deployed but container start failed" })
    }
  } catch (error) {
    console.error("Resume failed:", error)
    return NextResponse.json({ error: "Resume failed" }, { status: 500 })
  }
}
