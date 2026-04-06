import { prisma } from "@/lib/prisma"

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0"

interface WhatsAppMessage {
  from: string
  id: string
  timestamp: string
  type: "text" | "image" | "document" | "audio" | "video" | "location" | "contacts" | "interactive" | "button"
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string }
  document?: { id: string; mime_type: string; sha256: string; filename: string }
}

interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        contacts?: Array<{
          profile: { name: string }
          wa_id: string
        }>
        messages?: WhatsAppMessage[]
        statuses?: Array<{
          id: string
          status: "sent" | "delivered" | "read" | "failed"
          timestamp: string
          recipient_id: string
        }>
      }
      field: string
    }>
  }>
}

interface SendMessageOptions {
  to: string
  message: string
  previewUrl?: boolean
}

interface SendTemplateOptions {
  to: string
  templateName: string
  languageCode?: string
  components?: Array<{
    type: "header" | "body" | "button"
    parameters: Array<{
      type: "text" | "image" | "document"
      text?: string
      image?: { link: string }
    }>
  }>
}

class WhatsAppService {
  private accessToken: string
  private phoneNumberId: string
  private apiUrl: string

  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || ""
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || ""
    this.apiUrl = `${WHATSAPP_API_URL}/${this.phoneNumberId}`
  }

  private async request(endpoint: string, method: string = "GET", body?: object) {
    const url = `${this.apiUrl}${endpoint}`

    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error("[WhatsApp API Error]", error)
      throw new Error(`WhatsApp API error: ${response.status} - ${JSON.stringify(error)}`)
    }

    return response.json()
  }

  /**
   * Send a text message to a WhatsApp user
   */
  async sendMessage({ to, message, previewUrl = false }: SendMessageOptions) {
    return this.request("/messages", "POST", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: previewUrl,
        body: message,
      },
    })
  }

  /**
   * Send an interactive button message
   */
  async sendButtonMessage(to: string, body: string, buttons: Array<{ id: string; title: string }>) {
    return this.request("/messages", "POST", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((btn) => ({
            type: "reply",
            reply: { id: btn.id, title: btn.title },
          })),
        },
      },
    })
  }

  /**
   * Send a list message with selectable options
   */
  async sendListMessage(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string
      rows: Array<{ id: string; title: string; description?: string }>
    }>
  ) {
    return this.request("/messages", "POST", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: {
          button: buttonText,
          sections,
        },
      },
    })
  }

  /**
   * Send a template message (for initiating conversations or notifications)
   */
  async sendTemplate({ to, templateName, languageCode = "en", components }: SendTemplateOptions) {
    return this.request("/messages", "POST", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    })
  }

  /**
   * Mark a message as read
   */
  async markAsRead(messageId: string) {
    return this.request("/messages", "POST", {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    })
  }

  /**
   * Parse incoming webhook payload
   */
  parseWebhookPayload(payload: WhatsAppWebhookPayload) {
    const messages: Array<{
      from: string
      fromName: string
      messageId: string
      timestamp: Date
      type: string
      content: string
    }> = []

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field === "messages" && change.value.messages) {
          const contacts = change.value.contacts || []

          for (const msg of change.value.messages) {
            const contact = contacts.find((c) => c.wa_id === msg.from)

            let content = ""
            switch (msg.type) {
              case "text":
                content = msg.text?.body || ""
                break
              case "interactive":
              case "button":
                content = "[Interactive response]"
                break
              case "image":
                content = "[Image received]"
                break
              case "document":
                content = `[Document: ${msg.document?.filename || "file"}]`
                break
              case "audio":
                content = "[Audio message]"
                break
              case "video":
                content = "[Video message]"
                break
              case "location":
                content = "[Location shared]"
                break
              default:
                content = `[${msg.type} message]`
            }

            messages.push({
              from: msg.from,
              fromName: contact?.profile.name || msg.from,
              messageId: msg.id,
              timestamp: new Date(parseInt(msg.timestamp) * 1000),
              type: msg.type,
              content,
            })
          }
        }
      }
    }

    return messages
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
    return !!(this.accessToken && this.phoneNumberId)
  }
}

// Export singleton instance
export const whatsapp = new WhatsAppService()

// Export types for use in API routes
export type { WhatsAppWebhookPayload, WhatsAppMessage, SendMessageOptions, SendTemplateOptions }
