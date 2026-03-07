import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { encryptCredential } from "@/lib/workflow/credentials"

export async function POST(req: Request) {
  try {
    const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!bearerToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await verifyRuntimeToken(bearerToken)

    const { employeeId, integrationId, credentials, expiresIn, metadata } = await req.json()
    if (!employeeId || !integrationId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Encrypt the credentials (may be empty for config-only updates)
    const hasCredentials = credentials && Object.keys(credentials).length > 0
    const encryptedData = hasCredentials
      ? encryptCredential(credentials as Record<string, unknown>)
      : undefined

    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null

    // Upsert the integration record
    const integration = await prisma.employeeIntegration.upsert({
      where: {
        digitalEmployeeId_integrationId: {
          digitalEmployeeId: employeeId,
          integrationId,
        },
      },
      create: {
        digitalEmployeeId: employeeId,
        integrationId,
        status: hasCredentials ? "connected" : "disconnected",
        ...(encryptedData && { encryptedData }),
        ...(hasCredentials && { connectedAt: new Date() }),
        expiresAt,
        ...(metadata && { metadata }),
      },
      update: {
        ...(hasCredentials && { status: "connected", encryptedData, connectedAt: new Date() }),
        expiresAt,
        lastError: null,
        ...(metadata && { metadata }),
      },
    })

    return NextResponse.json({
      success: true,
      integrationId: integration.integrationId,
      status: integration.status,
      connectedAt: integration.connectedAt,
    })
  } catch (error) {
    console.error("Store credentials failed:", error)
    return NextResponse.json({ error: "Failed to store credentials" }, { status: 500 })
  }
}
