import twilio from "twilio"
import { prisma } from "@/lib/prisma"

interface SendMessageOptions {
  to: string
  message: string
}

interface TwilioWebhookPayload {
  MessageSid: string
  AccountSid: string
  MessagingServiceSid?: string
  From: string
  To: string
  Body: string
  NumMedia: string
  ProfileName?: string
  WaId?: string // WhatsApp ID (phone number without +)
}

class TwilioWhatsAppService {
  private client: ReturnType<typeof twilio> | null = null
  private fromNumber: string

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || ""

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken)
    }
  }

  /**
   * Send a WhatsApp message via Twilio
   */
  async sendMessage({ to, message }: SendMessageOptions) {
    if (!this.client) {
      throw new Error("Twilio client not configured")
    }

    // Format phone number for WhatsApp (must start with whatsapp:)
    const formattedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`
    const formattedFrom = this.fromNumber.startsWith("whatsapp:")
      ? this.fromNumber
      : `whatsapp:${this.fromNumber}`

    const result = await this.client.messages.create({
      body: message,
      from: formattedFrom,
      to: formattedTo,
    })

    console.log(`[Twilio WhatsApp] Message sent: ${result.sid}`)
    return result
  }

  /**
   * Parse incoming Twilio webhook payload
   */
  parseWebhookPayload(payload: TwilioWebhookPayload) {
    // Extract phone number (remove whatsapp: prefix)
    const from = payload.From.replace("whatsapp:", "")
    const customerName = payload.ProfileName || from

    return {
      from,
      fromName: customerName,
      messageId: payload.MessageSid,
      timestamp: new Date(),
      type: "text" as const,
      content: payload.Body,
    }
  }

  /**
   * Get or create a conversation for a WhatsApp user
   */
  async getOrCreateConversation(phoneNumber: string, customerName: string) {
    // Look for existing active conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        customerPhone: phoneNumber,
        channel: "WHATSAPP",
        status: { in: ["AI_ACTIVE", "WAITING_FOR_AGENT", "AGENT_CONNECTED"] },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    })

    if (!conversation) {
      // Create new conversation
      conversation = await prisma.conversation.create({
        data: {
          sessionId: `wa_${phoneNumber}_${Date.now()}`,
          customerName,
          customerPhone: phoneNumber,
          channel: "WHATSAPP",
          status: "AI_ACTIVE",
        },
        include: {
          messages: true,
        },
      })
    }

    return conversation
  }

  /**
   * Save a message to the conversation
   */
  async saveMessage(
    conversationId: string,
    role: "USER" | "ASSISTANT" | "AGENT" | "SYSTEM",
    content: string,
    metadata?: object
  ) {
    return prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      },
    })
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!(this.client && this.fromNumber)
  }
}

// Export singleton instance
export const twilioWhatsApp = new TwilioWhatsAppService()

// Export types
export type { TwilioWebhookPayload, SendMessageOptions }
