import { prisma } from "@/lib/prisma"
import type { ChannelConfig, ChannelType, ConversationData, ChannelResult, ChannelHandler } from "./types"
import { emailHandler } from "./email"
import { whatsappHandler } from "./whatsapp"
import { salesforceHandler } from "./salesforce"

const handlers: Record<Exclude<ChannelType, "PORTAL">, ChannelHandler> = {
  EMAIL: emailHandler,
  WHATSAPP: whatsappHandler,
  SALESFORCE: salesforceHandler,
}

/**
 * Get the currently configured primary channel
 */
export async function getPrimaryChannel(): Promise<ChannelConfig | null> {
  const primary = await prisma.channelConfig.findFirst({
    where: { isPrimary: true, enabled: true },
  })

  if (primary) {
    return {
      id: primary.id,
      channel: primary.channel as ChannelType,
      enabled: primary.enabled,
      isPrimary: primary.isPrimary,
      config: primary.config as Record<string, string>,
    }
  }

  // Default to Portal if no primary is set
  return {
    id: "default",
    channel: "PORTAL",
    enabled: true,
    isPrimary: true,
    config: {},
  }
}

/**
 * Get a specific channel configuration
 */
export async function getChannelConfig(channel: ChannelType): Promise<ChannelConfig | null> {
  const config = await prisma.channelConfig.findUnique({
    where: { channel },
  })

  if (!config) {
    return null
  }

  return {
    id: config.id,
    channel: config.channel as ChannelType,
    enabled: config.enabled,
    isPrimary: config.isPrimary,
    config: config.config as Record<string, string>,
  }
}

/**
 * Dispatch a conversation to the configured channel
 */
export async function dispatchToChannel(
  conversation: ConversationData,
  channelConfig: ChannelConfig
): Promise<ChannelResult> {
  const { channel, config } = channelConfig

  // Portal is handled separately (via socket)
  if (channel === "PORTAL") {
    return {
      success: true,
      message: "Routed to Portal",
      customerMessage: "You've been added to the queue. An agent will be with you shortly.",
    }
  }

  const handler = handlers[channel]
  if (!handler) {
    return {
      success: false,
      message: `Unknown channel: ${channel}`,
    }
  }

  // Validate configuration
  const validation = handler.validate(config)
  if (!validation.valid) {
    console.error(`[Channel:${channel}] Invalid configuration:`, validation.errors)
    return {
      success: false,
      message: `Channel ${channel} is not properly configured: ${validation.errors.join(", ")}`,
    }
  }

  try {
    console.log(`[Channel:${channel}] Dispatching conversation ${conversation.id}`)
    const result = await handler.dispatch(conversation, config)

    // Update conversation with external ID if provided
    if (result.success && result.externalId) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { externalId: result.externalId },
      })
    }

    return result
  } catch (error) {
    console.error(`[Channel:${channel}] Dispatch error:`, error)
    return {
      success: false,
      message: `Failed to dispatch to ${channel}: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Get the customer-facing message for a channel
 */
export function getChannelCustomerMessage(channel: ChannelType): string {
  switch (channel) {
    case "PORTAL":
      return "You've been added to the queue. An agent will be with you shortly."
    case "SALESFORCE":
      return "Your request has been submitted to our support system. An agent will contact you shortly."
    case "WHATSAPP":
      return "An agent has been notified and will reach out to you shortly. Please keep your phone handy."
    case "EMAIL":
      return "We've sent a confirmation to your email. An agent will reply within 24 hours."
    default:
      return "Your request has been submitted. An agent will contact you soon."
  }
}
