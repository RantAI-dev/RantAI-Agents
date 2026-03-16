import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"
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

    const { id: groupId } = await params
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)

    if (!orgContext) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const group = await prisma.employeeGroup.findFirst({
      where: {
        id: groupId,
        organizationId: orgContext.organizationId,
      },
    })

    if (!group) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await new DockerOrchestrator().stopGroup(groupId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Stop group container failed:", error)
    const message = error instanceof Error ? error.message : "Stop failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
