import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { getIntegrationDefinition, INTEGRATION_REGISTRY } from "@/lib/digital-employee/integrations"
import { encryptCredential } from "@/lib/workflow/credentials"
import { logAudit, classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const connected = await prisma.employeeIntegration.findMany({ where: { digitalEmployeeId: id } })

    // Merge registry definitions with connected state
    const integrations = INTEGRATION_REGISTRY.map((def) => {
      const conn = connected.find((c) => c.integrationId === def.id)
      return {
        ...def,
        connectionId: conn?.id ?? null,
        status: conn?.status ?? "disconnected",
        connectedAt: conn?.connectedAt ?? null,
        lastTestedAt: conn?.lastTestedAt ?? null,
        lastError: conn?.lastError ?? null,
        metadata: conn?.metadata ?? {},
      }
    })

    return NextResponse.json(integrations)
  } catch (error) {
    console.error("Failed to fetch integrations:", error)
    return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { integrationId, credentials, metadata } = await req.json()
    if (!integrationId) return NextResponse.json({ error: "integrationId required" }, { status: 400 })

    const def = getIntegrationDefinition(integrationId)
    if (!def) return NextResponse.json({ error: "Unknown integration" }, { status: 400 })

    const encryptedData = credentials ? encryptCredential(credentials) : null

    const integration = await prisma.employeeIntegration.upsert({
      where: { digitalEmployeeId_integrationId: { digitalEmployeeId: id, integrationId } },
      create: {
        digitalEmployeeId: id,
        integrationId,
        status: encryptedData ? "connected" : "disconnected",
        encryptedData,
        metadata: metadata ?? {},
        connectedAt: encryptedData ? new Date() : null,
      },
      update: {
        status: encryptedData ? "connected" : "disconnected",
        encryptedData,
        metadata: metadata ?? {},
        connectedAt: encryptedData ? new Date() : null,
        lastError: null,
      },
    })

    logAudit({
      organizationId: employee.organizationId,
      employeeId: id,
      userId: session.user.id,
      action: AUDIT_ACTIONS.INTEGRATION_CONNECT,
      resource: `integration:${integrationId}`,
      detail: { integrationId },
      riskLevel: classifyActionRisk(AUDIT_ACTIONS.INTEGRATION_CONNECT),
    }).catch(() => {})

    return NextResponse.json(integration)
  } catch (error) {
    console.error("Failed to connect integration:", error)
    return NextResponse.json({ error: "Failed to connect integration" }, { status: 500 })
  }
}
