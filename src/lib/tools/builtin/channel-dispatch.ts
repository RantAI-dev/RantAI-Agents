import { z } from "zod"
import { dispatchToChannel, getChannelConfig } from "@/lib/channels"
import type { ToolDefinition } from "../types"

export const channelDispatchTool: ToolDefinition = {
  name: "channel_dispatch",
  displayName: "Send via Channel",
  description:
    "Send a message or escalate a conversation to an external channel such as WhatsApp, Email, or Salesforce. Use this when the user requests to be contacted via a specific channel or when escalation is needed.",
  category: "builtin",
  parameters: z.object({
    channel: z
      .enum(["WHATSAPP", "EMAIL", "SALESFORCE"])
      .describe("The channel to dispatch to"),
    customerName: z.string().describe("Customer's name"),
    customerEmail: z.string().optional().describe("Customer's email address"),
    customerPhone: z.string().optional().describe("Customer's phone number"),
    message: z.string().describe("Summary message for the dispatch"),
  }),
  execute: async (params) => {
    const channel = params.channel as "WHATSAPP" | "EMAIL" | "SALESFORCE"
    const channelConfig = await getChannelConfig(channel)

    if (!channelConfig || !channelConfig.enabled) {
      return {
        success: false,
        message: `Channel ${channel} is not configured or enabled`,
      }
    }

    const result = await dispatchToChannel(
      {
        id: `tool-dispatch-${Date.now()}`,
        sessionId: `tool-session-${Date.now()}`,
        customerName: params.customerName as string,
        customerEmail: (params.customerEmail as string) || undefined,
        customerPhone: (params.customerPhone as string) || undefined,
        messages: [
          {
            role: "system",
            content: params.message as string,
            createdAt: new Date(),
          },
        ],
      },
      channelConfig
    )

    return {
      success: result.success,
      message: result.message,
      externalId: result.externalId,
    }
  },
}
