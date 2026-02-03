import { NextRequest, NextResponse } from "next/server"
import type { TwilioWebhookPayload } from "@/lib/twilio-whatsapp"

// System prompt for WhatsApp AI assistant
const WHATSAPP_SYSTEM_PROMPT = `You are a helpful insurance assistant for HorizonLife Insurance, responding via WhatsApp.

IMPORTANT GUIDELINES:
1. Keep responses concise and mobile-friendly (WhatsApp users prefer shorter messages)
2. Use simple formatting - avoid complex markdown (WhatsApp supports *bold* and _italic_)
3. Break long responses into multiple short paragraphs
4. Be conversational and friendly
5. If user wants to speak to a human agent, tell them to type "AGENT" and you will connect them

PRODUCTS:
- Life Insurance: Term Life ($15/month), Whole Life ($45/month), Universal Life
- Health Insurance: Individual ($199/month), Family ($499/month)
- Home Insurance: Basic ($75/month), Premium ($125/month)
- Auto Insurance: Starting at $89/month

When users express purchase intent or ask for quotes, encourage them to:
1. Visit our website at horizonlife.com
2. Type "AGENT" to speak with a sales representative
3. Call us at 1-800-HORIZON

Always be helpful and provide accurate information about our insurance products.`

/**
 * GET - Webhook Verification (keep for compatibility with Meta)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  console.log("[WhatsApp Webhook] Verification attempt:", { mode, token, challenge })

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[WhatsApp Webhook] Verification successful")
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }

  console.log("[WhatsApp Webhook] Verification failed")
  return new NextResponse("Forbidden", { status: 403 })
}

/**
 * POST - Receive incoming messages from Twilio
 * Twilio sends form-urlencoded data
 */
export async function POST(request: NextRequest) {
  try {
    const { twilioWhatsApp } = await import("@/lib/twilio-whatsapp")
    const { prisma } = await import("@/lib/prisma")

    // Twilio sends form-urlencoded data
    const formData = await request.formData()
    const payload: TwilioWebhookPayload = {
      MessageSid: formData.get("MessageSid") as string,
      AccountSid: formData.get("AccountSid") as string,
      From: formData.get("From") as string,
      To: formData.get("To") as string,
      Body: formData.get("Body") as string,
      NumMedia: formData.get("NumMedia") as string,
      ProfileName: (formData.get("ProfileName") as string) || undefined,
      WaId: (formData.get("WaId") as string) || undefined,
    }

    // Validate request
    if (!payload.From || !payload.Body) {
      return new NextResponse("Bad Request", { status: 400 })
    }

    // Parse the message
    const msg = twilioWhatsApp.parseWebhookPayload(payload)
    console.log(`[WhatsApp] Message from ${msg.fromName} (${msg.from}): ${msg.content}`)

    // Get or create conversation
    const conversation = await twilioWhatsApp.getOrCreateConversation(msg.from, msg.fromName)

    // Save incoming message
    await twilioWhatsApp.saveMessage(conversation.id, "USER", msg.content, {
      twilioMessageSid: msg.messageId,
    })

    // Check for agent request
    if (msg.content.toLowerCase().trim() === "agent") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: "WAITING_FOR_AGENT",
          handoffAt: new Date(),
        },
      })

      await twilioWhatsApp.sendMessage({
        to: msg.from,
        message: "I'm connecting you with a live agent now. Please wait a moment while I find someone to assist you. An agent will respond to you shortly.\n\nIn the meantime, feel free to share any additional details about your inquiry.",
      })

      await twilioWhatsApp.saveMessage(conversation.id, "SYSTEM", "Customer requested to speak with an agent")
      console.log(`[WhatsApp] Agent requested by ${msg.from}`)

      // Return TwiML response (empty is fine)
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      })
    }

    // Check if already with agent
    if (conversation.status === "AGENT_CONNECTED" || conversation.status === "WAITING_FOR_AGENT") {
      // Don't respond with AI - agent will respond
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      })
    }

    // Generate AI response
    try {
      const { streamText } = await import("ai")
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider")

      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      })

      // Get conversation history
      const recentMessages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      })

      const aiMessages = recentMessages.reverse().map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }))

      // Generate response
      const result = streamText({
        model: openrouter("openai/gpt-4o-mini"),
        system: WHATSAPP_SYSTEM_PROMPT,
        messages: aiMessages,
      })

      let fullResponse = ""
      for await (const chunk of result.textStream) {
        fullResponse += chunk
      }

      // Clean up response for WhatsApp
      fullResponse = fullResponse
        .replace(/\*\*/g, "*")
        .replace(/#{1,3}\s/g, "*")
        .trim()

      // Send response via Twilio
      await twilioWhatsApp.sendMessage({ to: msg.from, message: fullResponse })

      // Save AI response
      await twilioWhatsApp.saveMessage(conversation.id, "ASSISTANT", fullResponse)

      console.log(`[WhatsApp] Sent AI response to ${msg.from}`)
    } catch (aiError) {
      console.error("[WhatsApp] Error generating AI response:", aiError)

      await twilioWhatsApp.sendMessage({
        to: msg.from,
        message:
          "I apologize, but I'm having trouble processing your request right now. Please try again in a moment or type AGENT to speak with a human representative.",
      })
    }

    // Return TwiML response
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    })
  } catch (error) {
    console.error("[WhatsApp Webhook] Error:", error)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    })
  }
}
