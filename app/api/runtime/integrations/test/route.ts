import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { decryptCredential } from "@/lib/workflow/credentials"
import { getIntegrationDefinition } from "@/lib/digital-employee/integrations"

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { employeeId } = await verifyRuntimeToken(token)
    const { integrationId } = await req.json()

    if (!integrationId) return NextResponse.json({ error: "integrationId required" }, { status: 400 })

    const integration = await prisma.employeeIntegration.findUnique({
      where: { digitalEmployeeId_integrationId: { digitalEmployeeId: employeeId, integrationId } },
    })
    if (!integration?.encryptedData) {
      return NextResponse.json({ success: false, error: "No credentials stored" })
    }

    const def = getIntegrationDefinition(integrationId)
    if (!def?.testEndpoint) {
      return NextResponse.json({ success: true, message: "No test endpoint" })
    }

    const creds = decryptCredential(integration.encryptedData)
    const headers: Record<string, string> = {}
    if (creds.token) headers["Authorization"] = `Bearer ${creds.token}`
    else if (creds.apiKey) headers["Authorization"] = `Bearer ${creds.apiKey}`
    else if (creds.botToken) headers["Authorization"] = `Bearer ${creds.botToken}`

    try {
      const res = await fetch(def.testEndpoint, { headers, method: "GET", signal: AbortSignal.timeout(10000) })
      await prisma.employeeIntegration.update({
        where: { id: integration.id },
        data: { lastTestedAt: new Date(), status: res.ok ? "connected" : "error", lastError: res.ok ? null : `HTTP ${res.status}` },
      })
      return NextResponse.json({ success: res.ok, status: res.status })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test failed"
      await prisma.employeeIntegration.update({
        where: { id: integration.id },
        data: { lastTestedAt: new Date(), status: "error", lastError: message },
      })
      return NextResponse.json({ success: false, error: message })
    }
  } catch (error) {
    console.error("Failed to test integration:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
