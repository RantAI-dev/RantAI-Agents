import { NextResponse } from "next/server"
import {
  EmployeeIdParamsSchema,
  EmployeeWhatsAppVerifyQuerySchema,
} from "@/features/digital-employees/whatsapp-webhooks/schema"
import {
  proxyEmployeeWhatsAppWebhook,
  verifyEmployeeWhatsAppWebhook,
} from "@/features/digital-employees/whatsapp-webhooks/service"

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
    const parsedParams = EmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return new Response("Bad request", { status: 400 })
    }

    const url = new URL(req.url)
    const parsedQuery = EmployeeWhatsAppVerifyQuerySchema.safeParse({
      mode: url.searchParams.get("hub.mode") ?? undefined,
      token: url.searchParams.get("hub.verify_token") ?? undefined,
      challenge: url.searchParams.get("hub.challenge") ?? undefined,
    })
    if (!parsedQuery.success) {
      return new Response("Bad request", { status: 400 })
    }

    const result = await verifyEmployeeWhatsAppWebhook(
      parsedParams.data.employeeId,
      parsedQuery.data
    )
    return new Response(result.text, {
      status: result.status,
      headers: { "Content-Type": result.contentType },
    })
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
    const parsedParams = EmployeeIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid route params" }, { status: 400 })
    }

    const body = await req.text()
    const signature = req.headers.get("x-hub-signature-256")

    const result = await proxyEmployeeWhatsAppWebhook({
      employeeId: parsedParams.data.employeeId,
      body,
      signature,
    })

    if (result.type === "json") {
      return NextResponse.json(result.body, { status: result.status })
    }

    return new Response(result.text, {
      status: result.status,
      headers: { "Content-Type": result.contentType },
    })
  } catch (error) {
    console.error("[WhatsApp Webhook] Proxy failed:", error)
    // Meta expects 200 to avoid retries — return 200 even on proxy failure
    // to prevent Meta from disabling the webhook
    return NextResponse.json({ received: true, proxied: false })
  }
}
