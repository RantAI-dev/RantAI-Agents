import { NextResponse } from "next/server"
import { EmployeeWebhookTokenParamsSchema } from "@/features/digital-employees/whatsapp-webhooks/schema"
import { processEmployeeWebhookTrigger } from "@/features/digital-employees/whatsapp-webhooks/service"

interface RouteParams {
  params: Promise<{ token: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const parsedParams = EmployeeWebhookTokenParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid route params" }, { status: 400 })
    }

    let payload: unknown = null
    try {
      payload = await req.json()
    } catch {
      payload = null
    }

    const result = await processEmployeeWebhookTrigger(parsedParams.data.token, payload)
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("Webhook processing failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
