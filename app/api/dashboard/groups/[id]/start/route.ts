import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"
import { DockerOrchestrator } from "@/lib/digital-employee/docker-orchestrator"

interface RouteParams {
  params: Promise<{ id: string }>
}

// In-memory concurrency guard — prevents double-start races
const startingGroups = new Set<string>()

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.create")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { id } = await params

    const group = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
    })
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    // Concurrency guard
    if (startingGroups.has(id)) {
      return NextResponse.json({ error: "Already starting" }, { status: 409 })
    }

    startingGroups.add(id)
    try {
      const orchestrator = new DockerOrchestrator()
      const { containerId, port } = await orchestrator.startGroup(id)
      return NextResponse.json({ success: true, containerId, port })
    } finally {
      startingGroups.delete(id)
    }
  } catch (error) {
    console.error("Failed to start group:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start group" },
      { status: 500 }
    )
  }
}
