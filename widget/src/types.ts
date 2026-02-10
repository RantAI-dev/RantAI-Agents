export interface WidgetTheme {
  primaryColor: string
  backgroundColor: string
  textColor: string
  userBubbleColor: string
  assistantBubbleColor: string
}

export interface WidgetConfig {
  theme: WidgetTheme
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left"
  welcomeMessage: string
  placeholderText: string
  headerTitle?: string
  avatar?: string
  customCssClass?: string
}

export interface WidgetPublicConfig {
  assistantId: string
  assistantName: string
  assistantEmoji: string
  assistantDescription?: string
  liveChatEnabled: boolean
  config: WidgetConfig
  poweredByText?: string
  poweredByUrl?: string
}

export interface Message {
  id: string
  role: "user" | "assistant" | "agent"
  content: string
  timestamp: Date
}

export interface WidgetState {
  isOpen: boolean
  isLoading: boolean
  messages: Message[]
  error: string | null
  handoffState: "idle" | "requesting" | "waiting" | "connected" | "resolved"
  conversationId: string | null
}
