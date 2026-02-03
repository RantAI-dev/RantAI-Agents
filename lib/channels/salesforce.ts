import type { ChannelHandler, ConversationData, ChannelResult } from "./types"

/**
 * Salesforce Messaging for In-App and Web channel handler
 *
 * This handler returns configuration for the Salesforce embedded widget
 * instead of making server-side API calls. When a customer requests an agent,
 * the frontend will display the Salesforce Messaging widget.
 */

export const salesforceHandler: ChannelHandler = {
  name: "Salesforce Messaging",

  validate(config: Record<string, string>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!config.orgId) {
      errors.push("Missing Organization ID")
    }
    if (!config.deploymentName) {
      errors.push("Missing Deployment Developer Name")
    }
    if (!config.siteUrl) {
      errors.push("Missing Embedded Service Site URL")
    }
    if (!config.scrt2Url) {
      errors.push("Missing SCRT2 URL")
    }

    // Validate Site URL format
    if (config.siteUrl && !config.siteUrl.match(/^https:\/\/[a-zA-Z0-9.-]+\.my\.site\.com\/.+$/)) {
      errors.push("Invalid Site URL format (should be https://xxx.my.site.com/ESWdeploymentname)")
    }

    // Validate SCRT2 URL format
    if (config.scrt2Url && !config.scrt2Url.match(/^https:\/\/[a-zA-Z0-9.-]+\.salesforce-scrt\.com$/)) {
      errors.push("Invalid SCRT2 URL format (should be https://xxx.salesforce-scrt.com)")
    }

    return { valid: errors.length === 0, errors }
  },

  async dispatch(
    conversation: ConversationData,
    config: Record<string, string>
  ): Promise<ChannelResult> {
    // Build pre-chat data from conversation
    const prechatData: Record<string, string> = {}

    if (conversation.customerName) {
      prechatData.name = conversation.customerName
    }
    if (conversation.customerEmail) {
      prechatData.email = conversation.customerEmail
    }
    if (conversation.customerPhone) {
      prechatData.phone = conversation.customerPhone
    }
    if (conversation.productInterest) {
      prechatData.productInterest = conversation.productInterest.replace("-", " ")
    }

    // Build conversation transcript for context
    const transcript = conversation.messages
      .slice(-10) // Last 10 messages
      .map((m) => {
        const role = m.role === "USER" ? "Customer" : m.role === "ASSISTANT" ? "AI" : m.role
        return `${role}: ${m.content.substring(0, 200)}${m.content.length > 200 ? "..." : ""}`
      })
      .join("\n")

    prechatData.conversationContext = transcript

    console.log(`[Salesforce Widget] Preparing widget config for conversation ${conversation.id}`)

    // Return widget configuration for frontend to use
    return {
      success: true,
      externalId: `sf-widget-${conversation.id}`,
      message: "Salesforce widget configuration ready",
      customerMessage: "Connecting you with a support agent...",
      metadata: {
        widgetMode: true,
        orgId: config.orgId,
        deploymentName: config.deploymentName,
        siteUrl: config.siteUrl,
        scrt2Url: config.scrt2Url,
        prechatData,
      },
    }
  },
}
