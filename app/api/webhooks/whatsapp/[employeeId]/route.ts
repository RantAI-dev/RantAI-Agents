import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decryptCredential } from "@/lib/workflow/credentials"

interface RouteParams {
  params: Promise<{ employeeId: string }>
}

/**
 * GET /api/webhooks/whatsapp/[employeeId]
 * Meta webhook verification challenge-response.
 * Meta sends: ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { employeeId } = await params
    const url = new URL(req.url)
    const mode = url.searchParams.get("hub.mode")
    const token = url.searchParams.get("hub.verify_token")
    const challenge = url.searchParams.get("hub.challenge")

    if (mode !== "subscribe" || !token || !challenge) {
      return new Response("Bad request", { status: 400 })
    }

    // Look up the employee's WhatsApp integration to get the verify_token
    const integration = await prisma.employeeIntegration.findFirst({
      where: {
        digitalEmployeeId: employeeId,
        integrationId: "whatsapp",
        status: "connected",
      },
    })

    if (!integration?.encryptedData) {
      return new Response("Not found", { status: 404 })
    }

    const creds = decryptCredential(integration.encryptedData)
    if (token !== creds.verifyToken) {
      return new Response("Forbidden", { status: 403 })
    }

    // Return the challenge to verify the webhook
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
  } catch (error) {
    console.error("[WhatsApp Webhook] Verification failed:", error)
    return new Response("Internal error", { status: 500 })
  }
}

/**
 * POST /api/webhooks/whatsapp/[employeeId]
 * Proxies incoming WhatsApp messages from Meta to the employee's container gateway.
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { employeeId } = await params

    // Get the employee's group container URL
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
      select: { id: true, status: true, groupId: true },
    })

    if (!employee || employee.status !== "ACTIVE") {
      return NextResponse.json({ error: "Employee not active" }, { status: 409 })
    }

    const group = await prisma.employeeGroup.findUnique({
      where: { id: employee.groupId },
      select: { containerPort: true, containerId: true },
    })

    if (!group?.containerId || !group.containerPort) {
      return NextResponse.json({ error: "Container not running" }, { status: 503 })
    }

    const gatewayUrl = `http://localhost:${group.containerPort}`

    // Forward the raw body and signature header to the container's /whatsapp endpoint
    const body = await req.text()
    const signature = req.headers.get("x-hub-signature-256")

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (signature) {
      headers["X-Hub-Signature-256"] = signature
    }

    const proxyRes = await fetch(`${gatewayUrl}/whatsapp`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    })

    const responseText = await proxyRes.text()

    return new Response(responseText, {
      status: proxyRes.status,
      headers: { "Content-Type": proxyRes.headers.get("Content-Type") || "application/json" },
    })
  } catch (error) {
    console.error("[WhatsApp Webhook] Proxy failed:", error)
    // Meta expects 200 to avoid retries — return 200 even on proxy failure
    // to prevent Meta from disabling the webhook
    return NextResponse.json({ received: true, proxied: false })
  }
}
