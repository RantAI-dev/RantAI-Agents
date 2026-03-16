import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { encryptCredential } from "@/lib/workflow/credentials"
import { pushIntegration, removeIntegration } from "@/lib/digital-employee/config-push"

interface RouteParams {
  params: Promise<{ id: string; integrationId: string }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, integrationId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { credentials, metadata } = await req.json()
    const encryptedData = credentials ? encryptCredential(credentials) : undefined

    const integration = await prisma.employeeIntegration.update({
      where: { digitalEmployeeId_integrationId: { digitalEmployeeId: id, integrationId } },
      data: {
        ...(encryptedData !== undefined && { encryptedData, connectedAt: new Date(), status: "connected" }),
        ...(metadata !== undefined && { metadata }),
        lastError: null,
      },
    })

    // Push to running container (best-effort — fails silently if container not running)
    if (credentials) {
      const pushResult = await pushIntegration(id, integrationId, credentials)
      if (pushResult.success) {
        console.log(`[Config Push] ${integrationId} pushed to employee ${id}`)
      }
    }

    return NextResponse.json(integration)
  } catch (error) {
    console.error("Failed to update integration:", error)
    return NextResponse.json({ error: "Failed to update integration" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, integrationId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.employeeIntegration.delete({
      where: { digitalEmployeeId_integrationId: { digitalEmployeeId: id, integrationId } },
    })

    // Push removal to running container (best-effort — fails silently if container not running)
    const pushResult = await removeIntegration(id, integrationId)
    if (pushResult.success) {
      console.log(`[Config Push] ${integrationId} removed from employee ${id}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to disconnect integration:", error)
    return NextResponse.json({ error: "Failed to disconnect integration" }, { status: 500 })
  }
}
