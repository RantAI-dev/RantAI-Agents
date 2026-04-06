import type { ChannelHandler, ConversationData, ChannelResult } from "./types"

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"

/**
 * WhatsApp Business channel handler
 * Sends notification to agent via WhatsApp Cloud API
 */
export const whatsappHandler: ChannelHandler = {
  name: "WhatsApp Business",

  validate(config: Record<string, string>): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const required = ["phoneNumberId", "accessToken", "agentPhoneNumber"]

    for (const field of required) {
      if (!config[field]) {
        errors.push(`Missing ${field}`)
      }
    }

    // Validate phone number format (should start with country code)
    if (config.agentPhoneNumber && !config.agentPhoneNumber.match(/^\+?[1-9]\d{6,14}$/)) {
      errors.push("Invalid agent phone number format (should include country code, e.g., +1234567890)")
    }

    return { valid: errors.length === 0, errors }
  },

  async dispatch(
    conversation: ConversationData,
    config: Record<string, string>
  ): Promise<ChannelResult> {
    const { phoneNumberId, accessToken, agentPhoneNumber, templateName } = config

    // Format the agent phone number (remove any non-digit characters except +)
    const formattedPhone = agentPhoneNumber.replace(/[^\d+]/g, "").replace("+", "")

    // Build the message content
    const customerInfo = [
      `Customer: ${conversation.customerName || "Unknown"}`,
      `Email: ${conversation.customerEmail || "Not provided"}`,
      conversation.customerPhone ? `Phone: ${conversation.customerPhone}` : null,
      `Interest: ${conversation.productInterest?.replace("-", " ") || "General inquiry"}`,
    ]
      .filter(Boolean)
      .join("\n")

    // Get last message from customer for context
    const lastUserMessage = conversation.messages
      .filter((m) => m.role === "USER")
      .pop()

    try {
      // If a template is configured, use template message
      // Otherwise, send a text message (requires 24-hour window or user-initiated)
      const messagePayload = templateName
        ? {
            messaging_product: "whatsapp",
            to: formattedPhone,
            type: "template",
            template: {
              name: templateName,
              language: { code: "en" },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: conversation.customerName || "A customer" },
                    { type: "text", text: conversation.productInterest?.replace("-", " ") || "General inquiry" },
                    { type: "text", text: conversation.customerEmail || "Not provided" },
                  ],
                },
              ],
            },
          }
        : {
            messaging_product: "whatsapp",
            to: formattedPhone,
            type: "text",
            text: {
              preview_url: false,
              body: `🔔 New Customer Request\n\n${customerInfo}\n\n📝 Latest Message:\n"${lastUserMessage?.content.slice(0, 200) || "No message"}"${lastUserMessage && lastUserMessage.content.length > 200 ? "..." : ""}\n\n⏰ ${new Date().toLocaleString()}`,
            },
          }

      const response = await fetch(
        `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messagePayload),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        console.error("[WhatsApp] API error:", data)
        return {
          success: false,
          message: `WhatsApp API error: ${data.error?.message || "Unknown error"}`,
        }
      }

      const messageId = data.messages?.[0]?.id
      console.log(`[WhatsApp] Notification sent to agent, message ID: ${messageId}`)

      return {
        success: true,
        externalId: messageId,
        message: `WhatsApp notification sent to agent`,
        customerMessage: `An agent has been notified via WhatsApp and will reach out to you shortly. Please keep your phone handy if you provided your number.`,
      }
    } catch (error) {
      console.error("[WhatsApp] Failed to send:", error)
      return {
        success: false,
        message: `Failed to send WhatsApp message: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  },
}
