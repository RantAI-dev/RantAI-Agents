import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { SendWhatsAppBodySchema } from "@/features/digital-employees/whatsapp-webhooks/schema"
import { sendWhatsAppConversationMessage } from "@/features/digital-employees/whatsapp-webhooks/service"

/**
 * POST - Send a message to a WhatsApp user
 * Used by agents to reply to WhatsApp customers
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedBody = SendWhatsAppBodySchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Missing conversationId or message" },
        { status: 400 }
      )
    }

    const result = await sendWhatsAppConversationMessage({
      ...parsedBody.data,
      senderEmail: session.user.email,
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("[WhatsApp Send] Error:", error)
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    )
  }
}
