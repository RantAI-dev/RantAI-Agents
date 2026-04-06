import { NextRequest, NextResponse } from "next/server"
import {
  GlobalWhatsAppVerifyQuerySchema,
  TwilioWebhookFormSchema,
} from "@/features/digital-employees/whatsapp-webhooks/schema"
import {
  handleTwilioWhatsAppWebhook,
  verifyGlobalWhatsAppWebhook,
} from "@/features/digital-employees/whatsapp-webhooks/service"

/**
 * GET - Webhook Verification (keep for compatibility with Meta)
 */
export async function GET(request: NextRequest) {
  const parsedQuery = GlobalWhatsAppVerifyQuerySchema.safeParse({
    mode: request.nextUrl.searchParams.get("hub.mode") ?? undefined,
    token: request.nextUrl.searchParams.get("hub.verify_token") ?? undefined,
    challenge: request.nextUrl.searchParams.get("hub.challenge") ?? undefined,
  })
  if (!parsedQuery.success) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const result = verifyGlobalWhatsAppWebhook(parsedQuery.data)
  return new Response(result.text, {
    status: result.status,
    headers: { "Content-Type": result.contentType },
  })
}

/**
 * POST - Receive incoming messages from Twilio
 * Twilio sends form-urlencoded data
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const parsedBody = TwilioWebhookFormSchema.safeParse({
    MessageSid: formData.get("MessageSid")?.toString(),
    AccountSid: formData.get("AccountSid")?.toString(),
    From: formData.get("From")?.toString(),
    To: formData.get("To")?.toString(),
    Body: formData.get("Body")?.toString(),
    NumMedia: formData.get("NumMedia")?.toString(),
    ProfileName: formData.get("ProfileName")?.toString(),
    WaId: formData.get("WaId")?.toString(),
  })

  if (!parsedBody.success) {
    return new NextResponse("Bad Request", { status: 400 })
  }

  const result = await handleTwilioWhatsAppWebhook(parsedBody.data)
  return new NextResponse(result.text, {
    status: result.status,
    headers: { "Content-Type": result.contentType },
  })
}
