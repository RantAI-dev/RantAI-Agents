export interface ChannelConfig {
  id: string
  channel: ChannelType
  enabled: boolean
  isPrimary: boolean
  config: Record<string, string>
}

export type ChannelType = "PORTAL" | "SALESFORCE" | "WHATSAPP" | "EMAIL"

export interface ConversationData {
  id: string
  sessionId: string
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  productInterest: string | null
  messages: {
    role: string
    content: string
    createdAt: Date
  }[]
}

export interface ChannelResult {
  success: boolean
  externalId?: string
  message: string
  customerMessage?: string // Message to show to the customer
  metadata?: Record<string, unknown> // Additional channel-specific data
}

export interface ChannelHandler {
  name: string
  dispatch(conversation: ConversationData, config: Record<string, string>): Promise<ChannelResult>
  validate(config: Record<string, string>): { valid: boolean; errors: string[] }
}
