/**
 * Widget configuration types for embeddable chat
 */

export interface WidgetTheme {
  primaryColor: string
  backgroundColor: string
  textColor: string
  userBubbleColor: string
  assistantBubbleColor: string
}

export interface WidgetLauncherConfig {
  text?: string
  icon?: string // URL or emoji
  backgroundColor?: string
  textColor?: string
}

export interface WidgetConfig {
  // Appearance
  theme: WidgetTheme
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left"

  // Content
  welcomeMessage: string
  placeholderText: string
  headerTitle?: string

  // Customization
  avatar?: string // URL or base64
  customCssClass?: string
  launcherButton?: WidgetLauncherConfig

  // Behavior
  autoOpen?: boolean
  autoOpenDelay?: number // ms
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  theme: {
    primaryColor: "#3b82f6",
    backgroundColor: "#ffffff",
    textColor: "#1f2937",
    userBubbleColor: "#3b82f6",
    assistantBubbleColor: "#f3f4f6",
  },
  position: "bottom-right",
  welcomeMessage: "Hi! How can I help you today?",
  placeholderText: "Type your message...",
  headerTitle: "Chat with us",
}

export interface EmbedApiKeyInput {
  name: string
  assistantId: string
  allowedDomains?: string[]
  config?: Partial<WidgetConfig>
}

export interface EmbedApiKeyResponse {
  id: string
  name: string
  key: string
  assistantId: string
  allowedDomains: string[]
  config: WidgetConfig
  requestCount: number
  lastUsedAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  assistant?: {
    id: string
    name: string
    emoji: string
  }
}

export interface WidgetPublicConfig {
  assistantId: string
  assistantName: string
  assistantEmoji: string
  config: WidgetConfig
}
