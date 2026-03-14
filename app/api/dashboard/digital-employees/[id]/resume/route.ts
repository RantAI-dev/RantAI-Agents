import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { DockerOrchestrator } from "@/lib/digital-employee/docker-orchestrator"

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

    const orchestrator = new DockerOrchestrator()
    const { containerId, port } = await orchestrator.startGroup(employee.groupId)

    return NextResponse.json({ success: true, containerId, port })
  } catch (error) {
    console.error("Resume failed:", error)
    return NextResponse.json({ error: "Resume failed" }, { status: 500 })
  }
}
